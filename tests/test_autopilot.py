"""Demo autopilot: every loan except Harbor moves through the routine steps as its own people."""
import pytest

from domain.db import session_scope
from domain.models import AuditEvent, CycleLoan, LincolnPackage, ValuationCycle
from domain.services import cmrs, lincoln, spreads
from synth import autopilot, world
from synth.play import pm


@pytest.fixture(scope="module")
def cycle_at_q1():
    from tests.conftest import _ensure_test_db
    from synth.cli import reset

    _ensure_test_db()
    reset("duckdb", "Q1", log=lambda m: None)
    with session_scope() as s:
        return s.query(ValuationCycle).filter_by(cycle_type="quarterly").one().id


def _others(s):
    return s.query(CycleLoan).filter(CycleLoan.facility_id != "F-0002", CycleLoan.in_scope.is_(True)).all()


def test_autopilot_keeps_pace_with_harbor_and_never_runs_ahead(cycle_at_q1):
    with session_scope() as s:
        autopilot.set_setting(s, ["F-0002"])
    with session_scope() as s:
        world.advance(s, pm(s), cycle_at_q1, 21)  # every package in; Harbor waits at "share with Lincoln"
    with session_scope() as s:
        harbor = s.query(CycleLoan).filter_by(facility_id="F-0002").one()
        assert harbor.package_status == "complete" and spreads.current_spread(s, harbor.id) is None
        # Harbor has not been shared yet, so neither have the others: they never run ahead of Harbor
        for cl in _others(s):
            assert s.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first() is None
            assert spreads.current_spread(s, cl.id) is None and cmrs.latest_cmr(s, cl.id) is None
        assert all(lincoln.latest_valuation(s, cl.id) is None for cl in _others(s))
        lincoln.share_package(s, pm(s), harbor.id)  # the presenter shares Harbor
        autopilot.follow(s, cycle_at_q1)
    with session_scope() as s:
        world.advance(s, pm(s), cycle_at_q1, 22)  # Lincoln drafts for every loan
    with session_scope() as s:
        harbor = s.query(CycleLoan).filter_by(facility_id="F-0002").one()
        for cl in _others(s):  # caught up with Harbor's sharing, nothing past it; no Gate 1 before Harbor's
            assert s.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first() is not None
            assert spreads.current_spread(s, cl.id) is None and cmrs.latest_cmr(s, cl.id) is None, cl.facility_id
            assert cl.status != "approved"
        assert not s.query(AuditEvent).filter(AuditEvent.action.like("valuation_decision%")).count()
        autopilot.set_setting(s, None)


def test_next_event_names_what_the_outside_world_does(cycle_at_q1):
    """No clock in the UI: one button says what borrowers or Lincoln do next."""
    from domain.db import session_scope as ss

    with ss() as s:
        ev = world.next_event(s, cycle_at_q1)
        # this module's earlier test already moved past intake and Lincoln v1
        assert ev is None or ev["key"] in ("revision", "waiting", "lincoln")
