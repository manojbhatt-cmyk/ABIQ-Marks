"""Demo autopilot: moves every loan except the ones being demonstrated by hand.

Each action is taken through the same domain services the UI calls, as the named person who owns that step for
that loan (its analyst, A/C Manager, the PM Team, SCT, its Deal Team lead, the committee chair), so the audit
trail reads as if those people had done it. Cycle-wide PM actions (impact note, agenda, pack, reconciliation,
approvals) are left to the presenter.

Pacing (decision D34): as in AllianceBernstein's process, every loan moves on its own until Gate 1. Nothing waits
for the presented loan. Each step is worked towards its kickoff deadline: a team does it on the deadline day plus
its own OFFSET (some teams are early, some on the day), at most one step a day, so on any day the loans sit at
different stages. The PM Team loads and copies Lincoln's draft for a loan the day after it arrives. A loan sent
back needs a few days before it comes back. Steps 16 to 22 are cycle-wide and stay with the presenter.

Send-backs shown on purpose (SCRIPTED, G1_SEND_BACK): the PM Team returns Sunrise's CMR (2 days to fix) and
Orchard's (1 day), the loops AllianceBernstein's map describes (loop B); Kestrel's Deal Team sends Lincoln's mark
back at Gate 1 (loop A; Lincoln answers 2 days later, see world.py).
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from domain.models import (AgentSuggestion, AuditEvent, CmrRecommendation, CmrReview, CmrReviewComment, CmrSection,
                           CommitteeAgendaItem, CommitteeDecision, CommitteePack, CycleLoan, Deadline, LincolnPackage,
                           RuleConfig, ValuationCycle, ValuationDecision)
from domain.services import cmrs, committee, intake, lincoln, spreads, valuation
from domain.services import core
from domain.services.core import SYSTEM, audit, automated
from synth.play import FACS, actor, pm
from synth.portfolio import SUNRISE_COMMITTEE

SETTING = "demo.autopilot_except"

# Days before (negative) or after each kickoff deadline a team does the step: each team works at its own speed.
OFFSET = {"F-0001": -2, "F-0003": 0, "F-0013": -1, "F-0015": -3}
FIX_DAYS = 2  # days to answer a send-back that is not scripted (for example one the presenter makes)

# Review send-backs: stage, days the analyst needs, the reviewer's comments and the fix.
SCRIPTED = {
    "F-0003": {"stage": "pm_team", "days": 2, "who": "PM Team",
               "comments": [("financial_performance", "Explain the margin recovery: which customers came back and why.")],
               "fix": ("financial_performance", " Margin recovered as the two regional grocery chains lost in Q1 "
                       "returned on new twelve-month contracts.")},
    "F-0013": {"stage": "pm_team", "days": 1, "who": "PM Team",
               "comments": [("risks", "Add the Medicare reimbursement change and its effect on cash flow.")],
               "fix": ("risks", " The 2027 home health reimbursement update cuts rates by about 2 percent; management "
                       "estimates a $0.4M annual effect on cash flow, covered by current liquidity.")},
}
# Gate 1 send-back to Lincoln: Lincoln answers on the clock (world.py, two days later).
G1_SEND_BACK = {"F-0015": "Lincoln's range does not reflect the renewal of the two largest managed-service contracts "
                          "signed on 30 September; please review the revenue assumption."}
POST_G1 = ("approved", "on_agenda", "decided", "reconciled", "final")


def setting(session: Session) -> list[str] | None:
    r = session.query(RuleConfig).filter_by(key=SETTING, is_current=True).first()
    return r.value_json if r else None


def set_setting(session: Session, except_fids: list[str] | None) -> None:
    r = session.query(RuleConfig).filter_by(key=SETTING, is_current=True).first()
    if except_fids is None:
        if r:
            r.is_current = False
        return
    if r:
        r.value_json = except_fids
    else:
        session.add(RuleConfig(key=SETTING, value_json=except_fids, value_type="list", confirmed_by_client=False,
                               description="Demo only: loans the autopilot leaves for the presenter"))


# A person's own work on a loan: once someone does one of these by hand, the demo stops acting for that loan.
HAND_ACTIONS = ("spread.", "cmr.", "valuation_decision.", "valuation.internal")


def _take_over(session: Session, ev) -> None:
    """The presenter acted on a loan by hand: from now on that loan is theirs and the autopilot leaves it alone."""
    keep = setting(session)
    if keep is None or not ev.action.startswith(HAND_ACTIONS):
        return
    cl = session.get(CycleLoan, ev.cycle_loan_id)
    if cl and cl.facility_id not in keep:
        set_setting(session, keep + [cl.facility_id])


core.HUMAN_ACTION_HOOKS.append(_take_over)


def run(session: Session, cycle_id: str, except_fids: list[str]) -> list[str]:
    with automated():
        return _run(session, cycle_id, except_fids)


def _run(session: Session, cycle_id: str, except_fids: list[str]) -> list[str]:
    log: list[str] = []
    cyc = session.get(ValuationCycle, cycle_id)
    if cyc.status in ("draft", "closed"):
        return log
    done: dict[str, int] = {}

    def did(what: str):
        done[what] = done.get(what, 0) + 1

    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id):
        if cl.facility_id not in except_fids:
            _loan(session, cl, did, cyc.current_day)
    _committee(session, cycle_id, except_fids, did)
    for k, v in done.items():
        log.append(f"Autopilot: {k} for {v} loan(s)")
    return log


def follow(session: Session, cycle_id: str) -> list[str]:
    """Called after the presenter acts. Loans keep their own pace, so this only does what today allows."""
    keep = setting(session)
    return run(session, cycle_id, keep) if keep is not None else []


# ---------------- pacing ----------------
def _last(session: Session, cl: CycleLoan, track: str) -> int:
    days = [e.cycle_day or 0 for e in session.query(AuditEvent).filter_by(cycle_loan_id=cl.id, action="demo.autopilot_step")
            if (e.after_json or {}).get("track") == track]
    return max(days) if days else -100


def _mark(session: Session, cl: CycleLoan, track: str, what: str, did) -> None:
    did(what)
    audit(session, SYSTEM, "demo.autopilot_step", "cycle_loan", cl.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"track": track, "what": what})


def _sent_back(session: Session, cl: CycleLoan) -> tuple[int, int] | None:
    """(day the CMR was last sent back, days the analyst needs) while the loan waits on its analyst."""
    if cl.status != "sent_back":
        return None
    ev = session.query(AuditEvent).filter_by(cycle_loan_id=cl.id, action="cmr.review_outcome").order_by(
        AuditEvent.occurred_at.desc()).first()
    if not ev or (ev.after_json or {}).get("outcome") != "sent_back":
        return None
    return ev.cycle_day or 0, SCRIPTED.get(cl.facility_id, {}).get("days", FIX_DAYS)


def deadlines(session: Session, cycle_id: str) -> dict[str, int]:
    """The kickoff deadline day of every step in this cycle."""
    return {d.step_code: d.due_day for d in session.query(Deadline).filter_by(cycle_id=cycle_id)}


def waiting(session: Session, cycle_id: str) -> list[tuple[str, int]]:
    """CMRs sent back and still being fixed by an autopilot loan: (borrower, day the revised CMR comes back)."""
    keep = setting(session) or []
    out = []
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True, status="sent_back"):
        sb = _sent_back(session, cl)
        if sb and cl.facility_id not in keep:
            out.append((cl.borrower, sb[0] + sb[1]))
    return out


# ---------------- one loan ----------------
def _loan(session: Session, cl: CycleLoan, did, day: int) -> None:
    """At most one Deal Team step and one Lincoln-track step per loan per day, each not before its deadline day
    plus the team's offset."""
    if cl.package_status != "complete":
        return
    due = deadlines(session, cl.cycle_id)
    off = OFFSET.get(cl.facility_id, 0)

    def ready(step: str) -> bool:
        return day >= due.get(step, 0) + off
    pm_a = pm(session)
    analyst, lead = actor(session, cl.analyst_email), actor(session, cl.lead_email)
    # Lincoln track: the PM Team loads Lincoln's draft to Everest, then copies the report to SharePoint
    lv = lincoln.latest_valuation(session, cl.id)
    if lv and day >= _last(session, cl, "lincoln") + 1:
        if not lv.loaded_to_everest:
            lincoln.load_to_everest(session, pm_a, cl.cycle_id, only=[cl.id])
            _mark(session, cl, "lincoln", "Lincoln draft loaded to Everest", did)
        elif lv.report_document_id and not lv.sharepoint_copy_path:
            lincoln.copy_to_sharepoint(session, pm_a, cl.cycle_id, only=[cl.id])
            _mark(session, cl, "lincoln", "Lincoln report copied to SharePoint", did)
    if day < _last(session, cl, "dt") + 1:
        return
    # Q3: share with Lincoln
    if (cl.valuation_method or "Lincoln") == "Lincoln" and not session.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first():
        if not ready("Q3"):
            return
        lincoln.share_package(session, pm_a, cl.id)
        return _mark(session, cl, "dt", "package shared with Lincoln", did)
    # Q4: spread
    sp = spreads.current_spread(session, cl.id)
    if sp is None or sp.status != "approved":
        if not ready("Q4"):
            return
        sp = sp or spreads.run_spreading(session, analyst, cl.id)
        b, _ = FACS[cl.facility_id]
        for code in sp.not_found_lines or []:
            if isinstance(b.fin.get(code), list):
                for ptype, idx in (("same_quarter_last_year", 0), ("q_minus_3", 1), ("q_minus_2", 2), ("prior_quarter", 3),
                                   ("quarter", 4)):
                    spreads.add_line(session, analyst, sp.id, code, ptype, b.fin[code][idx], "keyed from the scanned page")
            elif code in b.fin:
                spreads.add_line(session, analyst, sp.id, code, "quarter", b.fin[code], "keyed from the scanned pack")
        spreads.approve_spread(session, analyst, sp.id)
        return _mark(session, cl, "dt", "spread approved", did)
    # Q5: CMR
    cmr = cmrs.latest_cmr(session, cl.id)
    if cmr is None or (cmr.status == "draft" and not cmr.submitted_at):
        if not ready("Q5"):
            return
        cmr = cmrs.get_or_create_cmr(session, analyst, cl.id)
        if not any(s.draft_body_markdown for s in session.query(CmrSection).filter_by(cmr_id=cmr.id)):
            cmrs.draft_sections(session, analyst, cmr.id)
        for sec in session.query(CmrSection).filter_by(cmr_id=cmr.id):
            if sec.draft_body_markdown and not sec.body_markdown:
                cmrs.decide_section(session, analyst, sec.id, "accept")
        rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).one()
        if not rec.rationale and rec.agent_suggestion_id:
            sug = session.get(AgentSuggestion, rec.agent_suggestion_id).payload_json
            cmrs.set_recommendation(session, analyst, cmr.id, {k: sug[k] for k in (
                "proposed_rating", "watchlist_action", "waiver_requested", "expected_mark_direction", "rationale")})
        for d in intake.loan_documents(session, cl):
            cmrs.attach_evidence(session, analyst, cmr.id, d.id, "recommendation")
        cmrs.submit(session, analyst, cmr.id, acknowledge_warnings=True)
        return _mark(session, cl, "dt", "CMR drafted and submitted", did)
    # sent back: the analyst needs a few days before resubmitting
    if cmr.status == "draft" and cmr.submitted_at:
        sb = _sent_back(session, cl)
        if sb and day >= sb[0] + sb[1]:
            _revise(session, cl, cmr, analyst)
            _mark(session, cl, "dt", "CMR revised and resubmitted", did)
        return
    # Q6 to Q9: one review or the filing
    stage = cmr.current_stage
    if stage and not ready({"ac_manager": "Q6", "pm_team": "Q7", "file": "Q8", "sct": "Q9"}.get(stage, "Q9")):
        return
    rv = cmrs.open_review(session, cmr)
    if stage in ("ac_manager", "pm_team") and rv:
        reviewer = actor(session, cl.ac_manager_email) if stage == "ac_manager" else pm_a
        if _script_send_back(session, cl, rv, reviewer, did):
            return
        if stage == "pm_team" and any(c.get("result") == "fail" for c in rv.checklist_results_json or []):
            cmrs.add_comment(session, pm_a, rv.id, "summary", "Checked; acceptable for this quarter.")
        cmrs.decide_review(session, reviewer, rv.id, "passed")
        return _mark(session, cl, "dt", f"{'A/C Manager' if stage == 'ac_manager' else 'PM Team'} review passed", did)
    if stage == "file":
        cmrs.file_cmr(session, pm_a, cmr.id)
        return _mark(session, cl, "dt", "CMR filed", did)
    if stage == "sct" and rv:
        cmrs.decide_review(session, actor(session, "sct.reviewer@ab-poc.local"), rv.id, "passed")
        return _mark(session, cl, "dt", "SCT review passed", did)
    # Q14: Gate 1 by the loan's Deal Team lead, once Lincoln's draft is in Everest and the CMR is filed
    decided = session.query(ValuationDecision).filter(ValuationDecision.cycle_loan_id == cl.id,
                                                      ValuationDecision.outcome != "sent_back").first()
    if lv and lv.loaded_to_everest and cmr.status in ("filed", "agreed") and not decided \
            and cl.status != "waiting_on_lincoln" and (ready("Q14") or (cl.loop_counts_json or {}).get("QA")):
        _, f = FACS[cl.facility_id]
        if cl.facility_id in G1_SEND_BACK and not (cl.loop_counts_json or {}).get("QA"):
            valuation.decide_g1(session, lead, cl.id, "sent_back", reason_category="new_information",
                                note=G1_SEND_BACK[cl.facility_id])
            return _mark(session, cl, "dt", "Gate 1 sent back to Lincoln", did)
        if f.g1_mark is not None:
            valuation.decide_g1(session, lead, cl.id, "approved_different_mark", mark=f.g1_mark, rationale=f.g1_rationale)
        else:
            valuation.decide_g1(session, lead, cl.id, "approved")
        return _mark(session, cl, "dt", "Gate 1 approved", did)


