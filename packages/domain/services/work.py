"""My Work: every person's next actions, derived from the state of the cycle.

Nothing here is stored or sent; it is recomputed on every request, so the list is
always current and no one has to chase anyone inside the firm. Each item names the
process step, what to do, why, and the screen where it is done.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from domain.models import (Approval, ApprovalRequest, Cmr, CommitteeAgendaItem, CommitteePack, CycleLoan, Distribution,
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
                               "and send the kickoff to every deal team inside TIQ.", "/kickoff", priority=1))
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
                               "TIQ. Deal teams get their loans, deadlines and tasks.", "/kickoff", priority=1))
        for r in session.query(Reminder).join(CycleLoan, CycleLoan.id == Reminder.cycle_loan_id).filter(
                CycleLoan.cycle_id == cyc.id, Reminder.status == "draft"):
            cl = session.get(CycleLoan, r.cycle_loan_id)
            items.append(_item("Q2", f"Send the chase to {cl.borrower}", "TIQ drafted a reminder to the borrower "
                               "(external email). Review and send.", "/intake", loan=cl.borrower))
        low = session.query(Document).filter(Document.cycle_id == cyc.id, Document.store == "uploads",
                                             Document.status == "parsed").count()
        if low:
            items.append(_item("Q2", f"Confirm {low} document classification(s)", "Below the confidence threshold, a "
                               "person confirms the type.", "/intake"))
        for cl in loans:
            if cl.package_status == "complete" and not session.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first():
                items.append(_item("Q3", f"Share with Lincoln: {cl.borrower}", "The package is complete; "
                                   "share it to Lincoln's Box folder with a manifest.", "/lincoln", loan=cl.borrower))
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
                               "TIQ drafts the note; you review and send it in TIQ.", "/tracker", priority=1))
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
        if all_g1 and not ag:
            items.append(_item("Q16", "Build the committee agenda", "Every loan has passed G1. Run the agenda tests.",
                               "/committee", priority=1))
        if ag:
            pack = session.query(CommitteePack).filter_by(agenda_id=ag.id).order_by(CommitteePack.version.desc()).first()
            if not pack or not pack.sent_email_message_id:
                items.append(_item("Q17", "Build and send the committee pack", "TIQ drafts the one-pagers; the pack goes "
                                   "to the committee inside TIQ.", "/committee", priority=1))
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
                                   "Deal Teams inside TIQ.", "/distribution", priority=1))

    if role in ("deal_analyst", "deal_lead"):
        for cl in loans:
            sp, c, lv = spread_of(cl), cmr_of(cl), lv_of(cl)
            if cl.package_status in ("not_received", "late", "incomplete"):
                missing = ", ".join(m.replace("_", " ") for m in cl.package_missing or []) or "the Q3 package"
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
                                   "Address the review comments." if again else "Draft with TIQ, set the recommendation, "
                                   "attach evidence and submit.", f"/loans/{cl.id}/cmr", loan=cl.borrower, priority=1))
            elif c.status == "filed" and c.current_stage is None:
                items.append(_item("Q9", f"Resolve SCT comments on {cl.borrower}", "Resolve them so the PM Team can re-file.",
                                   f"/loans/{cl.id}/cmr", loan=cl.borrower))
            if lv and lv.loaded_to_everest and c and c.status in ("filed", "agreed") and cl.status not in (
                    "approved", "on_agenda", "decided", "reconciled", "final", "waiting_on_lincoln"):
                items.append(_item("Q14", f"Gate 1 for {cl.borrower}: Lincoln {lv.point_estimate:.2f}",
                                   "Approve, approve at a different mark, or send back with the Challenge Assistant.",
                                   f"/loans/{cl.id}/pricing", loan=cl.borrower, priority=1))
            if cl.status == "waiting_on_lincoln":
                items.append(_item("Q10", f"Waiting on Lincoln's revision for {cl.borrower}", "Your send-back is in Box.",
                                   f"/loans/{cl.id}/pricing", kind="waiting", loan=cl.borrower))
    if role in ("ac_manager", "sct"):
        stage = "ac_manager" if role == "ac_manager" else "sct"
        for cl in session.query(CycleLoan).filter_by(cycle_id=cyc.id, in_scope=True):
            c = cmr_of(cl)
            if c and c.current_stage == stage and (role == "sct" or cl.ac_manager_email == actor.email):
                items.append(_item("Q6" if stage == "ac_manager" else "Q9", f"Review {cl.borrower}'s CMR",
                                   "Pass, or send back with comments.", "/reviews", loan=cl.borrower, priority=1))
    if role in ("committee_member", "committee_chair"):
        from domain.services.committee import latest_agenda

        ag = latest_agenda(session, cyc.id)
        pack = session.query(CommitteePack).filter_by(agenda_id=ag.id).order_by(CommitteePack.version.desc()).first() if ag else None
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
    out = []
    for s in STEP_ORDER:
        i = step_index(s)
        done = sum(1 for l in loans if step_index(l.current_step) > i or (s == "Q22" and l.status == "final"
                                                                           and cyc.status == "closed"))
        at = sum(1 for l in loans if l.current_step == s)
        out.append({"step": s, "name": STEP_NAMES[s], "done": done, "at": at, "total": n,
                    "state": "done" if done == n else ("active" if at or done else "todo")})
    if cyc.status == "draft":
        out[0]["state"] = "active"
    return out
