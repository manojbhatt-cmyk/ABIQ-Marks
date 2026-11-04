"""Monthly cycle (M1 to M6): update file, requests, proposals (A10), DDTL rebalance, consolidation, approval."""
from __future__ import annotations

import io
from datetime import date

from openpyxl import Workbook
from sqlalchemy.orm import Session

from agents.assistants import a10_rationale
from agents.runtime import agent_run, step, suggest
from connectors.mailbox import mailbox
from connectors.object_store import get_store
from connectors.warehouse import get_warehouse
from domain.models import (AgentSuggestion, ApprovalRequest, CycleLoan, DdtlRebalance, EmailMessage, MonthlyDecision,
                           MonthlyMarkProposal, MonthlyMarksFile, MonthlyUpdateRow, ValuationCycle)
from domain.services.core import (Actor, BusinessRuleError, audit, bump_loop, now, require, rule, rule_meta,
                                  users_by_role)


def create_monthly_cycle(session: Session, actor: Actor, period: str = "2026-10", day0: date = date(2026, 10, 31)) -> ValuationCycle:
    require(actor, "monthly.manage")
    cyc = session.query(ValuationCycle).filter_by(cycle_type="monthly", period=period).first()
    if cyc:
        return cyc
    cyc = ValuationCycle(cycle_type="monthly", period=period, day0_date=day0, deadline_date=date(2026, 11, 10),
                         status="open", opened_by=actor.email, current_day=1)
    session.add(cyc)
    session.flush()
    audit(session, actor, "cycle.created", "valuation_cycle", cyc.id, cycle_id=cyc.id, after={"period": period,
                                                                                            "type": "monthly"})
    return cyc


def _quarter_marks(session: Session) -> dict:
    q = session.query(ValuationCycle).filter_by(cycle_type="quarterly").order_by(ValuationCycle.day0_date.desc()).first()
    out = {}
    if q:
        from domain.models import MarksTrackerRow

        for r in session.query(MarksTrackerRow).filter_by(cycle_id=q.id):
            out[r.facility_id] = {"mark": r.final_mark or r.committee_mark or r.deal_team_mark or r.previous_mark,
                                  "low": r.lincoln_range_low, "high": r.lincoln_range_high}
    return out


def build_update_file(session: Session, actor: Actor, cycle_id: str) -> list[MonthlyUpdateRow]:
    """M1: from the pacing file, the Sigma snapshot and watchlist call notes in Snowflake."""
    require(actor, "monthly.manage")
    cyc = session.get(ValuationCycle, cycle_id)
    wh = get_warehouse()
    sigma = {r["FACILITY_ID"]: r for r in wh.query("select * from SIGMA.PORTFOLIO_SNAPSHOT where AS_OF_MONTH = ?", [cyc.period])}
    pacing = {r["FACILITY_ID"]: r for r in wh.query("select * from FINANCE.PACING_FILE where AS_OF_MONTH = ?", [cyc.period])}
    notes: dict[str, list] = {}
    for n in wh.query("select * from FINANCE.WATCHLIST_CALL_NOTE"):
        notes.setdefault(n["FACILITY_ID"], []).append({k: str(v) for k, v in n.items() if k in ("CALL_DATE", "NOTE_TEXT", "ATTENDEES")})
    facs = wh.query("select f.FACILITY_ID, f.FACILITY_TYPE, b.SHORT_NAME, dt.DEAL_TEAM_ID, dt.TEAM_NAME from "
                    "DEALCLOUD.FACILITY f join DEALCLOUD.DEAL d on d.DEAL_ID = f.DEAL_ID join DEALCLOUD.BORROWER b on "
                    "b.BORROWER_ID = d.BORROWER_ID join DEALCLOUD.DEAL_TEAM dt on dt.DEAL_TEAM_ID = d.DEAL_TEAM_ID "
                    "where f.FACILITY_TYPE <> 'revolver' order by f.FACILITY_ID")
    qm = _quarter_marks(session)
    version = 1 + max([r.version for r in session.query(MonthlyUpdateRow).filter_by(cycle_id=cycle_id)] or [0])
    session.query(MonthlyUpdateRow).filter_by(cycle_id=cycle_id).delete()
    rows = []
    for f in facs:
        fid = f["FACILITY_ID"]
        sg, pc = sigma.get(fid), pacing.get(fid)
        missing = [n for n, v in (("pacing", pc), ("sigma", sg)) if not v]
        r = MonthlyUpdateRow(cycle_id=cycle_id, facility_id=fid, borrower=f["SHORT_NAME"], deal_team_id=f["DEAL_TEAM_ID"],
                             team_name=f["TEAM_NAME"], facility_type=f["FACILITY_TYPE"],
                             current_mark=(qm.get(fid) or {}).get("mark") or (sg or {}).get("CURRENT_MARK"),
                             pacing_json={k: (str(v) if isinstance(v, date) else v) for k, v in (pc or {}).items() if k not in ("LOADED_AT",)},
                             sigma_json={k: (str(v) if isinstance(v, date) else v) for k, v in (sg or {}).items()},
                             watchlist_notes_json=notes.get(fid, []),
                             completeness_status="complete" if not missing else f"missing {', '.join(missing)}",
                             status="not_started", version=version)
        session.add(r)
        rows.append(r)
    session.flush()
    for r in session.query(DdtlRebalance).filter_by(cycle_id=cycle_id):
        pass
    _build_ddtl(session, cyc)
    audit(session, actor, "monthly_update_file.built", "valuation_cycle", cycle_id, cycle_id=cycle_id,
          after={"rows": len(rows), "version": version, "incomplete": [r.facility_id for r in rows if r.completeness_status != "complete"]})
    return rows


