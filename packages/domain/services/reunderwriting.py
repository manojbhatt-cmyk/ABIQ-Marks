"""Reunderwriting guidance lookup (client file: Reunderwriting Guidance Q3 2026, snapshot of 1 Sep 2026)."""
from __future__ import annotations

from connectors.warehouse import get_warehouse

SECURITY_FOR = {"term_loan": "Cash Flow Senior", "ddtl": "Cash Flow Senior", "second_lien": "2nd Lien Loans",
                "revolver": "Asset Based Senior"}


def lookup(facility_type: str, ltm_ebitda: float | None) -> dict | None:
    if ltm_ebitda is None:
        return None
    sec = SECURITY_FOR.get(facility_type, "Cash Flow Senior")
    try:
        rows = get_warehouse().query("select * from FINANCE.REUNDERWRITING_GRID where SECURITY = ? and ? >= BAND_LOW "
                                     "and ? < BAND_HIGH", [sec, ltm_ebitda, ltm_ebitda])
    except Exception:
        return None
    cur = next((r for r in rows if r["AS_OF_MONTH"] == "2026-08"), None)
    may = next((r for r in rows if r["AS_OF_MONTH"] == "2026-05"), None)
    if not cur:
        return None
    return {"security": sec, "band": cur["EBITDA_BAND"], "band_range": [cur["BAND_LOW"], cur["BAND_HIGH"]],
            "spread_bps": cur["SPREAD_BPS"], "may_spread_bps": may["SPREAD_BPS"] if may else None,
            "max_leverage": cur["MAX_LEVERAGE"], "may_max_leverage": may["MAX_LEVERAGE"] if may else None,
            "source": cur["SOURCE_DOC"], "assumed_band_thresholds": True}
