"""Demo autopilot: completes the routine steps for every loan except the ones being demonstrated by hand.

Each action is taken through the same domain services the UI calls, as the named person who owns
that step for that loan (its analyst, A/C Manager, the PM Team, SCT, its Deal Team lead, the
committee chair), so the audit trail reads exactly as if those people had done it. It only does
what the clock allows: no valuation before Lincoln's drafts arrive, no committee decision before the
pack is sent. Cycle-wide PM actions (impact note, agenda, pack, reconciliation, approvals) are left
to the presenter.

Pacing: the other loans follow the loan being presented and never run ahead of it. A loan completes a step
only after the presented loan has finished that step, and decides Gate 1 only after the presented loan's Gate 1
decision. When the presenter finishes a step, `follow` lets the others catch up straight away.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from domain.models import (AgentSuggestion, CmrRecommendation, CmrReview, CmrSection, CommitteeAgendaItem,
                           CommitteeDecision, CommitteePack, CycleLoan, LincolnPackage, RuleConfig, ValuationCycle,
                           ValuationDecision)
from domain.services import cmrs, committee, intake, lincoln, spreads, valuation
from domain.services.cycle import step_index
from synth.play import FACS, actor, pm
from synth.portfolio import SUNRISE_COMMITTEE

SETTING = "demo.autopilot_except"


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


def run(session: Session, cycle_id: str, except_fids: list[str]) -> list[str]:
    log: list[str] = []
    cyc = session.get(ValuationCycle, cycle_id)
    if cyc.status in ("draft", "closed"):
        return log
    done: dict[str, int] = {}

    def did(what: str):
        done[what] = done.get(what, 0) + 1

    every = session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id).all()
    pace = _pace(session, [cl for cl in every if cl.facility_id in except_fids])
    for cl in every:
        if cl.facility_id not in except_fids:
            _loan(session, cl, did, pace)
    _committee(session, cycle_id, except_fids, did)
    for k, v in done.items():
        log.append(f"Autopilot: {k} for {v} loan(s)")
    return log


class _Pace:
    """How far the presented loans have got: the others may complete a step once every presented loan finished it."""

    def __init__(self, dt: int, lincoln_: int, g1_decided: bool):
        self.dt, self.lincoln, self.g1_decided = dt, lincoln_, g1_decided

    def dt_allows(self, step: str) -> bool:
        return self.dt > step_index(step)  # the presented loan's current step is past this one

    def lincoln_allows(self, step: str) -> bool:
        return self.lincoln > step_index(step)


def _pace(session: Session, presented: list[CycleLoan]) -> _Pace:
    if not presented:
        return _Pace(10_000, 10_000, True)
    dt = min(step_index(cl.dt_step or "Q1") for cl in presented)
    ln = min(step_index(cl.lincoln_step or "Q1") for cl in presented)
    g1 = all(session.query(ValuationDecision).filter(ValuationDecision.cycle_loan_id == cl.id,
                                                     ValuationDecision.outcome != "sent_back").first()
             for cl in presented)
    if g1:  # past Gate 1 both tracks are done
        dt = ln = 10_000
    return _Pace(dt, ln, g1)


def follow(session: Session, cycle_id: str) -> list[str]:
    """Called after the presenter acts on a presented loan: the other loans catch up to it."""
    keep = setting(session)
    return run(session, cycle_id, keep) if keep is not None else []


def _loan(session: Session, cl: CycleLoan, did, pace: _Pace) -> None:
    pm_a = pm(session)
    analyst, lead = actor(session, cl.analyst_email), actor(session, cl.lead_email)
    # Q2: documents the borrower already sent but nobody confirmed yet
    if cl.package_status != "complete":
        return
    # Q3: share with Lincoln
    if not pace.dt_allows("Q3"):
        return
    if (cl.valuation_method or "Lincoln") == "Lincoln" and not session.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first():
        lincoln.share_package(session, pm_a, cl.id)
        did("package shared with Lincoln")
    # Q4: spread
    if not pace.dt_allows("Q4"):
        return
    sp = spreads.current_spread(session, cl.id)
    if sp is None:
        sp = spreads.run_spreading(session, analyst, cl.id)
        did("spread proposed")
    if sp.status != "approved":
        b, _ = FACS[cl.facility_id]
        for code in sp.not_found_lines or []:
            if isinstance(b.fin.get(code), list):
                for ptype, idx in (("same_quarter_last_year", 0), ("q_minus_3", 1), ("q_minus_2", 2), ("prior_quarter", 3),
                                   ("quarter", 4)):
                    spreads.add_line(session, analyst, sp.id, code, ptype, b.fin[code][idx], "keyed from the scanned page")
            elif code in b.fin:
                spreads.add_line(session, analyst, sp.id, code, "quarter", b.fin[code], "keyed from the scanned pack")
        spreads.approve_spread(session, analyst, sp.id)
        did("spread approved")
    # Q5: CMR
    cmr = cmrs.latest_cmr(session, cl.id)
    if (cmr is None or (cmr.status == "draft" and not cmr.submitted_at)) and not pace.dt_allows("Q5"):
        return
    if cmr is None or (cmr.status == "draft" and not cmr.submitted_at):
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
        did("CMR drafted and submitted")
    # Q6 to Q9: reviews and filing
    stage_step = {"ac_manager": "Q6", "pm_team": "Q7", "file": "Q8", "sct": "Q9"}
    for _ in range(4):
        stage = cmr.current_stage
        if stage in stage_step and not pace.dt_allows(stage_step[stage]):
            break
        rv = cmrs.open_review(session, cmr)
        if stage == "ac_manager" and rv:
            cmrs.decide_review(session, actor(session, cl.ac_manager_email), rv.id, "passed")
            did("A/C Manager review passed")
        elif stage == "pm_team" and rv:
            if any(c.get("result") == "fail" for c in rv.checklist_results_json or []):
                cmrs.add_comment(session, pm_a, rv.id, "summary", "Checked; acceptable for this quarter.")
            cmrs.decide_review(session, pm_a, rv.id, "passed")
            did("PM Team review passed")
        elif stage == "file":
            cmrs.file_cmr(session, pm_a, cmr.id)
            did("CMR filed")
        elif stage == "sct" and rv:
            cmrs.decide_review(session, actor(session, "sct.reviewer@ab-poc.local"), rv.id, "passed")
            did("SCT review passed")
        else:
            break
        cmr = cmrs.latest_cmr(session, cl.id)
    # Q12, Q13: this loan's Lincoln draft into Everest and SharePoint
    lv = lincoln.latest_valuation(session, cl.id)
    if lv and not lv.loaded_to_everest and pace.lincoln_allows("Q12"):
        lincoln.load_to_everest(session, pm_a, cl.cycle_id, only=[cl.id])
        did("Lincoln draft loaded to Everest")
    if lv and lv.report_document_id and not lv.sharepoint_copy_path and pace.lincoln_allows("Q13"):
        lincoln.copy_to_sharepoint(session, pm_a, cl.cycle_id, only=[cl.id])
    # Q14: Gate 1 by the loan's Deal Team lead
    decided = session.query(ValuationDecision).filter(ValuationDecision.cycle_loan_id == cl.id,
                                                      ValuationDecision.outcome != "sent_back").first()
    if lv and lv.loaded_to_everest and cmr and cmr.status in ("filed", "agreed") and not decided \
            and cl.status not in ("waiting_on_lincoln",) and pace.g1_decided:
        _, f = FACS[cl.facility_id]
        if f.g1_mark is not None:
            valuation.decide_g1(session, lead, cl.id, "approved_different_mark", mark=f.g1_mark, rationale=f.g1_rationale)
        else:
            valuation.decide_g1(session, lead, cl.id, "approved")
        did("Gate 1 approved")


def _committee(session: Session, cycle_id: str, except_fids: list[str], did) -> None:
    """Q18 for agenda loans other than the demonstrated ones, once the pack has been sent."""
    ag = committee.latest_agenda(session, cycle_id)
    if not ag:
        return
    pack = session.query(CommitteePack).filter_by(agenda_id=ag.id).order_by(CommitteePack.version.desc()).first()
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


__all__ = ["run", "follow", "setting", "set_setting", "CmrReview"]
