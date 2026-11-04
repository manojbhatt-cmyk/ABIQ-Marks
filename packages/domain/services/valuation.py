"""Gate G1 (Q14): pricing panel, indicative cross-check, Challenge Assistant (A5), decision, send-back (loop QA)."""
from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from agents.assistants import a5_challenge
from agents.runtime import agent_run, rewrite, step, suggest
from connectors import writeback
from connectors.mailbox import mailbox
from connectors.object_store import get_store
from domain import metrics as M
from domain.models import (AgentSuggestion, CommitteeDecision, CycleLoan, DocumentPage, EmailMessage,
                           LincolnValuation, ValuationCrosscheck, ValuationCycle, ValuationDecision)
from domain.services.cmrs import attach_mark, latest_cmr
from domain.services.core import (Actor, BusinessRuleError, audit, bump_loop, notify, now, require, rule, rule_meta)
from domain.services.cycle import complete_tasks
from domain.services.intake import loan_documents
from domain.services.lincoln import latest_valuation, slug, valuation_dict
from domain.services.spreads import covenant_result, current_spread, metric_values
from domain.services.tracker import recompute


def years_to_maturity(cl: CycleLoan, cyc: ValuationCycle) -> float:
    return round((cl.maturity_date - cyc.day0_date).days / 365.25, 2)


def crosscheck(session: Session, lv: LincolnValuation, cl: CycleLoan, required_yield: float | None = None) -> dict:
    cyc = session.get(ValuationCycle, cl.cycle_id)
    y = required_yield if required_yield is not None else (lv.required_yield or cl.coupon_rate)
    yrs = years_to_maturity(cl, cyc)
    price = M.indicative_price(cl.coupon_rate, round(yrs), y)
    if required_yield is None and not session.query(ValuationCrosscheck).filter_by(lincoln_valuation_id=lv.id).first():
        session.add(ValuationCrosscheck(lincoln_valuation_id=lv.id, coupon_rate=cl.coupon_rate, years_to_maturity=yrs,
                                        required_yield=y, indicative_price=price,
                                        note="Indicative, not a mark: annual coupon discounted at the required yield"))
    return {"coupon": cl.coupon_rate, "years": round(yrs), "years_exact": yrs, "required_yield": y,
            "indicative_price": price, "label": "indicative, not a mark"}


def sponsor_equity(session: Session, cl: CycleLoan) -> dict | None:
    for d in loan_documents(session, cl):
        if d.doc_type != "sponsor_letter":
            continue
        text = " ".join(" ".join(p.text.split()) for p in session.query(DocumentPage).filter_by(document_id=d.id))
        m = re.search(r"([A-Z][\w]*(?: [A-Z][\w]*){0,3}) hereby confirms its commitment to contribute \$([\d.]+) million", text)
        if m:
            date_m = re.search(r"(\d{1,2} \w+ 2026)", text)
            return {"sponsor": m.group(1).strip(), "amount": float(m.group(2)),
                    "date": (date_m.group(1) if date_m else "n/a").replace(" October", " Oct"),
                    "received": "30 Oct" if "30 October" in text else None,
                    "evidence": [{"doc_id": d.id, "file": d.file_name, "page": 1}]}
    return None