def _script_send_back(session: Session, cl: CycleLoan, rv, reviewer, did) -> bool:
    """Send the CMR back once at its scripted stage. True when it did."""
    sc = SCRIPTED.get(cl.facility_id)
    if not sc or sc["stage"] != rv.stage or session.query(AuditEvent).filter_by(
            cycle_loan_id=cl.id, action="demo.scripted_send_back").first():
        return False
    for sec, text in sc["comments"]:
        cmrs.add_comment(session, reviewer, rv.id, sec, text)
    cmrs.decide_review(session, reviewer, rv.id, "sent_back")
    audit(session, reviewer, "demo.scripted_send_back", "cmr_review", rv.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"stage": rv.stage, "days_to_fix": sc["days"]})
    _mark(session, cl, "dt", f"CMR sent back by the {sc['who']}", did)
    return True


def _revise(session: Session, cl: CycleLoan, cmr, analyst) -> None:
    """The analyst answers every open comment and resubmits."""
    comments = [cm for rv in session.query(CmrReview).filter_by(cmr_id=cmr.id)
                for cm in session.query(CmrReviewComment).filter_by(cmr_review_id=rv.id, resolved=False)]
    sec_code, extra = SCRIPTED.get(cl.facility_id, {}).get("fix") or (
        (comments[0].section_code if comments and comments[0].section_code != "summary" else "summary"),
        " Updated for the reviewer's comments.")
    sec = session.query(CmrSection).filter_by(cmr_id=cmr.id, section_code=sec_code).first()
    if sec:
        cmrs.decide_section(session, analyst, sec.id, "save", (sec.body_markdown or "") + extra)
    for cm in comments:
        cmrs.resolve_comment(session, analyst, cm.id, "Addressed in this version")
    cmrs.submit(session, analyst, cmr.id, acknowledge_warnings=True)