def _build_ddtl(session: Session, cyc: ValuationCycle) -> None:
    wh = get_warehouse()
    for c in wh.query("select * from SENTRY.DDTL_COMMITMENT"):
        if session.query(DdtlRebalance).filter_by(cycle_id=cyc.id, facility_id=c["FACILITY_ID"]).first():
            continue
        draws = wh.query("select sum(AMOUNT) A from SENTRY.DRAW where FACILITY_ID = ? and DRAW_DATE between ? and ?",
                         [c["FACILITY_ID"], date(2026, 10, 1), cyc.day0_date])[0]["A"] or 0.0
        drawn = c["DRAWN_TO_DATE"]
        session.add(DdtlRebalance(cycle_id=cyc.id, facility_id=c["FACILITY_ID"], total_commitment=c["TOTAL_COMMITMENT"],
                                  drawn_before=drawn, draws_in_month=draws, funded_after=drawn + draws,
                                  unfunded_after=c["TOTAL_COMMITMENT"] - drawn - draws,
                                  mark_applied_to=rule(session, "monthly.ddtl.mark_applied_to", "funded"), assumed_rule=True))


def email_teams(session: Session, actor: Actor, cycle_id: str) -> list[EmailMessage]:
    """M2: one request per deal team listing its loans and anything flagged missing."""
    require(actor, "monthly.manage")
    cyc = session.get(ValuationCycle, cycle_id)
    rows = session.query(MonthlyUpdateRow).filter_by(cycle_id=cycle_id).all()
    if not rows:
        raise BusinessRuleError("Build the update file first (M1)")
    teams: dict[str, list] = {}
    for r in rows:
        teams.setdefault(r.deal_team_id, []).append(r)
    out = []
    from synth.portfolio import team_emails

    for tid, rs in sorted(teams.items()):
        e = team_emails(tid)
        body = (f"Hello {rs[0].team_name},\n\nPlease propose {cyc.period} monthly marks with commentary for:\n"
                + "\n".join(f"- {r.borrower} ({r.facility_id}): current mark {r.current_mark:.2f}"
                            f"{'' if r.completeness_status == 'complete' else ' (' + r.completeness_status + ')'}" for r in rs)
                + "\n\nDue 5 November 2026.\n\nPM Team")
        msg_id, eml = mailbox.send(actor.email, [e["lead"], e["analyst"]], f"{cyc.period} monthly marks: proposals due 5 Nov", body)
        m = EmailMessage(direction="out", message_id=msg_id, thread_id=msg_id, from_addr=actor.email,
                         to_addrs=[e["lead"], e["analyst"]], subject=f"{cyc.period} monthly marks: proposals due 5 Nov",
                         body_text=body, sent_at=now(), template_code="monthly_request", cycle_id=cycle_id,
                         eml_path=eml, status="sent")
        session.add(m)
        out.append(m)
        for r in rs:
            r.status = "requested"
    session.flush()
    audit(session, actor, "email.sent", "valuation_cycle", cycle_id, cycle_id=cycle_id,
          after={"template": "monthly_request", "teams": len(out)})
    return out