def pricing_view(session: Session, cycle_loan_id: str) -> dict:
    cl = session.get(CycleLoan, cycle_loan_id)
    cyc = session.get(ValuationCycle, cl.cycle_id)
    lvs = session.query(LincolnValuation).filter_by(cycle_loan_id=cl.id).order_by(LincolnValuation.version).all()
    lv = lvs[-1] if lvs else None
    cmr = latest_cmr(session, cl.id)
    from domain.models import CmrRecommendation

    rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first() if cmr else None
    decisions = session.query(ValuationDecision).filter_by(cycle_loan_id=cl.id).order_by(ValuationDecision.decided_at).all()
    mets = metric_values(session, cl.id)
    eq = sponsor_equity(session, cl)
    challenge = session.query(AgentSuggestion).filter_by(target_entity_type="cycle_loan", target_entity_id=cl.id,
                                                         kind="challenge").order_by(AgentSuggestion.created_at.desc()).first()
    qf = session.query(CommitteeDecision).filter_by(cycle_loan_id=cl.id, outcome="send_back").order_by(
        CommitteeDecision.recorded_at.desc()).first()
    return {
        "loan": {"id": cl.id, "borrower": cl.borrower, "facility_id": cl.facility_id, "previous_mark": cl.previous_mark,
                 "team": cl.team_name, "deal_team_id": cl.deal_team_id, "status": cl.status,
                 "loops": cl.loop_counts_json or {}, "funded": cl.funded_amount},
        "versions": [valuation_dict(v) for v in lvs],
        "crosscheck": crosscheck(session, lv, cl) if lv else None,
        "knows": {"recommendation": {"rating": rec.proposed_rating, "previous_rating": rec.previous_rating,
                                     "direction": rec.expected_mark_direction, "watchlist": rec.watchlist_action,
                                     "waiver": rec.waiver_requested} if rec else None,
                  "covenant": covenant_result(session, cl.id), "metrics": mets,
                  "net_leverage_after_equity": round((mets["TOTAL_DEBT"] - eq["amount"]) / mets["LTM_ADJ_EBITDA"], 4)
                  if eq and mets.get("LTM_ADJ_EBITDA") else None, "sponsor_equity": eq,
                  "cmr_status": cmr.status if cmr else None},
        "challenge": {"id": challenge.id, "payload": challenge.payload_json, "status": challenge.status}
        if challenge else None,
        "decisions": [{"id": d.id, "outcome": d.outcome, "mark": d.approved_mark, "rationale": d.rationale,
                       "reason_category": d.reason_category, "note": d.note, "decided_by": d.decided_by,
                       "decided_at": d.decided_at.isoformat(), "loop_no": d.loop_no, "box_note": d.send_back_note_path,
                       "lincoln_version": session.get(LincolnValuation, d.lincoln_valuation_id).version
                       if d.lincoln_valuation_id else None} for d in decisions],
        "committee_note": {"rationale": qf.rationale, "to": qf.send_back_to} if qf else None,
        "rules": {"allow_different_mark": rule_meta(session, "g1.allow_different_mark"),
                  "co_decision": rule_meta(session, "g1.co_decision_required"),
                  "max_loops": rule(session, "g1.max_send_back_loops", 3)},
        "ready": bool(lv and lv.loaded_to_everest and cmr and cmr.status in ("filed", "agreed")),
        "period": cyc.period,
    }


def run_challenge(session: Session, actor: Actor, cycle_loan_id: str) -> AgentSuggestion:
    cl = session.get(CycleLoan, cycle_loan_id)
    require(actor, "g1.decide", team=cl.deal_team_id)
    lv = latest_valuation(session, cl.id)
    if not lv:
        raise BusinessRuleError("No Lincoln valuation yet")
    mets = metric_values(session, cl.id)
    cov = covenant_result(session, cl.id)
    with agent_run(session, "A5", "challenge_assistant", cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
                   input_summary=f"{cl.borrower} Lincoln v{lv.version}") as run:
        step(run, "read_lincoln_assumptions", lv.key_assumptions)
        eq = sponsor_equity(session, cl)
        step(run, "search_package", {"sponsor_equity": bool(eq)})
        step(run, "read_spread", {k: mets.get(k) for k in ("TOTAL_DEBT", "LTM_ADJ_EBITDA", "LEVERAGE")})
        res = a5_challenge({"lincoln_assumptions": lv.key_assumptions, "sponsor_equity": eq, "metrics": mets,
                            "covenant_threshold": cov.get("threshold", 0)})
        if res["draft_note"]:
            res["draft_note"] = rewrite(run, res["draft_note"], "Keep it a short note to Lincoln.", heavy=True)
        sp = current_spread(session, cl.id)
        res["evidence"] = (eq["evidence"] if eq else []) + ([{"spread_id": sp.written_back_spread_id or sp.id,
                                                              "lines": ["TOTAL_DEBT", "CASH", "LTM_ADJ_EBITDA"]}] if sp else [])
        res["lincoln_version"] = lv.version
        s = suggest(session, run, "challenge", "cycle_loan", cl.id, res, 0.85 if res["differences"] else 0.6)
        run.output_summary = res["summary"]
    audit(session, actor, "agent_run.completed", "agent_run", run.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"component": "A5", "differences": len(res["differences"])}, agent_run_id=run.id)
    return s


