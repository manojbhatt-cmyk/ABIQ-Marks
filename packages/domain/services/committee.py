"""Valuation Committee: agenda tests (Q16), pack (Q17, A6), meeting decisions (Q18, G2 decision, loop QF)."""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from agents.assistants import a6_one_pager
from agents.runtime import agent_run, step, suggest
from connectors.mailbox import mailbox
from connectors.object_store import get_store
from domain.models import (AgendaTestResult, Cmr, CmrRecommendation, CommitteeAgenda, CommitteeAgendaItem,
                           CommitteeDecision, CommitteePack, CommitteePackSummary, CycleLoan, EmailMessage,
                           MarksTrackerRow, ValuationCycle)
from domain.pdf import BODY, H1, H2, PageBreak, Spacer, build, grid, inch, para
from domain.services.core import (Actor, BusinessRuleError, audit, bump_loop, cycle_date, now, require, rule,
                                  rule_meta, users_by_role)
from domain.services.lincoln import latest_valuation
from domain.services.tracker import recompute

TEST_LABELS = {"watchlist": "Watchlist", "downgrade": "Rating downgrade", "mark_move_10pct": "Mark move",
               "outside_lincoln_range": "Outside Lincoln range", "g1_unresolved": "G1 unresolved (TIQ addition)"}


def run_agenda_tests(session: Session, actor: Actor, cycle_id: str) -> dict:
    require(actor, "agenda.manage")
    rows = {r.cycle_loan_id: r for r in recompute(session, cycle_id, "agenda")}
    tests = rule(session, "agenda.tests", list(TEST_LABELS))
    thr = float(rule(session, "agenda.mark_move_threshold", 0.10))
    version = {k: rule_meta(session, k)["version"] for k in ("agenda.tests", "agenda.mark_move_threshold")}
    run_id = str(uuid.uuid4())
    results = {}
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True):
        r = rows[cl.id]
        proposed = r.deal_team_mark if r.deal_team_mark is not None else r.lincoln_draft_mark
        move = None if proposed is None or not r.previous_mark else proposed / r.previous_mark - 1
        res = {
            "watchlist": bool(r.watchlist_flag),
            "downgrade": bool(r.current_rating and r.previous_rating and r.current_rating > r.previous_rating),
            "mark_move_10pct": move is not None and abs(move) >= thr - 1e-9,
            "outside_lincoln_range": proposed is not None and r.lincoln_range_low is not None and not (
                r.lincoln_range_low <= proposed <= r.lincoln_range_high),
            "g1_unresolved": r.deal_team_mark is None,
        }
        inputs = {"watchlist": r.watchlist_flag, "previous_rating": r.previous_rating, "rating": r.current_rating,
                  "previous_mark": r.previous_mark, "proposed_mark": proposed,
                  "move": None if move is None else round(move, 4), "threshold": thr,
                  "range": [r.lincoln_range_low, r.lincoln_range_high]}
        for code in tests:
            session.add(AgendaTestResult(cycle_loan_id=cl.id, run_id=run_id, test_code=code, result=res[code],
                                         inputs_json=inputs, rule_version=version["agenda.mark_move_threshold"],
                                         assumed=True))
        reasons = [c for c in tests if res[c]]
        results[cl.id] = {"facility_id": cl.facility_id, "borrower": cl.borrower, "reasons": reasons, "inputs": inputs}
        cl.on_agenda = bool(reasons)
    session.flush()
    recompute(session, cycle_id, "agenda")
    audit(session, actor, "agenda.tests_run", "valuation_cycle", cycle_id, cycle_id=cycle_id,
          after={"run_id": run_id, "on_agenda": [v["facility_id"] for v in results.values() if v["reasons"]],
                 "threshold": thr})
    return {"run_id": run_id, "results": results}