def draft_rationale(session: Session, actor: Actor, cycle_id: str, facility_id: str, proposed_mark: float) -> dict:
    """A10 drafts a rationale only after the analyst has entered a mark."""
    require(actor, "monthly.propose")
    if proposed_mark is None:
        raise BusinessRuleError("Enter a proposed mark first")
    r = session.query(MonthlyUpdateRow).filter_by(cycle_id=cycle_id, facility_id=facility_id).first()
    require(actor, "monthly.propose", team=r.deal_team_id)
    with agent_run(session, "A10", "monthly_mark_assistant", cycle_id=cycle_id, input_summary=f"{facility_id} {proposed_mark}") as run:
        text = a10_rationale({"current_mark": r.current_mark, "sigma": r.sigma_json, "pacing": r.pacing_json,
                              "notes": r.watchlist_notes_json}, proposed_mark)
        step(run, "draft", {"facility": facility_id})
        s = suggest(session, run, "monthly_rationale", "monthly_update_row", r.id, {"rationale": text,
                                                                                   "proposed_mark": proposed_mark}, 0.8)
    return {"suggestion_id": s.id, "rationale": text, "agent_run_id": run.id}


def submit_proposal(session: Session, actor: Actor, cycle_id: str, facility_id: str, proposed_mark: float,
                    rationale: str, suggestion_id: str | None = None) -> MonthlyMarkProposal:
    require(actor, "monthly.propose")
    r = session.query(MonthlyUpdateRow).filter_by(cycle_id=cycle_id, facility_id=facility_id).first()
    require(actor, "monthly.propose", team=r.deal_team_id)
    if not rationale:
        raise BusinessRuleError("Commentary and rationale are required")
    version = session.query(MonthlyMarkProposal).filter_by(cycle_id=cycle_id, facility_id=facility_id).count() + 1
    p = MonthlyMarkProposal(cycle_id=cycle_id, facility_id=facility_id, version=version, proposed_mark=proposed_mark,
                            rationale=rationale, proposed_by=actor.email, proposed_at=now(), status="submitted")
    if suggestion_id:
        s = session.get(AgentSuggestion, suggestion_id)
        if s:
            s.status = "accepted" if s.payload_json.get("rationale") == rationale else "edited"
            s.decided_by, s.decided_at = actor.email, now()
            p.assistant_agent_run_id = s.agent_run_id
    session.add(p)
    r.status = "proposed"
    session.flush()
    audit(session, actor, "monthly_mark_proposal.submitted", "monthly_mark_proposal", p.id, cycle_id=cycle_id,
          after={"facility_id": facility_id, "mark": proposed_mark, "version": version})
    return p


def confirm_ddtl(session: Session, actor: Actor, rebalance_id: str) -> DdtlRebalance:
    require(actor, "monthly.propose")
    d = session.get(DdtlRebalance, rebalance_id)
    if abs((d.funded_after + d.unfunded_after) - d.total_commitment) > 1e-6 or \
            abs(d.drawn_before + d.draws_in_month - d.funded_after) > 1e-6:
        raise BusinessRuleError("DDTL amounts do not add up")
    d.confirmed_by, d.confirmed_at = actor.email, now()
    audit(session, actor, "ddtl_rebalance.confirmed", "ddtl_rebalance", d.id, cycle_id=d.cycle_id,
          after={"facility_id": d.facility_id, "funded_after": d.funded_after, "unfunded_after": d.unfunded_after,
                 "mark_applied_to": d.mark_applied_to})
    return d