def decide_g1(session: Session, actor: Actor, cycle_loan_id: str, outcome: str, *, mark: float | None = None,
              rationale: str = "", reason_category: str | None = None, note: str = "",
              evidence: list | None = None, used_tiq_draft: bool = False, co_decided_by: str | None = None) -> ValuationDecision:
    cl = session.get(CycleLoan, cycle_loan_id)
    require(actor, "g1.decide", team=cl.deal_team_id)
    cyc = session.get(ValuationCycle, cl.cycle_id)
    lv = latest_valuation(session, cl.id)
    cmr = latest_cmr(session, cl.id)
    if not lv or not lv.loaded_to_everest:
        raise BusinessRuleError("Lincoln's draft mark must be loaded to Everest (Q12) before G1")
    if not cmr or cmr.status not in ("filed", "agreed"):
        raise BusinessRuleError("The CMR must be filed (Q8) before G1")
    if rule(session, "g1.co_decision_required", False) and not co_decided_by:
        raise BusinessRuleError("The Deal Team lead must co-decide")
    loop_no = (cl.loop_counts_json or {}).get("QA", 0)
    d = ValuationDecision(cycle_loan_id=cl.id, lincoln_valuation_id=lv.id, loop_no=loop_no, outcome=outcome,
                          decided_by=actor.email, co_decided_by=co_decided_by, decided_at=now(),
                          decided_day=cyc.current_day, evidence_json=evidence or [])
    if outcome == "approved":
        d.approved_mark = lv.point_estimate
    elif outcome == "approved_different_mark":
        if not rule(session, "g1.allow_different_mark", True):
            raise BusinessRuleError("Approving at a different mark is not allowed by the rules")
        if mark is None or not rationale:
            raise BusinessRuleError("A mark and a rationale are mandatory for approve at a different mark")
        d.approved_mark, d.rationale = float(mark), rationale
    elif outcome == "sent_back":
        if not reason_category or not note:
            raise BusinessRuleError("A reason category and a note are required to send back")
        if loop_no >= int(rule(session, "g1.max_send_back_loops", 3)):
            raise BusinessRuleError("Maximum send-back loops reached; escalate to the committee")
        d.reason_category, d.note = reason_category, note
    else:
        raise BusinessRuleError("Unknown outcome")
    session.add(d)
    session.flush()
    challenge = session.query(AgentSuggestion).filter_by(target_entity_type="cycle_loan", target_entity_id=cl.id,
                                                         kind="challenge", status="proposed").first()
    if challenge:
        d.challenge_agent_run_id = challenge.agent_run_id
        if outcome == "sent_back":
            challenge.status = "accepted" if used_tiq_draft and note == challenge.payload_json.get("draft_note") else (
                "edited" if used_tiq_draft else "rejected")
        else:
            challenge.status = "rejected"
        challenge.decided_by, challenge.decided_at = actor.email, now()
    key = {"FACILITY_ID": cl.facility_id, "PERIOD": cyc.period}
    if outcome == "sent_back":
        n = bump_loop(cl, "QA")
        path = f"{cyc.period}/{slug(cl.borrower)}/send-back-v{n}.json"
        payload = {"facility_id": cl.facility_id, "period": cyc.period, "lincoln_version_challenged": lv.version,
                   "decided_by": actor.email, "decided_at": d.decided_at.isoformat(), "reason_category": reason_category,
                   "note": note, "evidence": evidence or (challenge.payload_json.get("evidence") if challenge else [])}
        get_store().put("box", path, json.dumps(payload, indent=2).encode())
        d.send_back_note_path = path
        msg_id, eml = mailbox.send(actor.email, ["analyst@lincoln.example"],
                                   f"{cl.borrower}: Deal Team send-back on Lincoln draft v{lv.version}", note,
                                   cc=["pm.analyst@ab-poc.local"])
        session.add(EmailMessage(direction="out", message_id=msg_id, thread_id=msg_id, from_addr=actor.email,
                                 to_addrs=["analyst@lincoln.example"], subject=f"{cl.borrower}: send-back v{lv.version}",
                                 body_text=note, sent_at=now(), template_code="send_back", cycle_id=cyc.id,
                                 matched_facility_id=cl.facility_id, cycle_day=cyc.current_day, eml_path=eml, status="sent"))
        writeback.upsert(session, "EVEREST", "PRICING_PANEL", key,
                         {"DEAL_TEAM_STATUS": "sent_back", "SEND_BACK_REASON": reason_category,
                          "DEAL_TEAM_DECIDED_BY": actor.email,
                          "DEAL_TEAM_DECIDED_AT": d.decided_at.isoformat(timespec="seconds")[:19]},
                         actor=actor.email, tiq_entity_type="valuation_decision", tiq_entity_id=d.id)
        cl.status, cl.lincoln_track_status, cl.lincoln_step, cl.current_step = "waiting_on_lincoln", "drafting", "Q10", "Q10"
        notify(session, ["analyst@lincoln.example", "pm.analyst@ab-poc.local"], "send_back",
               f"{cl.borrower}: send-back note in Box", note, entity_type="valuation_decision", entity_id=d.id,
               cycle_id=cyc.id)
        audit(session, actor, "lincoln_note.shared", "valuation_decision", d.id, cycle_id=cyc.id, cycle_loan_id=cl.id,
              after={"path": f"box/{path}", "loop": f"QA x{n}"})
    else:
        writeback.upsert(session, "EVEREST", "PRICING_PANEL", key,
                         {"DEAL_TEAM_STATUS": "approved", "DEAL_TEAM_MARK": d.approved_mark,
                          "DEAL_TEAM_DECIDED_BY": actor.email,
                          "DEAL_TEAM_DECIDED_AT": d.decided_at.isoformat(timespec="seconds")[:19],
                          "FINAL_MARK": d.approved_mark},
                         actor=actor.email, tiq_entity_type="valuation_decision", tiq_entity_id=d.id)
        cl.status, cl.current_step = "approved", "Q15"
        complete_tasks(session, cl.id, "Q14", actor)
        attach_mark(session, actor, cl.id, d)
        if cl.on_agenda is None:
            cl.on_agenda = False
    audit(session, actor, "valuation_decision.approved" if outcome != "sent_back" else "valuation_decision.sent_back",
          "valuation_decision", d.id, cycle_id=cyc.id, cycle_loan_id=cl.id,
          after={"outcome": outcome, "mark": d.approved_mark, "lincoln_version": lv.version,
                 "rationale": rationale or None, "reason_category": reason_category,
                 "outside_range": d.approved_mark is not None and not (lv.range_low <= d.approved_mark <= lv.range_high)},
          evidence=evidence, agent_run_id=d.challenge_agent_run_id)
    audit(session, actor, "everest.pricing_panel_status_written", "valuation_decision", d.id, cycle_id=cyc.id,
          cycle_loan_id=cl.id, after={"status": "sent_back" if outcome == "sent_back" else "approved"})
    recompute(session, cyc.id, "g1")
    return d
