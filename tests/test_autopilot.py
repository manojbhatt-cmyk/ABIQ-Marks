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


def test_loans_move_on_their_own_and_never_wait_for_harbor(cycle_at_q1):
    """AllianceBernstein's process: each loan moves on its own until Gate 1 (decision D34)."""
    with session_scope() as s:
        autopilot.set_setting(s, ["F-0002"])
    stages = []
    for day in (16, 20, 34):
        with session_scope() as s:
            world.advance(s, pm(s), cycle_at_q1, day)
        with session_scope() as s:
            stages.append({cl.facility_id: cl.current_step for cl in _others(s)})
    with session_scope() as s:
        harbor = s.query(CycleLoan).filter_by(facility_id="F-0002").one()
        assert spreads.current_spread(s, harbor.id) is None  # nobody touched Harbor
        assert lincoln.latest_valuation(s, harbor.id) is None  # Harbor was never shared, so Lincoln has nothing
        assert any(len(set(st.values())) > 1 for st in stages), stages  # loans at different stages on the same day
        others = _others(s)
        assert all(lincoln.latest_valuation(s, cl.id) for cl in others)  # Lincoln drafted loan by loan anyway
        assert any(cl.status == "approved" for cl in others)  # some loans passed Gate 1 while Harbor has not started
        assert s.query(AuditEvent).filter(AuditEvent.action.like("valuation_decision%")).count()
        autopilot.set_setting(s, None)


def test_next_event_names_what_the_outside_world_does(cycle_at_q1):
    """No clock in the UI: one button says what borrowers or Lincoln do next."""
    from domain.db import session_scope as ss

    with ss() as s:
        ev = world.next_event(s, cycle_at_q1)
        # this module's earlier test already moved past intake and Lincoln v1
        assert ev is None or ev["key"] in ("revision", "lincoln", "deadline", "cmr_revision")
