"""Write-back adapter: a bulk write is a fixed number of warehouse calls, however many rows (DuckDB only)."""
import pytest

from connectors import writeback
from connectors.warehouse import get_warehouse
from domain.db import session_scope
from domain.models import WritebackChange


@pytest.fixture(scope="module")
def warehouse():
    from synth.cli import reset
    from tests.conftest import _ensure_test_db

    _ensure_test_db()
    reset("duckdb", "Q0", log=lambda m: None)
    return get_warehouse()


@pytest.fixture
def calls(warehouse, monkeypatch):
    n = {"calls": 0}
    for name in ("query", "execute", "insert_rows"):
        real = getattr(warehouse, name)

        def counted(*a, _real=real, _name=name, **k):
            n["calls"] += 1
            n.setdefault("log", []).append((_name, str(a[0])[:70]))
            return _real(*a, **k)

        monkeypatch.setattr(warehouse, name, counted)
    return n


def _item(fid, period, point, version=1):
    return {"key": {"FACILITY_ID": fid, "PERIOD": period},
            "payload": {"LINCOLN_VERSION": version, "LINCOLN_POINT": point, "VALUATION_DATE": "2026-10-18",
                        "DEAL_TEAM_STATUS": "pending"},
            "tiq_entity_type": "test_valuation", "tiq_entity_id": f"{fid}-{period}", "tiq_entity_version": version}


def test_bulk_upsert_updates_and_inserts_in_three_calls(warehouse, calls):
    existing = warehouse.query("select FACILITY_ID, PERIOD from EVEREST.PRICING_PANEL order by FACILITY_ID, PERIOD limit 2")
    items = [_item(r["FACILITY_ID"], r["PERIOD"], 91.5 + i) for i, r in enumerate(existing)]
    items += [_item("F-9998", "2026-Q3", 88.0), _item("F-9999", "2026-Q3", 87.0)]
    calls["calls"], calls["log"] = 0, []  # count only the adapter's calls
    with session_scope() as s:
        changes = writeback.upsert_many(s, "EVEREST", "PRICING_PANEL", items, actor="pm@test")
        assert [c.status for c in changes] == ["applied"] * 4, [c.error for c in changes]
        assert [c.before_json is not None for c in changes] == [True, True, False, False]
    assert calls["calls"] == 3, calls["log"]  # read the old rows, update the existing ones, insert the new ones
    rows = {(r["FACILITY_ID"], r["PERIOD"]): r for r in warehouse.query(
        "select FACILITY_ID, PERIOD, LINCOLN_POINT, DEAL_TEAM_STATUS, cast(VALUATION_DATE as varchar) D, SOURCE_BATCH_ID "
        "from EVEREST.PRICING_PANEL")}
    for it in items:
        r = rows[(it["key"]["FACILITY_ID"], it["key"]["PERIOD"])]
        assert (r["LINCOLN_POINT"], r["DEAL_TEAM_STATUS"], r["D"]) == (it["payload"]["LINCOLN_POINT"], "pending", "2026-10-18")
    assert rows[("F-9999", "2026-Q3")]["SOURCE_BATCH_ID"] == "tiq-writeback"


def test_repeating_the_same_bulk_write_touches_nothing(warehouse, calls):
    items = [_item("F-9998", "2026-Q3", 88.0), _item("F-9999", "2026-Q3", 87.0)]
    with session_scope() as s:
        writeback.upsert_many(s, "EVEREST", "PRICING_PANEL", items, actor="pm@test")
        assert s.query(WritebackChange).filter_by(tiq_entity_type="test_valuation").count() == 4
    assert calls["calls"] == 0


def test_single_upsert_still_works(warehouse, calls):
    with session_scope() as s:
        c = writeback.upsert(s, "EVEREST", "PRICING_PANEL", {"FACILITY_ID": "F-9999", "PERIOD": "2026-Q3"},
                             {"LINCOLN_POINT": 86.0}, actor="pm@test", tiq_entity_type="test_valuation",
                             tiq_entity_id="F-9999-2026-Q3", tiq_entity_version=2)
        assert c.status == "applied" and c.before_json["LINCOLN_POINT"] == 87.0
    assert warehouse.query("select LINCOLN_POINT P from EVEREST.PRICING_PANEL where FACILITY_ID = 'F-9999'")[0]["P"] == 86.0
