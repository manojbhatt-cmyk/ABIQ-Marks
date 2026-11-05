"""Valuation routes (M7.3.1), universe refresh (M1.1.2), SCT deferral (M6.4.1), FCCR and liquidity (M4.3.1).

Runs after test_demo_story (alphabetical order) and resets the test stores to Q1.
"""
import pytest

from domain import metrics as M
from domain.db import session_scope
from domain.models import CycleLoan, LincolnValuation, SctSession, ValuationCycle
from domain.services import cycle as cyc_svc
from domain.services import intake, lincoln, sct, valuation, work
from domain.services.core import Actor, BusinessRuleError
from synth.play import pm


@pytest.fixture(scope="module")
def at_q1(played):
    from synth.cli import reset

    reset("duckdb", "Q1", log=lambda m: None)


def _loan(s, fid):
    return s.query(CycleLoan).filter_by(facility_id=fid).one()


def test_valuation_routes_end_to_end(at_q1):
    from synth import world

    with session_scope() as s:
        c = s.query(ValuationCycle).filter_by(cycle_type="quarterly").one()
        for fid, method in (("F-0010", "Cost"), ("F-0018", "AB proposal"), ("F-0024", "Sponsor value")):
            cyc_svc.set_valuation_method(s, pm(s), _loan(s, fid).id, method, "test route")
        world.advance(s, pm(s), c.id, 12)
        for cl in s.query(CycleLoan).filter_by(cycle_id=c.id, in_scope=True):
            if cl.package_status != "complete":
                intake.mark_complete(s, pm(s), cl.id, "test")
            if cl.valuation_method == "Lincoln" and not lincoln.latest_valuation(s, cl.id):
                from domain.models import LincolnPackage

                if not s.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first():
                    lincoln.share_package(s, pm(s), cl.id)
        with pytest.raises(BusinessRuleError):
            lincoln.share_package(s, pm(s), _loan(s, "F-0010").id)
        titles = [i["title"] for i in work.my_work(s, pm(s), c.id)["items"]]
        assert any("cost mark" in t and "Pinecrest" in t for t in titles)
        world.advance(s, pm(s), c.id, 20)
        lincoln_rows = s.query(LincolnValuation).filter_by(source="lincoln").count()
        assert lincoln_rows == 21
        cost = valuation.record_internal_valuation(s, pm(s), _loan(s, "F-0010").id, None, "")
        assert cost.point_estimate == pytest.approx(98.0)
        sponsor = valuation.record_internal_valuation(s, pm(s), _loan(s, "F-0024").id, 97.5, "Sponsor NAV statement Q3")
        assert sponsor.source == "sponsor_value"
        lead = Actor("team.green.lead@ab-poc.local", "deal_lead", deal_team_id="DT-GREEN")
        ab = valuation.record_internal_valuation(s, lead, _loan(s, "F-0018").id, 98.5, "Comparable recent repricing")
        assert ab.source == "ab_proposal"
        with pytest.raises(Exception):
            valuation.record_internal_valuation(s, pm(s), _loan(s, "F-0018").id, 99.0, "pm cannot propose for the deal team")


def test_universe_refresh_is_idempotent(at_q1):
    with session_scope() as s:
        c = s.query(ValuationCycle).filter_by(cycle_type="quarterly").one()
        r = cyc_svc.refresh_universe(s, pm(s), c.id)
        assert r["changes"] == [] and r["late_additions"] == []


def test_sct_deferral_creates_follow_up(at_q1):
    with session_scope() as s:
        cl = _loan(s, "F-0004")
        target = sct.defer_to_follow_up(s, cl)
        assert target == "DIS #1 Follow Up"
        assert s.query(SctSession).filter_by(cycle_id=cl.cycle_id, session_name=target).count() == 1
        plan = {p["session"]: p for p in sct.plan(s, cl.cycle_id)}
        assert any(x.get("facility_id") == "F-0004" for x in plan[target]["slots"])


def test_fccr_and_liquidity():
    v = {("TOTAL_DEBT", "quarter"): 60.0, ("CASH", "quarter"): 1.4, ("INTEREST_EXPENSE_LTM", "quarter"): 6.2}
    for p, e, cx, t in zip(M.PERIODS, [7.2, 4.0, 3.9, 3.7, 4.1], [1.2, 1.1, 1.0, 0.9, 0.6], [0.4, 0.3, 0.3, 0.2, 0.1]):
        v[("REPORTED_EBITDA", p)], v[("CAPEX", p)], v[("CASH_TAXES", p)] = e, cx, t
    m = M.compute(v, {"quarter": 0.3}, revolver_undrawn=4.0)
    assert round(m["FCCR"]["value"], 2) == 1.69
    assert m["LIQUIDITY"]["value"] == pytest.approx(5.4)
    assert round(m["LIQUIDITY_MONTHS"]["value"], 1) == 5.7


def test_reunderwriting_grid_in_challenge(played):
    from agents.assistants import a5_challenge

    r = a5_challenge({"lincoln_assumptions": "no sponsor support assumed",
                      "sponsor_equity": {"sponsor": "Northgate Capital", "amount": 5.0, "date": "6 Oct", "evidence": []},
                      "metrics": {"TOTAL_DEBT": 60.0, "LTM_ADJ_EBITDA": 16.0, "LEVERAGE": 3.75},
                      "covenant_threshold": 3.5,
                      "grid": {"security": "Cash Flow Senior", "band": 2, "max_leverage": 3.0, "may_max_leverage": 3.25,
                               "spread_bps": 450}})
    assert "55 / 16 = 3.4x" in r["differences"][0]["math"]
    assert any(d.get("kind") == "market_context" and "3.00x" in d["finding"] for d in r["differences"])
    assert r["draft_note"] and "Northgate" in r["draft_note"]