def consolidate(session: Session, actor: Actor, cycle_id: str) -> MonthlyMarksFile:
    """M5: consolidate the latest submitted proposals into one file."""
    require(actor, "monthly.manage")
    cyc = session.get(ValuationCycle, cycle_id)
    rows = []
    for r in session.query(MonthlyUpdateRow).filter_by(cycle_id=cycle_id).order_by(MonthlyUpdateRow.facility_id):
        p = session.query(MonthlyMarkProposal).filter_by(cycle_id=cycle_id, facility_id=r.facility_id).order_by(
            MonthlyMarkProposal.version.desc()).first()
        rows.append({"facility_id": r.facility_id, "borrower": r.borrower, "team": r.team_name,
                     "current_mark": r.current_mark, "proposed_mark": p.proposed_mark if p else None,
                     "rationale": p.rationale if p else None, "status": p.status if p else "outstanding"})
    outstanding = [x["facility_id"] for x in rows if x["proposed_mark"] is None]
    if outstanding:
        raise BusinessRuleError(f"Proposals outstanding: {', '.join(outstanding)}. Chase the teams first.")
    pending = [d.facility_id for d in session.query(DdtlRebalance).filter_by(cycle_id=cycle_id) if not d.confirmed_by]
    if pending:
        raise BusinessRuleError(f"DDTL rebalance pending: {', '.join(pending)}")
    version = session.query(MonthlyMarksFile).filter_by(cycle_id=cycle_id).count() + 1
    wb = Workbook()
    ws = wb.active
    ws.title = "Monthly marks"
    ws.append(["Facility", "Borrower", "Team", "Current mark", "Proposed mark", "Rationale"])
    for x in rows:
        ws.append([x["facility_id"], x["borrower"], x["team"], x["current_mark"], x["proposed_mark"], x["rationale"]])
    buf = io.BytesIO()
    wb.save(buf)
    path = f"Approvals/{cyc.period}/monthly-marks-v{version}.xlsx"
    get_store().put("onedrive", path, buf.getvalue())
    f = MonthlyMarksFile(cycle_id=cycle_id, version=version, rows_json=rows, xlsx_path=path, consolidated_by=actor.email,
                         consolidated_at=now())
    session.add(f)
    session.flush()
    audit(session, actor, "monthly_marks_file.consolidated", "monthly_marks_file", f.id, cycle_id=cycle_id,
          after={"version": version, "rows": len(rows)})
    return f


def request_monthly_approval(session: Session, actor: Actor, cycle_id: str) -> ApprovalRequest:
    require(actor, "monthly.manage")
    f = session.query(MonthlyMarksFile).filter_by(cycle_id=cycle_id).order_by(MonthlyMarksFile.version.desc()).first()
    if not f:
        raise BusinessRuleError("Consolidate first")
    cyc = session.get(ValuationCycle, cycle_id)
    to = [u.email for r in ("committee_member", "committee_chair") for u in users_by_role(session, r)]
    body = "Dear Committee,\n\nConsolidated monthly marks:\n" + "\n".join(
        f"- {x['borrower']}: {x['current_mark']:.2f} to {x['proposed_mark']:.2f}" for x in f.rows_json) + "\n\nPM Team"
    msg_id, eml = mailbox.send(actor.email, to, f"{cyc.period} monthly marks for approval", body)
    m = EmailMessage(direction="out", message_id=msg_id, thread_id=msg_id, from_addr=actor.email, to_addrs=to,
                     subject=f"{cyc.period} monthly marks for approval", body_text=body, sent_at=now(),
                     template_code="monthly_approval_request", cycle_id=cycle_id, eml_path=eml, status="sent")
    session.add(m)
    session.flush()
    req = ApprovalRequest(cycle_id=cycle_id, kind="monthly_marks", schedule_json=f.rows_json, changes_json=[],
                          sent_email_message_id=m.id, requested_by=actor.email, requested_at=now(), status="pending")
    session.add(req)
    session.flush()
    audit(session, actor, "approval_request.sent", "approval_request", req.id, cycle_id=cycle_id,
          after={"kind": "monthly_marks", "rows": len(f.rows_json)})
    return req


def decide_monthly(session: Session, actor: Actor, cycle_id: str, facility_id: str, outcome: str,
                   rationale: str = "") -> MonthlyDecision:
    require(actor, "monthly.decide")
    p = session.query(MonthlyMarkProposal).filter_by(cycle_id=cycle_id, facility_id=facility_id).order_by(
        MonthlyMarkProposal.version.desc()).first()
    if not p:
        raise BusinessRuleError("No proposal for this loan")
    if outcome == "pushed_back" and not rationale:
        raise BusinessRuleError("A rationale is required to push back")
    d = MonthlyDecision(cycle_id=cycle_id, facility_id=facility_id, outcome=outcome,
                        approved_mark=p.proposed_mark if outcome == "approved" else None, rationale=rationale,
                        decided_by=actor.email, decided_at=now())
    session.add(d)
    r = session.query(MonthlyUpdateRow).filter_by(cycle_id=cycle_id, facility_id=facility_id).first()
    p.status = outcome
    r.status = "monthly_final" if outcome == "approved" else "pushed_back"
    if outcome == "pushed_back":
        counts = dict(r.pacing_json or {})
        _ = counts
    session.flush()
    _maybe_close_monthly(session, cycle_id)
    audit(session, actor, "monthly_decision.recorded", "monthly_decision", d.id, cycle_id=cycle_id,
          after={"facility_id": facility_id, "outcome": outcome, "mark": d.approved_mark, "rationale": rationale})
    return d


