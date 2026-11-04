"""`synth play --until <step>`: drive the demo story to any step (Build Plan section 6).

External events (borrower emails, Lincoln drops) come from the generator. Human
decisions are made through the same domain services the UI calls, as the named demo
users, so every action is audited with who did it; the demo script plays the people.
Gates are never decided by an agent.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from domain.db import session_scope
from domain.models import (AgentSuggestion, AppUser, Cmr, CmrRecommendation, CmrReview, CmrSection, CommitteeAgendaItem,
                           CycleLoan, Document, ImpactSummary, ReconciliationItem, Reminder, ValuationCycle)
from domain.services import (closing, cmrs, committee, cycle as cyc_svc, intake, lincoln, monthly, spreads, tracker,
                             valuation)
from domain.services.core import Actor
from synth import generator
from synth.portfolio import PERIOD, SUNRISE_COMMITTEE, borrowers

STEPS = [f"Q{i}" for i in range(1, 23)] + [f"M{i}" for i in range(1, 7)]
FACS = {f.facility_id: (b, f) for b in borrowers() for f in b.facilities}


def actor(session: Session, email: str) -> Actor:
    return Actor.of(session.query(AppUser).filter_by(email=email).one())


def pm(s):
    return actor(s, "pm.analyst@ab-poc.local")


def _cycle(s) -> ValuationCycle:
    return s.query(ValuationCycle).filter_by(cycle_type="quarterly", period=PERIOD).one()


def _loans(s, c):
    return s.query(CycleLoan).filter_by(cycle_id=c.id, in_scope=True).order_by(CycleLoan.facility_id).all()


def _loan(s, c, fid):
    return s.query(CycleLoan).filter_by(cycle_id=c.id, facility_id=fid).one()


def clock(s, day):
    c = _cycle(s)
    if c.current_day < day:
        cyc_svc.move_clock(s, pm(s), c.id, day)
        intake.refresh_packages(s, c.id)


def reached(until: str, step: str) -> bool:
    return STEPS.index(step) <= STEPS.index(until)


def play(until: str = "Q22", log=print) -> None:
    until = until.upper()
    with session_scope() as s:
        c = s.query(ValuationCycle).filter_by(cycle_type="quarterly", period=PERIOD).first()
        if c is None:
            c = cyc_svc.create_quarterly_cycle(s, pm(s), PERIOD, date(2026, 9, 30))
            log(f"Q1 cycle created: {len([l for l in _loans(s, c)])} loans in scope")
        if c.status == "draft":
            cyc_svc.move_clock(s, pm(s), c.id, 1)
            cyc_svc.send_kickoff(s, pm(s), c.id)
            log("Q1 kickoff sent")
    if until == "Q1":
        return
    with session_scope() as s:
        c = _cycle(s)
        for day in range(max(2, c.current_day), 13):
            clock(s, day)
            n = generator.deliver_borrower_mail(day)
            intake.process_inbox(s, c.id)
            if day in (8, 10):
                for r in intake.draft_chases(s, c.id):
                    intake.send_chase(s, pm(s), r.id)
            for d in s.query(Document).filter_by(cycle_id=c.id, store="uploads", status="parsed"):
                intake.confirm_classification(s, pm(s), d.id, d.doc_type or "financial_statements")
            if day >= 9:
                for cl in _loans(s, c):
                    if cl.package_status == "complete" and cl.lincoln_step == "Q1":
                        lincoln.share_package(s, pm(s), cl.id)
            if n:
                log(f"Q2 day {day}: {n} borrower emails processed")
    log("Q2/Q3 intake complete and packages shared")
    if until in ("Q2", "Q3"):
        return
    _modelling(until, log)
    if not reached(until, "Q10"):
        return
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 20)
        if not s.query(Document).filter_by(cycle_id=c.id, doc_type="lincoln_marks").first():
            generator.deliver_lincoln(1)
            lincoln.ingest_lincoln(s, c.id)
            log("Q10 Lincoln v1 received")
    if not reached(until, "Q11"):
        return
    with session_scope() as s:
        c = _cycle(s)
        _finish_reviews(s, c, log)
        clock(s, 27)
        if not s.query(ImpactSummary).filter_by(cycle_id=c.id).first():
            imp = tracker.draft_impact(s, pm(s), c.id)
            tracker.send_impact(s, pm(s), imp.id)
            log(f"Q11 impact note v1 sent: delta {imp.delta:+.3f}")
    if not reached(until, "Q12"):
        return
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 28)
        lincoln.load_to_everest(s, pm(s), c.id)
        lincoln.copy_to_sharepoint(s, pm(s), c.id)
        log("Q12/Q13 loaded to Everest and copied to SharePoint")
    if not reached(until, "Q14"):
        return
    _gate1(log)
    if not reached(until, "Q16"):
        return
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 36)
        if not committee.latest_agenda(s, c.id):
            committee.build_agenda(s, pm(s), c.id)
            log("Q16 agenda built")
    if not reached(until, "Q17"):
        return
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 38)
        ag = committee.latest_agenda(s, c.id)
        from domain.models import CommitteePack

        if not s.query(CommitteePack).filter_by(agenda_id=ag.id).first():
            p = committee.build_pack(s, pm(s), c.id)
            committee.send_pack(s, pm(s), p.id)
            log("Q17 pack built and sent")
    if not reached(until, "Q18"):
        return
    _committee(log)
    if not reached(until, "Q19"):
        return
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 44)
        from domain.models import ReconciliationRun

        if not s.query(ReconciliationRun).filter_by(cycle_id=c.id, status="clean").first():
            run = closing.run_reconciliation(s, pm(s), c.id)
            log(f"Q19 reconciliation run {run.run_no}: {run.mismatch_count} mismatches")
            for it in s.query(ReconciliationItem).filter_by(run_id=run.id, status="mismatch"):
                closing.resolve_item(s, pm(s), it.id, "corrected_target",
                                     "Everest pricing panel updated to the committee mark")
            run2 = closing.run_reconciliation(s, pm(s), c.id)
            log(f"Q19 reconciliation run {run2.run_no}: {run2.status}, schedule "
                f"${closing.schedule(s, c.id)['total']:.3f}M")
    if not reached(until, "Q20"):
        return
    with session_scope() as s:
        c = _cycle(s)
        from domain.models import ApprovalRequest

        req = s.query(ApprovalRequest).filter_by(cycle_id=c.id, kind="final_marks").first()
        if not req:
            req = closing.request_approval(s, pm(s), c.id)
            closing.decide_approval(s, actor(s, "vc.chair@ab-poc.local"), req.id, "approved",
                                    "Approved as scheduled, including the Sunrise change to 88.5.")
            log("Q20 written approval recorded (G2)")
    if not reached(until, "Q21"):
        return
    with session_scope() as s:
        c = _cycle(s)
        from domain.models import GovernanceSignoff

        if not s.query(GovernanceSignoff).filter_by(cycle_id=c.id, status="signed").first():
            closing.governance(s, actor(s, "governance@ab-poc.local"), c.id, "signed")
            log("Q21 governance sign-off recorded (G3)")
    if not reached(until, "Q22"):
        return
    with session_scope() as s:
        c = _cycle(s)
        if c.status != "closed":
            closing.distribute(s, pm(s), c.id)
            sch = closing.schedule(s, c.id)
            log(f"Q22 distributed; cycle closed. Portfolio {sch['total']:.3f}M ({sch['delta']:+.3f}M); "
                f"story loans {sch['story_total']:.3f}M")
    if reached(until, "M1"):
        play_monthly(until, log)


def _team_actor(s, cl):
    return actor(s, cl.analyst_email)


def _modelling(until, log):
    """Q4 to Q9 for every loan; Harbor carries the review loop from the source notes."""
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 14)
        for cl in _loans(s, c):
            a = _team_actor(s, cl)
            sp = spreads.current_spread(s, cl.id)
            if sp is None:
                sp = spreads.run_spreading(s, a, cl.id)
            if sp.status != "approved":
                b, _ = FACS[cl.facility_id]
                for code in sp.not_found_lines or []:
                    if code in b.fin and isinstance(b.fin[code], list):
                        for ptype, idx in (("same_quarter_last_year", 0), ("q_minus_3", 1), ("q_minus_2", 2),
                                           ("prior_quarter", 3), ("quarter", 4)):
                            spreads.add_line(s, a, sp.id, code, ptype, b.fin[code][idx],
                                             "keyed from the scanned page 2 of the reporting pack")
                    elif code in b.fin:
                        spreads.add_line(s, a, sp.id, code, "quarter", b.fin[code], "keyed from the scanned pack")
                spreads.approve_spread(s, a, sp.id)
        log("Q4 spreads proposed by A1 and approved by the analysts")
    if not reached(until, "Q5"):
        return
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 17)
        for cl in _loans(s, c):
            a = _team_actor(s, cl)
            cmr = cmrs.get_or_create_cmr(s, a, cl.id)
            if cmr.status != "draft" or cmr.submitted_at:
                continue
            cmrs.draft_sections(s, a, cmr.id)
            for sec in s.query(CmrSection).filter_by(cmr_id=cmr.id):
                if sec.draft_body_markdown:
                    cmrs.decide_section(s, a, sec.id, "accept")
            rec = s.query(CmrRecommendation).filter_by(cmr_id=cmr.id).one()
            sug = s.get(AgentSuggestion, rec.agent_suggestion_id).payload_json
            data = {k: sug[k] for k in ("proposed_rating", "watchlist_action", "waiver_requested",
                                        "expected_mark_direction", "rationale")}
            if cl.facility_id == "F-0002":
                data["waiver_conditions"] = "Monthly reporting; leverage step-down to 3.25x by 30 June 2027"
            cmrs.set_recommendation(s, a, cmr.id, data)
            for d in intake.loan_documents(s, cl):
                if cl.facility_id == "F-0002" and d.doc_type == "sponsor_letter":
                    continue  # the source note: the equity letter was missing on first submission
                cmrs.attach_evidence(s, a, cmr.id, d.id, "recommendation")
            res = cmrs.submit(s, a, cmr.id)
            if not res["submitted"]:
                cmrs.submit(s, a, cmr.id, acknowledge_warnings=True)
        log("Q5 CMRs drafted with A2 and submitted (A3 checked)")
    if not reached(until, "Q6"):
        return
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 19)
        for cl in _loans(s, c):
            cmr = cmrs.latest_cmr(s, cl.id)
            if cmr.current_stage == "ac_manager":
                rv = cmrs.open_review(s, cmr)
                cmrs.decide_review(s, actor(s, cl.ac_manager_email), rv.id, "passed")
        log("Q6 A/C Manager reviews passed")
    if not reached(until, "Q7"):
        return
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 21)
        harbor = _loan(s, c, "F-0002")
        for cl in _loans(s, c):
            cmr = cmrs.latest_cmr(s, cl.id)
            if cmr.current_stage != "pm_team":
                continue
            rv = cmrs.open_review(s, cmr)
            if cl.id == harbor.id and (cl.loop_counts_json or {}).get("QB", 0) == 0:
                for sec, text in (("sponsor_collateral", "Attach the Northgate equity commitment letter."),
                                  ("sponsor_collateral", "Add the date of the truck appraisal."),
                                  ("risks", "Add a sentence on customer concentration after the loss.")):
                    cmrs.add_comment(s, pm(s), rv.id, sec, text)
                cmrs.decide_review(s, pm(s), rv.id, "sent_back")
            else:
                cmrs.decide_review(s, pm(s), rv.id, "passed")
        # Harbor analyst fixes the three comments and resubmits (loop QB x1)
        cmr = cmrs.latest_cmr(s, harbor.id)
        if cmr.status == "draft":
            a = _team_actor(s, harbor)
            letter = next(d for d in intake.loan_documents(s, harbor) if d.doc_type == "sponsor_letter")
            cmrs.attach_evidence(s, a, cmr.id, letter.id, "mitigant")
            secs = {x.section_code: x for x in s.query(CmrSection).filter_by(cmr_id=cmr.id)}
            cmrs.decide_section(s, a, secs["sponsor_collateral"].id, "save",
                                secs["sponsor_collateral"].body_markdown.replace(
                                    "appraised value of about $38M.",
                                    "appraised value of about $38M (appraisal dated 15 August 2026)."))
            cmrs.decide_section(s, a, secs["risks"].id, "save", secs["risks"].body_markdown +
                                " Customer concentration: the top five customers now represent 41 percent of revenue, "
                                "down from 55 percent.")
            for rv in s.query(CmrReview).filter_by(cmr_id=cmr.id):
                from domain.models import CmrReviewComment

                for cm in s.query(CmrReviewComment).filter_by(cmr_review_id=rv.id, resolved=False):
                    cmrs.resolve_comment(s, a, cm.id, "Done in this version")
            cmrs.submit(s, a, cmr.id, acknowledge_warnings=True)
            rv = cmrs.open_review(s, cmr)
            cmrs.decide_review(s, actor(s, harbor.ac_manager_email), rv.id, "passed")
            rv = cmrs.open_review(s, cmr)
            cmrs.decide_review(s, pm(s), rv.id, "passed")
        log("Q7 PM Team reviews done; Harbor sent back once (QB x1) and resubmitted")
    if not reached(until, "Q8"):
        return
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 24)
        for cl in _loans(s, c):
            cmr = cmrs.latest_cmr(s, cl.id)
            if cmr.current_stage == "file":
                cmrs.file_cmr(s, pm(s), cmr.id)
        log("Q8 CMRs filed to SharePoint (v1) and written to Everest")


def _finish_reviews(s, c, log):
    """Q9 SCT review; Harbor gets one SCT comment and is re-filed as v2."""
    clock(s, 26)
    sct = actor(s, "sct.reviewer@ab-poc.local")
    for cl in _loans(s, c):
        cmr = cmrs.latest_cmr(s, cl.id)
        if cmr.current_stage == "sct":
            rv = cmrs.open_review(s, cmr)
            if cl.facility_id == "F-0002":
                cmrs.add_comment(s, sct, rv.id, "covenants_liquidity",
                                 "State the waiver conditions explicitly in the covenant commentary.")
            cmrs.decide_review(s, sct, rv.id, "passed")
    harbor = _loan(s, c, "F-0002")
    cmr = cmrs.latest_cmr(s, harbor.id)
    if cmr.status == "filed" and cmr.version == 1:
        a = _team_actor(s, harbor)
        from domain.models import CmrReviewComment

        for rv in s.query(CmrReview).filter_by(cmr_id=cmr.id, stage="sct"):
            for cm in s.query(CmrReviewComment).filter_by(cmr_review_id=rv.id, resolved=False):
                cmrs.resolve_comment(s, a, cm.id, "Waiver conditions added: monthly reporting and 3.25x step-down")
        cmrs.file_cmr(s, pm(s), cmr.id)
    log("Q9 SCT reviews done; Harbor re-filed as v2")


def _gate1(log):
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 27)
        for cl in _loans(s, c):
            if cl.status in ("approved",) or cl.facility_id == "F-0002":
                continue
            lead = actor(s, cl.lead_email)
            b, f = FACS[cl.facility_id]
            if f.g1_mark is not None:
                valuation.decide_g1(s, lead, cl.id, "approved_different_mark", mark=f.g1_mark, rationale=f.g1_rationale)
            else:
                valuation.decide_g1(s, lead, cl.id, "approved")
        harbor = _loan(s, c, "F-0002")
        if (harbor.loop_counts_json or {}).get("QA", 0) == 0:
            lead = actor(s, harbor.lead_email)
            sug = valuation.run_challenge(s, lead, harbor.id)
            valuation.decide_g1(s, lead, harbor.id, "sent_back", reason_category="new_information",
                                note=sug.payload_json["draft_note"], evidence=sug.payload_json["evidence"],
                                used_tiq_draft=True)
            log("Q14 G1: 23 approved; Harbor sent back with the A5 challenge (QA x1)")
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 29)
        harbor = _loan(s, c, "F-0002")
        if lincoln.latest_valuation(s, harbor.id).version == 1:
            generator.deliver_lincoln(2)
            lincoln.ingest_lincoln(s, c.id)
            lincoln.load_to_everest(s, pm(s), c.id)
            lincoln.copy_to_sharepoint(s, pm(s), c.id)
            log("Q10 loop: Lincoln v2 for Harbor received and loaded")
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 30)
        harbor = _loan(s, c, "F-0002")
        if harbor.status != "approved":
            valuation.decide_g1(s, actor(s, harbor.lead_email), harbor.id, "approved")
            imp = tracker.draft_impact(s, pm(s), c.id)
            tracker.send_impact(s, pm(s), imp.id)
            log(f"Q14 Harbor approved at 88.0; impact note v2 sent: delta {imp.delta:+.3f}")
        clock(s, 31)


def _committee(log):
    with session_scope() as s:
        c = _cycle(s)
        clock(s, 42)
        ag = committee.latest_agenda(s, c.id)
        members = ["vc.member1@ab-poc.local", "vc.member2@ab-poc.local", "vc.chair@ab-poc.local"]
        chair = actor(s, "vc.chair@ab-poc.local")
        for it in s.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id, removed=False):
            if it.status != "pending":
                continue
            cl = s.get(CycleLoan, it.cycle_loan_id)
            rec = s.query(CmrRecommendation).join(Cmr, Cmr.id == CmrRecommendation.cmr_id).filter(
                Cmr.cycle_loan_id == cl.id).order_by(Cmr.version.desc()).first()
            if cl.facility_id == "F-0003":
                committee.record_decision(s, chair, it.id, "change", decided_mark=SUNRISE_COMMITTEE["mark"],
                                          rating=rec.proposed_rating, watchlist_action="keep",
                                          rationale=SUNRISE_COMMITTEE["rationale"], members_present=members)
            elif cl.facility_id == "F-0002":
                committee.record_decision(s, chair, it.id, "approve", rating=5, watchlist_action="keep",
                                          waiver_decision="approved_with_conditions",
                                          conditions="Monthly reporting; leverage step-down to 3.25x by 30 June 2027",
                                          rationale="Approved at 88.0; sponsor equity received 30 October.",
                                          members_present=members)
            else:
                committee.record_decision(s, chair, it.id, "approve", rating=rec.proposed_rating,
                                          watchlist_action=rec.watchlist_action, members_present=members)
        log("Q18 committee decisions recorded: Harbor 88.0, Sunrise 88.5")


def play_monthly(until: str, log=print) -> None:
    from domain.models import ApprovalRequest, DdtlRebalance, MonthlyUpdateRow

    with session_scope() as s:
        m = monthly.create_monthly_cycle(s, pm(s))
        if not s.query(MonthlyUpdateRow).filter_by(cycle_id=m.id).first():
            monthly.build_update_file(s, pm(s), m.id)
            log("M1 monthly update file built")
    if until == "M1":
        return
    with session_scope() as s:
        m = s.query(ValuationCycle).filter_by(cycle_type="monthly").one()
        if s.query(MonthlyUpdateRow).filter_by(cycle_id=m.id, status="not_started").first():
            monthly.email_teams(s, pm(s), m.id)
            log("M2 deal teams emailed")
    if until == "M2":
        return
    with session_scope() as s:
        m = s.query(ValuationCycle).filter_by(cycle_type="monthly").one()
        for r in s.query(MonthlyUpdateRow).filter_by(cycle_id=m.id, status="requested"):
            from synth.portfolio import team_emails

            a = actor(s, team_emails(r.deal_team_id)["analyst"])
            mark = r.current_mark
            d = monthly.draft_rationale(s, a, m.id, r.facility_id, mark)
            monthly.submit_proposal(s, a, m.id, r.facility_id, mark, d["rationale"], d["suggestion_id"])
        log("M3 proposals submitted with A10 rationales")
    if until == "M3":
        return
    with session_scope() as s:
        m = s.query(ValuationCycle).filter_by(cycle_type="monthly").one()
        for d in s.query(DdtlRebalance).filter_by(cycle_id=m.id, confirmed_by=None):
            monthly.confirm_ddtl(s, actor(s, "team.violet.analyst@ab-poc.local"), d.id)
        log("M4 DDTL rebalances confirmed")
    if until == "M4":
        return
    with session_scope() as s:
        m = s.query(ValuationCycle).filter_by(cycle_type="monthly").one()
        from domain.models import MonthlyMarksFile

        if not s.query(MonthlyMarksFile).filter_by(cycle_id=m.id).first():
            monthly.consolidate(s, pm(s), m.id)
            log("M5 consolidated")
    if until == "M5":
        return
    with session_scope() as s:
        m = s.query(ValuationCycle).filter_by(cycle_type="monthly").one()
        if not s.query(ApprovalRequest).filter_by(cycle_id=m.id).first():
            monthly.request_monthly_approval(s, pm(s), m.id)
        chair = actor(s, "vc.chair@ab-poc.local")
        for r in s.query(MonthlyUpdateRow).filter_by(cycle_id=m.id, status="proposed"):
            monthly.decide_monthly(s, chair, m.id, r.facility_id, "approved")
        log("M6 monthly marks approved by the committee")


__all__ = ["play", "play_monthly", "STEPS", "Reminder"]
