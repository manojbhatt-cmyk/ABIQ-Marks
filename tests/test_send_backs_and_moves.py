"""Send-backs that take time on the clock, and the Mark Move Monitor (A10)."""
import pytest

from domain.db import session_scope
from domain.models import AuditEvent, CycleLoan, Notification, ValuationCycle, ValuationDecision
from domain.services import cmrs, mark_moves
from synth import autopilot, world
from synth.play import pm


@pytest.fixture(scope="module")
def cycle_id():
    from tests.conftest import _ensure_test_db
    from synth.cli import reset

    _ensure_test_db()
    reset("duckdb", "Q1", log=lambda m: None)
    with session_scope() as s:
        autopilot.set_setting(s, [])  # nobody presented: every loan moves on its own
    with session_scope() as s:
        cid = s.query(ValuationCycle).filter_by(cycle_type="quarterly").one().id
    with session_scope() as s:
        world.advance(s, pm(s), cid, 40)
    return cid


def _loan(s, fid):
    return s.query(CycleLoan).filter_by(facility_id=fid).one()


def _events(s, fid, action):
    return s.query(AuditEvent).filter_by(cycle_loan_id=_loan(s, fid).id, action=action).order_by(AuditEvent.occurred_at).all()


@pytest.mark.parametrize("fid,days", [("F-0003", 2), ("F-0013", 1)])
def test_pm_team_sends_back_and_the_fix_takes_days(cycle_id, fid, days):
    with session_scope() as s:
        sent = _events(s, fid, "demo.scripted_send_back")
        assert len(sent) == 1 and sent[0].after_json["stage"] == "pm_team"
        resubmits = [e for e in _events(s, fid, "cmr.submitted") if e.occurred_at > sent[0].occurred_at]
        assert resubmits and resubmits[0].cycle_day >= sent[0].cycle_day + days
        cl = _loan(s, fid)
        assert (cl.loop_counts_json or {}).get("QB") == 1
        assert cmrs.latest_cmr(s, cl.id).status in ("filed", "agreed")


def test_gate1_send_back_to_lincoln_and_big_moves_flagged(cycle_id):
    with session_scope() as s:
        kestrel = _loan(s, "F-0015")
        outcomes = [d.outcome for d in s.query(ValuationDecision).filter_by(cycle_loan_id=kestrel.id)
                    .order_by(ValuationDecision.decided_at)]
        assert outcomes[0] == "sent_back" and outcomes[-1] != "sent_back"  # Lincoln answered, then Gate 1 passed
        flags = {e.after_json["facility_id"]: e.after_json for e in
                 s.query(AuditEvent).filter_by(action="mark_move.flagged")}
        assert flags["F-0003"]["level"] == "alert"  # Sunrise 80 to 89: +11 percent
        assert flags["F-0002"]["level"] in ("warning", "alert")  # Harbor falls from 97
        assert "F-0001" not in flags and "F-0015" not in flags
        assert s.query(Notification).filter_by(kind="mark_move", user_email="pm.analyst@ab-poc.local").count() >= 2


def test_every_loan_passes_gate1_at_its_own_time(cycle_id):
    with session_scope() as s:
        days = {}
        for cl in s.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True):
            d = s.query(ValuationDecision).filter(ValuationDecision.cycle_loan_id == cl.id,
                                                  ValuationDecision.outcome != "sent_back").first()
            assert d is not None, cl.facility_id
            days[cl.facility_id] = d.decided_day
        assert len(set(days.values())) > 1, days
        autopilot.set_setting(s, None)


def test_move_levels():
    with session_scope() as s:
        assert mark_moves.assess(s, 100, 104)["level"] is None
        assert mark_moves.assess(s, 100, 95)["level"] == "warning"
        assert mark_moves.assess(s, 100, 110)["level"] == "alert"
        assert mark_moves.assess(s, None, 90) is None
