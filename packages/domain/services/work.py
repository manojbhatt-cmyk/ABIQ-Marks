"""My Work: every person's next actions, derived from the state of the cycle.

Nothing here is stored or sent; it is recomputed on every request, so the list is
always current and no one has to chase anyone inside the firm. Each item names the
process step, what to do, why, and the screen where it is done.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from domain.models import (Approval, ApprovalRequest, Cmr, CommitteeAgendaItem, CommitteePack, CycleLoan, Deadline,
                           Distribution,
                           Document, FinancialSpread, GovernanceSignoff, ImpactSummary, LincolnPackage, LincolnValuation,
                           ReconciliationRun, Reminder, ValuationCycle, ValuationDecision)
from domain.services.core import Actor

STEP_NAMES = {
    "Q1": "Kickoff", "Q2": "Borrower financials", "Q3": "Share with Lincoln", "Q4": "Spread", "Q5": "CMR draft",
    "Q6": "A/C Manager review", "Q7": "PM Team review", "Q8": "File CMR", "Q9": "SCT review", "Q10": "Lincoln drafts",
    "Q11": "Tracker and impact note", "Q12": "Load to Everest", "Q13": "Copy to SharePoint", "Q14": "Gate 1",
    "Q15": "Mark on CMR", "Q16": "Agenda", "Q17": "Committee pack", "Q18": "Committee meeting", "Q19": "Reconcile",
    "Q20": "Written approval", "Q21": "Governance sign-off", "Q22": "Distribute",
}


def _item(step, title, detail, link, kind="action", loan=None, priority=2):
    return {"step": step, "step_name": STEP_NAMES.get(step, step), "title": title, "detail": detail, "link": link,
            "kind": kind, "loan": loan, "priority": priority}


def my_work(session: Session, actor: Actor, cycle_id: str | None) -> dict:
    role = actor.role
    items: list[dict] = []
    cyc = session.get(ValuationCycle, cycle_id) if cycle_id else None
    if cyc is None:
        if role in ("pm_team", "admin"):
            items.append(_item("Q1", "Start the 2026-Q3 cycle", "Read the loan universe from Snowflake, set the calendar "
                               "and send the kickoff to every deal team inside ABIQ.", "/kickoff", priority=1))
        return {"items": items, "cycle": None}
    loans = session.query(CycleLoan).filter_by(cycle_id=cyc.id, in_scope=True).order_by(CycleLoan.facility_id).all()
    if role in ("deal_analyst", "deal_lead"):
        loans = [l for l in loans if l.deal_team_id == actor.deal_team_id]

    def cmr_of(cl):
        return session.query(Cmr).filter_by(cycle_loan_id=cl.id).order_by(Cmr.version.desc()).first()

    def spread_of(cl):
        return session.query(FinancialSpread).filter_by(cycle_loan_id=cl.id).filter(
            FinancialSpread.status != "superseded").order_by(FinancialSpread.version.desc()).first()

    def lv_of(cl):
        return session.query(LincolnValuation).filter_by(cycle_loan_id=cl.id).order_by(LincolnValuation.version.desc()).first()

    if role in ("pm_team", "admin"):
        if cyc.status == "draft":
            items.append(_item("Q1", "Send the kickoff", "Review the calendar and the per-team messages, then send them in "
                               "ABIQ. Deal teams get their loans, deadlines and tasks.", "/kickoff", priority=1))
        for r in session.query(Reminder).join(CycleLoan, CycleLoan.id == Reminder.cycle_loan_id).filter(
                CycleLoan.cycle_id == cyc.id, Reminder.status == "draft"):
            cl = session.get(CycleLoan, r.cycle_loan_id)
            items.append(_item("Q2", f"Send the chase to {cl.borrower}", "ABIQ drafted a reminder to the borrower "
                               "(external email). Review and send.", "/intake", loan=cl.borrower))
        low = session.query(Document).filter(Document.cycle_id == cyc.id, Document.store == "uploads",
                                             Document.status == "parsed").count()
        if low:
            items.append(_item("Q2", f"Confirm {low} document classification(s)", "Below the confidence threshold, a "
                               "person confirms the type.", "/intake"))
        for cl in loans:
            if (cl.valuation_method or "Lincoln") in ("Sponsor value", "Cost") and cl.package_status == "complete" \
                    and not lv_of(cl):
                items.append(_item("Q10", f"Record the {cl.valuation_method.lower()} mark: {cl.borrower}",
                                   f"This deal is valued at {cl.valuation_method.lower()}, not by Lincoln.",
                                   f"/loans/{cl.id}/pricing", loan=cl.borrower))
        to_share = [cl.borrower for cl in loans if (cl.valuation_method or "Lincoln") == "Lincoln"
                    and cl.package_status == "complete"
                    and not session.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first()]
        if to_share:
            items.append(_item("Q3", f"Share {len(to_share)} complete package{'s' if len(to_share) > 1 else ''} with Lincoln",
                               ", ".join(to_share[:4]) + (f" and {len(to_share) - 4} more" if len(to_share) > 4 else "")
                               + ". One click on Lincoln Exchange shares them all to Box with manifests.", "/lincoln",
                               priority=1))
        unloaded = [lv for cl in loans for lv in [lv_of(cl)] if lv and not lv.loaded_to_everest]
        if unloaded:
            items.append(_item("Q12", f"Load {len(unloaded)} Lincoln draft(s) to Everest",
                               "Write the drafts to the Everest pricing panel and copy the reports to SharePoint.",
                               "/lincoln"))
        latest_v = max([lv.received_at for cl in loans for lv in [lv_of(cl)] if lv] or [None], default=None)
        sent_imp = session.query(ImpactSummary).filter(ImpactSummary.cycle_id == cyc.id,
                                                       ImpactSummary.sent_at.isnot(None)).order_by(
            ImpactSummary.sent_at.desc()).first()
        changed_since = session.query(ValuationDecision).join(CycleLoan, CycleLoan.id == ValuationDecision.cycle_loan_id).filter(
            CycleLoan.cycle_id == cyc.id).count()
        if latest_v and (not sent_imp or (sent_imp.sent_at < latest_v)):
            items.append(_item("Q11", "Send the impact note to Finance", "Lincoln drafts changed the portfolio value. "
                               "ABIQ drafts the note; you review and send it in ABIQ.", "/tracker", priority=1))
        for cl in loans:
            c = cmr_of(cl)
            if c and c.current_stage == "pm_team":
                items.append(_item("Q7", f"Review {cl.borrower}'s CMR", "PM Team review with the checklist.", "/reviews",
                                   loan=cl.borrower))
            if c and c.current_stage == "file":
                items.append(_item("Q8", f"File {cl.borrower}'s CMR", "Both reviews passed. Filing writes the PDF to "
                                   "SharePoint and the CMR to Everest.", "/reviews", loan=cl.borrower))
            if c and c.status == "filed" and c.current_stage is None:
                items.append(_item("Q9", f"Re-file {cl.borrower}'s CMR after SCT", "Resolve the SCT comments then re-file.",
                                   "/reviews", loan=cl.borrower))
        all_g1 = loans and all(cl.status not in ("not_started", "waiting_on_borrower", "in_progress", "in_review",
                                                 "sent_back", "waiting_on_lincoln") for cl in loans)
        from domain.services.committee import latest_agenda

        ag = latest_agenda(session, cyc.id)
        q16 = session.query(Deadline).filter_by(cycle_id=cyc.id, step_code="Q16").first()
        if not ag and (all_g1 or (q16 and cyc.current_day >= q16.due_day and any(
                cl.status in ("approved", "on_agenda") for cl in loans))):
            items.append(_item("Q16", "Build the committee agenda", "Every loan has passed G1. Run the agenda tests."
                               if all_g1 else "The agenda date has come. Loans not through Gate 1 yet are left out and "
                               "shown as late.", "/committee", priority=1))
        g1_due = session.query(Deadline).filter_by(cycle_id=cyc.id, step_code="Q14").first()
        late = [cl.borrower for cl in loans if g1_due and cyc.current_day > g1_due.due_day and cl.status in (
            "not_started", "waiting_on_borrower", "in_progress", "in_review", "sent_back", "waiting_on_lincoln")]
        if late and not ag:
            items.append(_item("Q14", f"Gate 1 overdue: {', '.join(late)}", "Not through Gate 1 by the deadline "
                               f"(day {g1_due.due_day}). AllianceBernstein has not defined what happens next: wait, "
                               "take the loan to the committee as an exception, or carry last quarter's mark. "
                               "Open question for AB.", "/tracker", priority=1))
        if ag:
            pack = session.query(CommitteePack).filter_by(agenda_id=ag.id).order_by(CommitteePack.version.desc(), CommitteePack.built_at.desc()).first()
            if not pack or not pack.sent_email_message_id:
                items.append(_item("Q17", "Build and send the committee pack", "ABIQ drafts the one-pagers; the pack goes "
                                   "to the committee inside ABIQ.", "/committee", priority=1))
            from domain.services import meeting as meeting_svc

            mt = meeting_svc.current(session, cyc.id)
            if not mt:
                items.append(_item("Q17", "Organise the committee meeting", "ABIQ drafts the date, time, agenda slots and "
                                   "attendees; you check and send the invitation in ABIQ.", "/committee", priority=1))
            pending = session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id, removed=False, status="pending").count()
            run = session.query(ReconciliationRun).filter_by(cycle_id=cyc.id).order_by(ReconciliationRun.run_no.desc()).first()
            if pack and pack.sent_email_message_id and not pending and (not run or run.status != "clean"):
                items.append(_item("Q19", "Run and clear reconciliation", "Tracker, Everest, CMR and Sentry must agree.",
                                   "/reconciliation", priority=1))
            req = session.query(ApprovalRequest).filter_by(cycle_id=cyc.id, kind="final_marks").order_by(
                ApprovalRequest.requested_at.desc()).first()
            if run and run.status == "clean" and (not req or req.status in ("rejected", "returned")):
                items.append(_item("Q20", "Request written approval", "Send the final schedule to the Committee Chair.",
                                   "/approvals", priority=1))
            gov = session.query(GovernanceSignoff).filter_by(cycle_id=cyc.id, status="signed").first()
            if gov and not session.query(Distribution).filter_by(cycle_id=cyc.id).first():
                items.append(_item("Q22", "Distribute and close the cycle", "Send the final CMRs to Finance, IR and the "
                                   "Deal Teams inside ABIQ.", "/distribution", priority=1))

    if role in ("deal_analyst", "deal_lead"):
        for cl in loans:
            sp, c, lv = spread_of(cl), cmr_of(cl), lv_of(cl)
            if cl.package_status in ("not_received", "late", "incomplete"):
                missing = ", ".join(m.replace("_", " ") for m in cl.package_missing or []) or "the quarterly package"
                items.append(_item("Q2", f"Collect financials: {cl.borrower}", f"Waiting on the borrower: {missing}. Upload "
                                   "anything you received directly.", "/intake", kind="waiting", loan=cl.borrower))
                continue
            if not sp:
                items.append(_item("Q4", f"Spread {cl.borrower}", "Run the Spreading Agent and review every line.",
                                   f"/loans/{cl.id}/spread", loan=cl.borrower, priority=1))
            elif sp.status != "approved":
                items.append(_item("Q4", f"Approve {cl.borrower}'s spread", "Check flagged cells and add-backs, then approve.",
                                   f"/loans/{cl.id}/spread", loan=cl.borrower, priority=1))
            elif not c or (c.status == "draft" and not c.current_stage):
                again = c is not None and c.submitted_at is not None
                items.append(_item("Q5", f"{'Fix and resubmit' if again else 'Draft and submit'} {cl.borrower}'s CMR",
                                   "Address the review comments." if again else "Draft with ABIQ, set the recommendation, "
                                   "attach evidence and submit.", f"/loans/{cl.id}/cmr", loan=cl.borrower, priority=1))
            elif c.status == "filed" and c.current_stage is None:
                items.append(_item("Q9", f"Resolve SCT comments on {cl.borrower}", "Resolve them so the PM Team can re-file.",
                                   f"/loans/{cl.id}/cmr", loan=cl.borrower))
            if cl.valuation_method == "AB proposal" and not lv and sp and sp.status == "approved":
                items.append(_item("Q10", f"Propose the AB mark: {cl.borrower}", "This deal is valued by AB proposal, "
                                   "not Lincoln. Enter the mark and rationale.", f"/loans/{cl.id}/pricing", loan=cl.borrower,
                                   priority=1))
            if lv and lv.loaded_to_everest and c and c.status in ("filed", "agreed") and cl.status not in (
                    "approved", "on_agenda", "decided", "reconciled", "final", "waiting_on_lincoln"):
                items.append(_item("Q14", f"Gate 1 for {cl.borrower}: Lincoln {lv.point_estimate:.2f}",
                                   "Approve, approve at a different mark, or send back with the Challenge Assistant.",
                                   f"/loans/{cl.id}/pricing", loan=cl.borrower, priority=1))
            if cl.status == "waiting_on_lincoln":
                items.append(_item("Q10", f"Waiting on Lincoln's revision for {cl.borrower}", "Your send-back is in Box.",
                                   f"/loans/{cl.id}/pricing", kind="waiting", loan=cl.borrower))
    if role in ("deal_analyst", "deal_lead"):
        from domain.services import meeting as meeting_svc

        mt = meeting_svc.current(session, cyc.id)
        if mt and any(a["email"] == actor.email for a in mt.attendees_json or []) and cyc.status != "closed":
            mine = [s["title"] for s in mt.slots_json or [] if s.get("presenter") == next(
                (l.team_name for l in loans), None)]
            items.append(_item("Q18", f"Present at the committee: {mt.meeting_date} {mt.start_time}",
                               f"Your loans: {', '.join(mine) or 'see agenda'}.", "/committee/meeting", kind="waiting"))
    if role in ("ac_manager", "sct"):
        # Any A/C Manager may decide (as on the Review queue); the CMRs assigned to you come first.
        from domain.models import AppUser

        stage = "ac_manager" if role == "ac_manager" else "sct"
        for cl in session.query(CycleLoan).filter_by(cycle_id=cyc.id, in_scope=True).order_by(CycleLoan.facility_id):
            c = cmr_of(cl)
            if not c or c.current_stage != stage:
                continue
            mine = role == "sct" or cl.ac_manager_email == actor.email
            owner = session.query(AppUser).filter_by(email=cl.ac_manager_email).first()
            detail = "Pass, or send back with comments." if mine else (
                f"Assigned to {owner.display_name if owner else cl.ac_manager_email}; any A/C Manager can review it.")
            items.append(_item("Q6" if stage == "ac_manager" else "Q9", f"Review {cl.borrower}'s CMR", detail,
                               "/reviews", loan=cl.borrower, priority=1 if mine else 2))
    if role in ("committee_member", "committee_chair"):
        from domain.services.committee import latest_agenda

        ag = latest_agenda(session, cyc.id)
        pack = session.query(CommitteePack).filter_by(agenda_id=ag.id).order_by(CommitteePack.version.desc(), CommitteePack.built_at.desc()).first() if ag else None
        from domain.services import meeting as meeting_svc

        mt = meeting_svc.current(session, cyc.id) if ag else None
        if mt and session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id, removed=False, status="pending").count():
            items.append(_item("Q18", f"Committee meeting {mt.meeting_date} at {mt.start_time}",
                               f"{'Online' if mt.mode == 'online' else mt.location}; {mt.duration_minutes} minutes. Open the "
                               "meeting screen to follow the agenda and record decisions.", "/committee/meeting", priority=0))
        if pack and pack.sent_email_message_id:
            for it in session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id, removed=False, status="pending"):
                cl = session.get(CycleLoan, it.cycle_loan_id)
                items.append(_item("Q18", f"Decide {cl.borrower}", ", ".join(r.replace("_", " ") for r in it.reasons_json),
                                   "/committee/meeting", loan=cl.borrower, priority=1))
        if role == "committee_chair":
            for req in session.query(ApprovalRequest).filter_by(cycle_id=cyc.id, kind="final_marks", status="pending"):
                items.append(_item("Q20", "Approve the final marks schedule", "Written approval (Gate 2).", "/approvals",
                                   priority=1))
    if role == "governance":
        req = session.query(ApprovalRequest).filter_by(cycle_id=cyc.id, kind="final_marks", status="approved").first()
        if req and not session.query(GovernanceSignoff).filter_by(cycle_id=cyc.id, status="signed").first():
            items.append(_item("Q21", "Governance sign-off", "Sign the approved schedule into Everest, or return it.",
                               "/approvals", priority=1))
    if role == "lincoln":
        for cl in session.query(CycleLoan).filter_by(cycle_id=cyc.id, in_scope=True):
            pk = session.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first()
            if pk and not lv_of(cl):
                items.append(_item("Q10", f"Value {cl.borrower}", "Package in your Box folder.", "/lincoln", loan=cl.borrower))
            if cl.status == "waiting_on_lincoln":
                items.append(_item("Q10", f"Revise {cl.borrower}", "The Deal Team sent your draft back.", "/lincoln",
                                   loan=cl.borrower, priority=1))
    items.sort(key=lambda x: (x["priority"], x["step"].replace("Q", "").zfill(3)))
    _ = (Approval, changed_since if role == "pm_team" else None)
    return {"items": items, "cycle": {"id": cyc.id, "period": cyc.period, "day": cyc.current_day, "status": cyc.status}}


def process_map(session: Session, cycle_id: str) -> list[dict]:
    """The 22 steps with how many loans have reached each, for the guided process strip."""
    from domain.services.cycle import STEP_ORDER, step_index

    cyc = session.get(ValuationCycle, cycle_id)
    loans = session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).all()
    n = len(loans) or 1
    # From the agenda on, steps are cycle-wide: a loan the committee is done with is where the cycle is.
    m = _milestone(session, cycle_id)
    past_g1 = ("approved", "decided", "reconciled", "final")
    pos = {l.id: max(step_index(l.current_step), step_index(f"Q{m}") if m and l.status in past_g1 else -1)
           for l in loans}
    out = []
    for s in STEP_ORDER:
        i = step_index(s)
        done = sum(1 for l in loans if pos[l.id] > i or (s == "Q22" and l.status == "final"
                                                          and cyc.status == "closed"))
        at = sum(1 for l in loans if pos[l.id] == i)
        out.append({"step": s, "name": STEP_NAMES[s], "done": done, "at": at, "total": n,
                    "state": "done" if done == n else ("active" if at or done else "todo")})
    if cyc.status == "draft":
        out[0]["state"] = "active"
    return out


def _milestone(session: Session, cycle_id: str) -> int | None:
    """The cycle-wide step (16 to 22) from its milestones, or None before the agenda is built."""
    from domain.models import CommitteeDecision, GovernanceSignoff

    from domain.services.committee import latest_agenda

    cyc = session.get(ValuationCycle, cycle_id)
    if cyc.status == "closed":
        return 22
    step = None
    if session.query(GovernanceSignoff).filter_by(cycle_id=cycle_id, status="signed").first():
        step = 22
    elif session.query(ApprovalRequest).filter_by(cycle_id=cycle_id, kind="final_marks", status="approved").first():
        step = 21
    elif session.query(ApprovalRequest).filter_by(cycle_id=cycle_id, kind="final_marks").first():
        step = 20
    else:
        ag = latest_agenda(session, cycle_id)
        if ag:
            items = session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id, removed=False).all()
            decided = items and all(i.status != "pending" for i in items)
            if decided or session.query(ReconciliationRun).filter_by(cycle_id=cycle_id).first():
                step = 19
            elif session.query(CommitteePack).filter_by(agenda_id=ag.id).first():
                step = 18 if session.query(CommitteeDecision).join(CommitteeAgendaItem).filter(
                    CommitteeAgendaItem.agenda_id == ag.id).first() else 17
            else:
                step = 16
    return step


def cycle_stage(session: Session, cycle_id: str) -> tuple[int, float]:
    """Where the cycle is (step number) and how far along (0 to 1), from milestones rather than the calendar."""
    if session.get(ValuationCycle, cycle_id).status == "closed":
        return 22, 1.0
    step = _milestone(session, cycle_id)
    if step is None:
        steps = process_map(session, cycle_id)
        step = int(next((p["step"] for p in steps if p["state"] != "done"), "Q15")[1:])
        step = min(step, 15)
    return step, round((step - 1) / 22, 3)


REVIEWER = {"ac_manager": "A/C Manager", "pm_team": "PM Team", "sct": "SCT"}


def journey(session: Session, cl: CycleLoan) -> list[dict]:
    """The loan's way through the quarter so far, day by day, from the audit trail: what happened, and which events
    were loops (send-backs, revisions) or flags. Shown under the loan in the PM Team's view."""
    from domain.models import AuditEvent

    out, sent_back = [], False
    for e in session.query(AuditEvent).filter_by(cycle_loan_id=cl.id).order_by(AuditEvent.occurred_at):
        a, x, kind = e.action, e.after_json or {}, "step"
        if a == "package.completeness_changed" and x.get("package_status") == "complete":
            text = "Borrower package complete"
        elif a == "lincoln_package.shared":
            text = "Package shared with Lincoln"
        elif a == "spread.approved":
            text = "Spread approved"
        elif a == "cmr.submitted":
            text, kind = ("CMR resubmitted", "loop") if sent_back else ("CMR submitted", "step")
        elif a == "cmr.review_outcome" and x.get("outcome") == "sent_back":
            text, kind, sent_back = f"CMR sent back by the {REVIEWER.get(x.get('stage'), x.get('stage'))}", "back", True
        elif a == "cmr.review_outcome" and x.get("outcome") == "passed":
            text = f"{REVIEWER.get(x.get('stage'), x.get('stage'))} review passed"
        elif a == "cmr.filed":
            text = "CMR filed"
        elif a == "lincoln_valuation.received":
            v = x.get("version", 1)
            text, kind = (f"Lincoln draft v{v}: {x.get('point', 0):.2f}", "loop" if v > 1 else "step")
            if v > 1:
                text = f"Lincoln revised the mark (v{v}): {x.get('point', 0):.2f}"
        elif a == "valuation_decision.sent_back":
            text, kind = "Gate 1: mark sent back to Lincoln", "back"
        elif a == "valuation_decision.approved":
            text = f"Gate 1 approved at {x['mark']:.2f}" if x.get("mark") is not None else "Gate 1 approved"
        elif a == "mark_move.flagged":
            text, kind = f"Mark move flagged ({x.get('move', 0) * 100:+.1f} percent)", "flag"
        elif a == "committee_decision.recorded":
            text = f"Committee: {x.get('outcome')}" + (f" at {x['decided']:.2f}" if x.get("decided") is not None else "")
        else:
            continue
        out.append({"day": e.cycle_day, "text": text, "kind": kind})
    return out