def build_agenda(session: Session, actor: Actor, cycle_id: str) -> CommitteeAgenda:
    require(actor, "agenda.manage")
    tests = run_agenda_tests(session, actor, cycle_id)
    cyc = session.get(ValuationCycle, cycle_id)
    version = session.query(CommitteeAgenda).filter_by(cycle_id=cycle_id).count() + 1
    ag = CommitteeAgenda(cycle_id=cycle_id, version=version, run_id=tests["run_id"], meeting_date=cycle_date(cyc, 42),
                         built_by=actor.email, built_at=now())
    session.add(ag)
    session.flush()
    prev = latest_agenda(session, cycle_id, exclude=ag.id)
    manual = [i for i in session.query(CommitteeAgendaItem).filter_by(agenda_id=prev.id, source="manual_add")] if prev else []
    order = 0
    for cl_id, res in sorted(tests["results"].items(), key=lambda kv: kv[1]["facility_id"]):
        cl = session.get(CycleLoan, cl_id)
        if res["reasons"]:
            order += 1
            session.add(CommitteeAgendaItem(agenda_id=ag.id, cycle_loan_id=cl_id, reasons_json=res["reasons"],
                                            source="rules", sort_order=order))
            cl.status, cl.current_step = "on_agenda", "Q16"
    for m in manual:
        if not session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id, cycle_loan_id=m.cycle_loan_id).first():
            order += 1
            session.add(CommitteeAgendaItem(agenda_id=ag.id, cycle_loan_id=m.cycle_loan_id, reasons_json=["manual"],
                                            source="manual_add", manual_reason=m.manual_reason, sort_order=order))
    session.flush()
    audit(session, actor, "committee_agenda.built", "committee_agenda", ag.id, cycle_id=cycle_id,
          after={"version": version, "items": order})
    return ag


def latest_agenda(session: Session, cycle_id: str, exclude: str | None = None) -> CommitteeAgenda | None:
    q = session.query(CommitteeAgenda).filter_by(cycle_id=cycle_id)
    if exclude:
        q = q.filter(CommitteeAgenda.id != exclude)
    return q.order_by(CommitteeAgenda.version.desc()).first()


def manual_add(session: Session, actor: Actor, cycle_id: str, cycle_loan_id: str, reason: str) -> CommitteeAgendaItem:
    require(actor, "agenda.manage")
    if not rule(session, "agenda.manual_add_allowed", True):
        raise BusinessRuleError("Manual additions are not allowed by the rules")
    if not reason:
        raise BusinessRuleError("A reason is required to add a loan by hand")
    ag = latest_agenda(session, cycle_id) or build_agenda(session, actor, cycle_id)
    item = CommitteeAgendaItem(agenda_id=ag.id, cycle_loan_id=cycle_loan_id, reasons_json=["manual"],
                               source="manual_add", manual_reason=reason,
                               sort_order=session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id).count() + 1)
    session.add(item)
    cl = session.get(CycleLoan, cycle_loan_id)
    cl.on_agenda, cl.status = True, "on_agenda"
    _mark_packs_stale(session, cycle_id)
    audit(session, actor, "agenda.loan_added", "committee_agenda_item", cycle_loan_id, cycle_id=cycle_id,
          cycle_loan_id=cycle_loan_id, after={"reason": reason})
    return item


def remove_item(session: Session, actor: Actor, item_id: str, reason: str) -> CommitteeAgendaItem:
    require(actor, "agenda.manage")
    if not reason:
        raise BusinessRuleError("A reason is required to remove a loan from the agenda")
    it = session.get(CommitteeAgendaItem, item_id)
    it.removed, it.manual_reason = True, reason
    cl = session.get(CycleLoan, it.cycle_loan_id)
    cl.on_agenda = False
    audit(session, actor, "agenda.loan_removed", "committee_agenda_item", it.id, cycle_id=cl.cycle_id,
          cycle_loan_id=cl.id, after={"reason": reason})
    return it


def _mark_packs_stale(session: Session, cycle_id: str) -> None:
    for ag in session.query(CommitteeAgenda).filter_by(cycle_id=cycle_id):
        for p in session.query(CommitteePack).filter_by(agenda_id=ag.id):
            p.stale = True


def _loan_facts(session: Session, cl: CycleLoan, tr: MarksTrackerRow, reasons: list[str]) -> dict:
    cmr = session.query(Cmr).filter_by(cycle_loan_id=cl.id).order_by(Cmr.version.desc()).first()
    rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first() if cmr else None
    wl = rec.watchlist_action if rec else "none"
    return {"borrower": cl.borrower, "facility_id": cl.facility_id, "team": cl.team_name,
            "proposed_mark": tr.deal_team_mark if tr.deal_team_mark is not None else tr.lincoln_draft_mark or 0,
            "previous_mark": tr.previous_mark or 0, "lincoln_point": tr.lincoln_draft_mark or 0,
            "range_low": tr.lincoln_range_low or 0, "range_high": tr.lincoln_range_high or 0,
            "previous_rating": tr.previous_rating, "rating": tr.current_rating,
            "watchlist_text": {"add": "new to watchlist", "keep": "stays on watchlist", "remove": "removed",
                               "none": "not on watchlist"}.get(wl or "none", wl),
            "waiver": "requested" if rec and rec.waiver_requested else "none", "reasons": reasons,
            "key_points": (rec.rationale if rec else "")}


