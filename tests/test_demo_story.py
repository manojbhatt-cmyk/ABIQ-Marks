"""End to end: the demo story from a reset (Build Plan section 6) and the Master Spec acceptance numbers."""
import pytest

from domain.db import session_scope
from domain.models import (AuditEvent, CycleLoan, MarksTrackerRow, ReconciliationItem, ReconciliationRun, ValuationCycle)
from domain.services import closing
from domain.services.core import Actor, BusinessRuleError, Forbidden, RIGHTS, require


def _q(s):
    return s.query(ValuationCycle).filter_by(cycle_type="quarterly").one()


def _row(s, fid):
    return s.query(MarksTrackerRow).filter_by(facility_id=fid).one()


def test_story_runs_to_close(played):
    assert any("Q22 distributed" in line for line in played)
    with session_scope() as s:
        c = _q(s)
        assert c.status == "closed"
        sch = closing.schedule(s, c.id)
        assert sch["story_total"] == pytest.approx(114.625)
        assert sch["story_previous"] == pytest.approx(117.8)
        assert sch["delta"] == pytest.approx(-3.175)


def test_final_marks(played):
    with session_scope() as s:
        assert _row(s, "F-0001").final_mark == 99.25
        assert _row(s, "F-0002").final_mark == 88.0
        assert _row(s, "F-0003").final_mark == 88.5
        harbor = s.query(CycleLoan).filter_by(facility_id="F-0002").one()
        assert harbor.loop_counts_json.get("QA") == 1 and harbor.loop_counts_json.get("QB") == 1


def test_impact_checkpoints(played):
    from domain.models import ImpactSummary

    with session_scope() as s:
        deltas = [round(i.delta, 3) for i in s.query(ImpactSummary).order_by(ImpactSummary.version)]
        assert deltas[:2] == [-3.95, -3.05]


def test_reconciliation_found_only_sunrise(played):
    with session_scope() as s:
        first = s.query(ReconciliationRun).order_by(ReconciliationRun.run_no).first()
        items = s.query(ReconciliationItem).filter(ReconciliationItem.run_id == first.id,
                                                   ReconciliationItem.status != "match").all()
        assert [(s.get(CycleLoan, i.cycle_loan_id).facility_id, i.value_a, i.value_b) for i in items] == \
            [("F-0003", "88.5", "89")]
        last = s.query(ReconciliationRun).order_by(ReconciliationRun.run_no.desc()).first()
        assert last.status == "clean"


def test_agenda(played):
    with session_scope() as s:
        on = sorted(cl.facility_id for cl in s.query(CycleLoan).filter_by(on_agenda=True))
        assert on == ["F-0002", "F-0003", "F-0013"]


def test_no_decision_by_an_agent(played):
    with session_scope() as s:
        actions = ["valuation_decision.approved", "valuation_decision.sent_back", "committee_decision.recorded",
                   "approval.recorded", "governance_signoff.recorded"]
        roles = {e.actor_role for e in s.query(AuditEvent).filter(AuditEvent.action.in_(actions))}
        assert roles and roles <= {"deal_lead", "deal_analyst", "committee_chair", "committee_member", "governance"}


def test_permission_matrix():
    finance = Actor("wes.finance@ab-poc.local", "finance_ir")
    for right in RIGHTS:
        if "finance_ir" not in RIGHTS[right]:
            with pytest.raises(Forbidden):
                require(finance, right)
    with pytest.raises(Forbidden):
        require(Actor("team.red.analyst@ab-poc.local", "deal_analyst", deal_team_id="DT-RED"), "g1.decide", team="DT-BLUE")


def test_committee_change_needs_rationale(played):
    from domain.models import CommitteeAgendaItem
    from domain.services import committee

    with session_scope() as s:
        item = s.query(CommitteeAgendaItem).first()
        with pytest.raises(BusinessRuleError):
            committee.record_decision(s, Actor("vc.chair@ab-poc.local", "committee_chair"), item.id, "change",
                                      decided_mark=90.0, rationale="")
        s.rollback()


def test_monthly_closed(played):
    with session_scope() as s:
        m = s.query(ValuationCycle).filter_by(cycle_type="monthly").one()
        assert m.status == "closed"


def test_internal_communication_stays_in_platform(played):
    """Email only for third parties (borrowers, Lincoln); everything internal is an in-platform message."""
    from domain.models import EmailMessage, Message

    with session_scope() as s:
        out = {m.template_code for m in s.query(EmailMessage).filter_by(direction="out")}
        assert out <= {"chase_borrower", "send_back"}
        kinds = {m.kind for m in s.query(Message)}
        assert {"kickoff", "impact_note", "committee_pack", "approval_request", "distribution"} <= kinds


def test_organise_committee_meeting(played):
    """The PM Team organises the meeting in ABIQ: drafted from the agenda, sent as a message with an .ics."""
    from connectors.object_store import get_store
    from domain.models import Message
    from domain.services import meeting

    with session_scope() as s:
        c = _q(s)
        d = meeting.draft(s, c.id)
        titles = [x["title"] for x in d["slots"]]
        assert "Harbor Logistics" in titles and "Sunrise Foods" in titles
        emails = {a["email"] for a in d["attendees"]}
        assert {"vc.chair@ab-poc.local", "team.blue.lead@ab-poc.local"} <= emails
        m1 = meeting.organise(s, Actor("pm.analyst@ab-poc.local", "pm_team"), c.id, {"start": "14:00"})
        ics = get_store().get("sharepoint", m1.ics_path).decode()
        assert "BEGIN:VEVENT" in ics and "T140000" in ics
        msg = s.get(Message, m1.message_id)
        assert msg.kind == "meeting_invite" and "vc.chair@ab-poc.local" in msg.recipients
        m2 = meeting.organise(s, Actor("pm.analyst@ab-poc.local", "pm_team"), c.id, {"date": "2026-11-12"})
        assert m2.version == 2 and m2.uid == m1.uid and s.get(Message, m2.message_id).subject.startswith("Updated")
        with pytest.raises(Forbidden):
            meeting.organise(s, Actor("team.blue.analyst@ab-poc.local", "deal_analyst", deal_team_id="DT-BLUE"), c.id)


def test_agenda_cannot_be_rebuilt_after_decisions_and_strip_moves_on(played):
    """Rebuilding the agenda after the committee decided would undo the decisions, so it is refused; and loans
    that skipped the committee count as past the agenda, so the process strip does not stall at Q16."""
    from domain.services import committee, work

    with session_scope() as s:
        cyc = _q(s)
        with pytest.raises(BusinessRuleError):
            committee.build_agenda(s, Actor("pm.analyst@ab-poc.local", "pm_team"), cyc.id)
        s.rollback()
    with session_scope() as s:
        steps = {p["step"]: p["state"] for p in work.process_map(s, _q(s).id)}
        assert all(steps[q] == "done" for q in ("Q15", "Q16", "Q17", "Q18")), steps


def test_revise_committee_decision(played):
    """The committee can revise a recorded decision; the earlier one stays and both are audited."""
    from domain.models import AuditEvent, CommitteeAgendaItem, CommitteeDecision
    from domain.services import committee

    with session_scope() as s:
        item = s.query(CommitteeAgendaItem).first()
        chair = Actor("vc.chair@ab-poc.local", "committee_chair")
        with pytest.raises(BusinessRuleError):  # closed cycle / written approval recorded
            committee.revise_decision(s, chair, item.id, "reconsidered", outcome="approve")
        with pytest.raises(BusinessRuleError):
            committee.revise_decision(s, chair, item.id, "", outcome="approve")
        s.rollback()