def _maybe_close_monthly(session: Session, cycle_id: str) -> None:
    rows = session.query(MonthlyUpdateRow).filter_by(cycle_id=cycle_id).all()
    if rows and all(r.status == "monthly_final" for r in rows):
        cyc = session.get(ValuationCycle, cycle_id)
        cyc.status, cyc.closed_at = "closed", now()
        req = session.query(ApprovalRequest).filter_by(cycle_id=cycle_id, kind="monthly_marks", status="pending").first()
        if req:
            req.status = "approved"


def monthly_view(session: Session, cycle_id: str) -> dict:
    rows = session.query(MonthlyUpdateRow).filter_by(cycle_id=cycle_id).order_by(MonthlyUpdateRow.facility_id).all()
    props = {}
    for p in session.query(MonthlyMarkProposal).filter_by(cycle_id=cycle_id).order_by(MonthlyMarkProposal.version):
        props[p.facility_id] = {"id": p.id, "mark": p.proposed_mark, "rationale": p.rationale, "status": p.status,
                                "version": p.version, "by": p.proposed_by}
    decs = {d.facility_id: {"outcome": d.outcome, "mark": d.approved_mark, "rationale": d.rationale, "by": d.decided_by}
            for d in session.query(MonthlyDecision).filter_by(cycle_id=cycle_id).order_by(MonthlyDecision.decided_at)}
    ddtl = session.query(DdtlRebalance).filter_by(cycle_id=cycle_id).all()
    files = session.query(MonthlyMarksFile).filter_by(cycle_id=cycle_id).order_by(MonthlyMarksFile.version).all()
    req = session.query(ApprovalRequest).filter_by(cycle_id=cycle_id, kind="monthly_marks").order_by(
        ApprovalRequest.requested_at.desc()).first()
    qm = _quarter_marks(session)
    return {"rows": [{"id": r.id, "facility_id": r.facility_id, "borrower": r.borrower, "team": r.team_name,
                      "deal_team_id": r.deal_team_id, "facility_type": r.facility_type, "current_mark": r.current_mark,
                      "pacing": r.pacing_json, "sigma": r.sigma_json, "notes": r.watchlist_notes_json,
                      "completeness": r.completeness_status, "status": r.status, "proposal": props.get(r.facility_id),
                      "decision": decs.get(r.facility_id), "quarter": qm.get(r.facility_id)} for r in rows],
            "ddtl": [{"id": d.id, "facility_id": d.facility_id, "total_commitment": d.total_commitment,
                      "drawn_before": d.drawn_before, "draws_in_month": d.draws_in_month, "funded_after": d.funded_after,
                      "unfunded_after": d.unfunded_after, "mark_applied_to": d.mark_applied_to,
                      "confirmed_by": d.confirmed_by} for d in ddtl],
            "files": [{"version": f.version, "path": f.xlsx_path, "rows": f.rows_json} for f in files],
            "request": {"id": req.id, "status": req.status} if req else None,
            "ddtl_rule": rule_meta(session, "monthly.ddtl.mark_applied_to"),
            "kpis": {"loans": len(rows), "proposals": sum(1 for r in rows if r.status in ("proposed", "monthly_final")),
                     "outstanding": sum(1 for r in rows if r.status in ("not_started", "requested", "pushed_back")),
                     "ddtl_pending": sum(1 for d in ddtl if not d.confirmed_by)}}


__all__ = ["create_monthly_cycle", "build_update_file", "email_teams", "draft_rationale", "submit_proposal",
           "confirm_ddtl", "consolidate", "request_monthly_approval", "decide_monthly", "monthly_view", "bump_loop",
           "CycleLoan"]