def build_pack(session: Session, actor: Actor, cycle_id: str, cover_note: str | None = None) -> CommitteePack:
    require(actor, "agenda.manage")
    ag = latest_agenda(session, cycle_id)
    if not ag:
        raise BusinessRuleError("Build the agenda first")
    cyc = session.get(ValuationCycle, cycle_id)
    items = [i for i in session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id, removed=False).order_by(
        CommitteeAgendaItem.sort_order)]
    trows = {r.cycle_loan_id: r for r in recompute(session, cycle_id, "pack")}
    version = session.query(CommitteePack).filter_by(agenda_id=ag.id).count() + 1
    for p in session.query(CommitteePack).filter_by(agenda_id=ag.id):
        p.stale = True
    cover = cover_note or (f"Valuation Committee, {cyc.period}. {len(items)} loans on the agenda, meeting "
                           f"{ag.meeting_date:%d %b %Y}. Loans not on the agenda are approved at the Deal Team mark.")
    pack = CommitteePack(agenda_id=ag.id, version=version, cover_note=cover, built_at=now(), stale=False)
    session.add(pack)
    session.flush()
    story = [para(f"Valuation Committee pack, {cyc.period}", H1), para(cover, BODY), Spacer(1, 8),
             grid([["Borrower", "Facility", "Team", "Previous", "Proposed", "Lincoln range", "Reasons"]]
                  + [[i_cl.borrower, i_cl.facility_id, i_cl.team_name, f"{trows[i_cl.id].previous_mark:.2f}",
                      f"{(trows[i_cl.id].deal_team_mark or trows[i_cl.id].lincoln_draft_mark or 0):.2f}",
                      f"{trows[i_cl.id].lincoln_range_low or 0:.2f} to {trows[i_cl.id].lincoln_range_high or 0:.2f}",
                      ", ".join(i.reasons_json)] for i in items for i_cl in [session.get(CycleLoan, i.cycle_loan_id)]],
                  [1.6 * inch, 0.7 * inch, 0.9 * inch, 0.7 * inch, 0.7 * inch, 1.2 * inch, 1.7 * inch], font_size=7.5)]
    with agent_run(session, "A6", "pack_narrator", cycle_id=cycle_id, input_summary=f"pack v{version}") as run:
        for i in items:
            cl = session.get(CycleLoan, i.cycle_loan_id)
            body, questions = a6_one_pager(_loan_facts(session, cl, trows[cl.id], i.reasons_json))
            s = CommitteePackSummary(pack_id=pack.id, cycle_loan_id=cl.id, body_markdown=body, questions_json=questions,
                                     drafted_by_agent_run_id=run.id)
            session.add(s)
            session.flush()
            suggest(session, run, "narrative", "committee_pack_summary", s.id, {"body": body, "questions": questions}, 0.85)
            step(run, "one_pager", cl.facility_id)
            story += [PageBreak(), para(cl.borrower, H2), para(body.replace("**", ""), BODY),
                      para("Questions for the committee: " + " ".join(questions), BODY)]
    path = f"PrivateCredit/Valuation/{cyc.period}/Committee/pack-v{version}.pdf"
    get_store().put("sharepoint", path, build(story, title=f"Committee pack {cyc.period}", footer="Private and Confidential"))
    pack.pdf_path = path
    for i in items:
        cl = session.get(CycleLoan, i.cycle_loan_id)
        cl.current_step = "Q17"
    audit(session, actor, "committee_pack.built", "committee_pack", pack.id, cycle_id=cycle_id,
          after={"version": version, "path": f"sharepoint/{path}", "loans": len(items)}, agent_run_id=run.id)
    return pack


