"""Demo autopilot: every loan except Harbor moves through the routine steps as its own people."""
import pytest

from domain.db import session_scope
from domain.models import AuditEvent, CycleLoan, ValuationCycle
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


def test_autopilot_leaves_harbor_and_moves_the_rest(cycle_at_q1):
    with session_scope() as s:
        autopilot.set_setting(s, ["F-0002"])
    with session_scope() as s:
        world.advance(s, pm(s), cycle_at_q1, 20)  # packages in; autopilot shares, spreads, drafts, reviews, files
    with session_scope() as s:
        world.advance(s, pm(s), cycle_at_q1, 21)  # Lincoln drafts only once Harbor is shared too
    with session_scope() as s:
        harbor = s.query(CycleLoan).filter_by(facility_id="F-0002").one()
        assert spreads.current_spread(s, harbor.id) is None and cmrs.latest_cmr(s, harbor.id) is None
        others = s.query(CycleLoan).filter(CycleLoan.facility_id != "F-0002", CycleLoan.in_scope.is_(True)).all()
        assert all(cmrs.latest_cmr(s, cl.id).status in ("filed", "agreed") for cl in others)
        # Lincoln waits for Harbor's package: nothing is valued yet
        assert all(lincoln.latest_valuation(s, cl.id) is None for cl in others)
        lincoln.share_package(s, pm(s), harbor.id)  # the presenter shares Harbor
    with session_scope() as s:
        world.advance(s, pm(s), cycle_at_q1, 22)
    with session_scope() as s:
        others = s.query(CycleLoan).filter(CycleLoan.facility_id != "F-0002", CycleLoan.in_scope.is_(True)).all()
        assert all(cl.status == "approved" for cl in others), [(cl.facility_id, cl.status) for cl in others]
        granite = s.query(CycleLoan).filter_by(facility_id="F-0014").one()
        assert granite.status == "approved"
        roles = {e.actor_role for e in s.query(AuditEvent).filter(AuditEvent.action.like("valuation_decision%"))}
        assert roles == {"deal_lead"}
        harbor = s.query(CycleLoan).filter_by(facility_id="F-0002").one()
        assert harbor.status != "approved"
        autopilot.set_setting(s, None)


def test_next_event_names_what_the_outside_world_does(cycle_at_q1):
    """No clock in the UI: one button says what borrowers or Lincoln do next."""
    from domain.db import session_scope as ss

    with ss() as s:
        ev = world.next_event(s, cycle_at_q1)
        # this module's earlier test already moved past intake and Lincoln v1
        assert ev is None or ev["key"] in ("revision", "waiting", "lincoln")