def _committee(session: Session, cycle_id: str, except_fids: list[str], did) -> None:
    """Q18 for agenda loans other than the demonstrated ones, once the pack has been sent."""
    ag = committee.latest_agenda(session, cycle_id)
    if not ag:
        return
    pack = session.query(CommitteePack).filter_by(agenda_id=ag.id).order_by(
        CommitteePack.version.desc(), CommitteePack.built_at.desc()).first()
    if not pack or not pack.sent_email_message_id:
        return
    chair = actor(session, "vc.chair@ab-poc.local")
    members = ["vc.member1@ab-poc.local", "vc.member2@ab-poc.local", "vc.chair@ab-poc.local"]
    for it in session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id, removed=False, status="pending"):
        cl = session.get(CycleLoan, it.cycle_loan_id)
        if cl.facility_id in except_fids or session.query(CommitteeDecision).filter_by(agenda_item_id=it.id).first():
            continue
        cmr = cmrs.latest_cmr(session, cl.id)
        rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first() if cmr else None
        if cl.facility_id == "F-0003":
            committee.record_decision(session, chair, it.id, "change", decided_mark=SUNRISE_COMMITTEE["mark"],
                                      rating=rec.proposed_rating if rec else None, watchlist_action="keep",
                                      rationale=SUNRISE_COMMITTEE["rationale"], members_present=members)
        else:
            committee.record_decision(session, chair, it.id, "approve", rating=rec.proposed_rating if rec else None,
                                      watchlist_action=rec.watchlist_action if rec else None, members_present=members)
        did("committee decision recorded")


__all__ = ["run", "follow", "setting", "set_setting", "waiting", "deadlines", "CmrReview"]