def send_pack(session: Session, actor: Actor, pack_id: str) -> CommitteePack:
    require(actor, "agenda.manage")
    pack = session.get(CommitteePack, pack_id)
    if pack.stale:
        raise BusinessRuleError("This pack is stale; rebuild it before sending")
    ag = session.get(CommitteeAgenda, pack.agenda_id)
    cyc = session.get(ValuationCycle, ag.cycle_id)
    to = [u.email for r in ("committee_member", "committee_chair") for u in users_by_role(session, r)]
    items = session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id, removed=False).all()
    lines = "\n".join(f"- {session.get(CycleLoan, i.cycle_loan_id).borrower}: {', '.join(i.reasons_json)}" for i in items)
    subject = f"{cyc.period} Valuation Committee pack"
    body = (f"Dear Committee members,\n\nPlease find the pack for the meeting on {ag.meeting_date:%d %b %Y}. "
            f"Loans on the agenda:\n{lines}\n\nPack: sharepoint/{pack.pdf_path}\n\nPM Team")
    pdf = get_store().get("sharepoint", pack.pdf_path)
    msg_id, eml = mailbox.send(actor.email, to, subject, body, attachments=[(f"pack-v{pack.version}.pdf", pdf, "application/pdf")])
    m = EmailMessage(direction="out", message_id=msg_id, thread_id=msg_id, from_addr=actor.email, to_addrs=to,
                     subject=subject, body_text=body, sent_at=now(), template_code="committee_pack", cycle_id=cyc.id,
                     cycle_day=cyc.current_day, eml_path=eml, status="sent")
    session.add(m)
    session.flush()
    pack.sent_email_message_id = m.id
    for i in items:
        session.get(CycleLoan, i.cycle_loan_id).current_step = "Q18"
    audit(session, actor, "email.sent", "email_message", m.id, cycle_id=cyc.id,
          after={"template": "committee_pack", "to": to, "pack_version": pack.version})
    return pack


def record_decision(session: Session, actor: Actor, item_id: str, outcome: str, *, decided_mark: float | None = None,
                    rating: int | None = None, watchlist_action: str | None = None, waiver_decision: str | None = None,
                    conditions: str = "", rationale: str = "", members_present: list[str] | None = None,
                    send_back_to: str | None = None) -> CommitteeDecision:
    require(actor, "committee.decide")
    it = session.get(CommitteeAgendaItem, item_id)
    cl = session.get(CycleLoan, it.cycle_loan_id)
    cyc = session.get(ValuationCycle, cl.cycle_id)
    outcomes = rule(session, "committee.outcomes", [])
    if outcome not in outcomes:
        raise BusinessRuleError(f"Outcome must be one of {', '.join(outcomes)}")
    if outcome in rule(session, "committee.rationale_required_for", []) and not rationale:
        raise BusinessRuleError(f"A rationale is required to record '{outcome}'")
    if outcome == "send_back" and not rule(session, "committee.send_back_allowed", True):
        raise BusinessRuleError("The committee cannot send loans back under the current rules")
    tr = session.query(MarksTrackerRow).filter_by(cycle_id=cyc.id, cycle_loan_id=cl.id).first()
    proposed = tr.deal_team_mark if tr and tr.deal_team_mark is not None else (tr.lincoln_draft_mark if tr else None)
    if outcome == "approve":
        decided_mark = proposed
    elif outcome == "change" and decided_mark is None:
        raise BusinessRuleError("Enter the decided mark")
    d = CommitteeDecision(agenda_item_id=it.id, cycle_loan_id=cl.id, outcome=outcome, proposed_mark=proposed,
                          decided_mark=decided_mark if outcome in ("approve", "change") else None, rating=rating,
                          watchlist_action=watchlist_action, waiver_decision=waiver_decision, conditions=conditions,
                          rationale=rationale, members_present_json=members_present or [], recorded_by=actor.email,
                          recorded_at=now(), send_back_to=send_back_to if outcome == "send_back" else None)
    session.add(d)
    session.flush()
    lv = latest_valuation(session, cl.id)
    note = ""
    if outcome in ("approve", "change"):
        it.status = "decided"
        cl.status, cl.current_step = "decided", "Q19"
        cmr = session.query(Cmr).filter_by(cycle_loan_id=cl.id).order_by(Cmr.version.desc()).first()
        if cmr:
            block = dict(cmr.mark_block_json or {})
            block.update({"committee_mark": decided_mark, "committee_rationale": rationale or "Approved as proposed"})
            cmr.mark_block_json = block
        if lv and decided_mark is not None:
            inside = lv.range_low <= decided_mark <= lv.range_high
            note = f"Decided {decided_mark:.2f}, {'inside' if inside else 'outside'} Lincoln range {lv.range_low:.2f} to {lv.range_high:.2f}"
    elif outcome == "send_back":
        n = bump_loop(cl, "QF")
        d.loop_qf_no = n
        it.status = "decided"
        if send_back_to == "lincoln":
            cl.status, cl.current_step, cl.lincoln_step = "waiting_on_lincoln", "Q10", "Q10"
        else:
            cl.status, cl.current_step = "sent_back", "Q14"
        cl.on_agenda = False
        note = f"Sent back to {send_back_to or 'deal_team'}, loop QF x{n}"
    else:
        it.status = "deferred"
        cl.status = "deferred" if outcome == "defer" else cl.status
        note = outcome
    recompute(session, cyc.id, "committee")
    audit(session, actor, "committee_decision.recorded", "committee_decision", d.id, cycle_id=cyc.id,
          cycle_loan_id=cl.id, after={"outcome": outcome, "proposed": proposed, "decided": decided_mark,
                                      "rating": rating, "rationale": rationale, "note": note,
                                      "members_present": members_present})
    d.conditions = conditions
    return d