def loan_stages(session: Session, cycle_id: str) -> list[dict]:
    """Where every loan is right now, for the PM Team: the step, who it waits on and for how long, Lincoln's side,
    the loops so far and the mark-move flag. Derived from the records on every request."""
    from domain.models import MarksTrackerRow
    from domain.services import mark_moves
    from domain.services.cycle import step_index

    from domain.services.intake import loan_documents

    cyc = session.get(ValuationCycle, cycle_id)
    due_day = {d.step_code: d.due_day for d in session.query(Deadline).filter_by(cycle_id=cycle_id)}
    out = []
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id):
        cmr = session.query(Cmr).filter_by(cycle_loan_id=cl.id).order_by(Cmr.version.desc()).first()
        sp = session.query(FinancialSpread).filter_by(cycle_loan_id=cl.id).order_by(FinancialSpread.version.desc()).first()
        lv = session.query(LincolnValuation).filter_by(cycle_loan_id=cl.id).order_by(LincolnValuation.version.desc()).first()
        shared = session.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first()
        g1 = session.query(ValuationDecision).filter(ValuationDecision.cycle_loan_id == cl.id,
                                                     ValuationDecision.outcome != "sent_back").first()
        stage = {"ac_manager": "A/C Manager", "pm_team": "PM Team", "sct": "SCT", "file": "PM Team (filing)"}
        # the step it is at, who has it, and the kickoff deadline that step is measured against
        if cl.package_status != "complete":
            got = loan_documents(session, cl)
            now_, waiting, step_ = "Borrower financials", "Borrower: " + (
                f"missing {', '.join(m.replace('_', ' ') for m in cl.package_missing)}" if got and cl.package_missing
                else "package not received yet"), "Q2"
        elif cl.status == "sent_back":
            now_, waiting, step_ = "CMR sent back", "Analyst, fixing the reviewer's comments", "Q8"
        elif cl.status == "waiting_on_lincoln":
            now_, waiting, step_ = "Mark sent back to Lincoln", "Lincoln, revising the valuation", "Q14"
        elif not sp or sp.status != "approved":
            now_, waiting, step_ = "Spread", "Analyst", "Q4"
        elif not cmr or (cmr.status == "draft"):
            now_, waiting, step_ = "CMR draft", "Analyst", "Q5"
        elif cmr.current_stage in stage:
            now_, waiting = f"CMR review: {stage[cmr.current_stage]}", stage[cmr.current_stage]
            step_ = {"ac_manager": "Q6", "pm_team": "Q7", "sct": "Q9", "file": "Q8"}[cmr.current_stage]
        elif g1:
            now_, step_ = STEP_NAMES.get(cl.current_step, cl.current_step), None
            waiting = "Committee" if cl.on_agenda and cl.status == "on_agenda" else (
                "Done until the committee stage" if step_index(cl.current_step) < step_index("Q19") else "PM Team")
        elif not lv:
            now_, waiting, step_ = ("CMR filed, waiting for Lincoln", "Lincoln" if shared else
                                    "PM Team (share with Lincoln)", "Q10" if shared else "Q3")
        elif not lv.loaded_to_everest:
            now_, waiting, step_ = "Lincoln draft in", "PM Team (load to Everest)", "Q12"
        else:
            now_, waiting, step_ = "Gate 1", "Deal Team lead", "Q14"
        due = due_day.get(step_) if step_ else None
        lincoln_state = ("Not shared" if not shared else "Drafting" if not lv else
                         f"Revising v{lv.version}" if cl.status == "waiting_on_lincoln" else
                         f"Draft v{lv.version}: {lv.point_estimate:.2f}")
        tr = session.query(MarksTrackerRow).filter_by(cycle_loan_id=cl.id).first()
        out.append({"id": cl.id, "borrower": cl.borrower, "facility_id": cl.facility_id, "team": cl.team_name,
                    "step": cl.current_step, "now": now_, "waiting_on": waiting, "lincoln": lincoln_state,
                    "due_day": due, "late_days": max(0, cyc.current_day - due) if due is not None else 0,
                    "loops": cl.loop_counts_json or {}, "status": cl.status, "journey": journey(session, cl),
                    "move": mark_moves.current(session, tr) if tr else None})
    return out