def agenda_view(session: Session, cycle_id: str) -> dict:
    ag = latest_agenda(session, cycle_id)
    loans = session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id).all()
    tests = rule(session, "agenda.tests", list(TEST_LABELS))
    grid_rows = []
    for cl in loans:
        last = session.query(AgendaTestResult.run_id).filter_by(cycle_loan_id=cl.id).order_by(
            AgendaTestResult.created_at.desc()).first()
        res = {t.test_code: t.result for t in session.query(AgendaTestResult).filter_by(
            cycle_loan_id=cl.id, run_id=last[0])} if last else {}
        inputs = next((t.inputs_json for t in session.query(AgendaTestResult).filter_by(
            cycle_loan_id=cl.id, run_id=last[0])), {}) if last else {}
        grid_rows.append({"cycle_loan_id": cl.id, "facility_id": cl.facility_id, "borrower": cl.borrower,
                          "team": cl.team_name, "tests": res, "inputs": inputs, "on_agenda": cl.on_agenda})
    items, packs, decisions = [], [], {}
    if ag:
        for i in session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id).order_by(CommitteeAgendaItem.sort_order):
            cl = session.get(CycleLoan, i.cycle_loan_id)
            dec = session.query(CommitteeDecision).filter_by(agenda_item_id=i.id).order_by(
                CommitteeDecision.recorded_at.desc()).first()
            items.append({"id": i.id, "cycle_loan_id": cl.id, "borrower": cl.borrower, "facility_id": cl.facility_id,
                          "reasons": i.reasons_json, "source": i.source, "manual_reason": i.manual_reason,
                          "removed": i.removed, "status": i.status,
                          "decision": {"outcome": dec.outcome, "decided_mark": dec.decided_mark, "rationale": dec.rationale,
                                       "recorded_by": dec.recorded_by, "rating": dec.rating,
                                       "watchlist_action": dec.watchlist_action, "waiver": dec.waiver_decision,
                                       "conditions": dec.conditions} if dec else None})
        for p in session.query(CommitteePack).filter_by(agenda_id=ag.id).order_by(CommitteePack.version):
            packs.append({"id": p.id, "version": p.version, "cover_note": p.cover_note, "pdf_path": p.pdf_path,
                          "stale": p.stale, "sent": bool(p.sent_email_message_id),
                          "summaries": [{"id": s.id, "cycle_loan_id": s.cycle_loan_id, "body": s.body_markdown,
                                         "questions": s.questions_json}
                                        for s in session.query(CommitteePackSummary).filter_by(pack_id=p.id)]})
    return {"agenda": {"id": ag.id, "version": ag.version, "meeting_date": ag.meeting_date.isoformat()} if ag else None,
            "tests": [{"code": t, "label": TEST_LABELS.get(t, t), "assumed": True,
                       "tiq_addition": t == "g1_unresolved"} for t in tests],
            "threshold": rule_meta(session, "agenda.mark_move_threshold"), "grid": grid_rows, "items": items,
            "packs": packs, "outcomes": rule(session, "committee.outcomes", []),
            "rationale_required_for": rule(session, "committee.rationale_required_for", []),
            "members": [{"email": u.email, "name": u.display_name} for r in ("committee_member", "committee_chair")
                        for u in users_by_role(session, r)], "decisions": decisions}
