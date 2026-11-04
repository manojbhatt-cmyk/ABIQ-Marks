"""Metrics engine (Data Spec section 5.3). Deterministic code; the Harbor numbers are the unit-test fixture."""
from __future__ import annotations

PERIODS = ["same_quarter_last_year", "q_minus_3", "q_minus_2", "prior_quarter", "quarter"]
LTM_PERIODS = ["q_minus_3", "q_minus_2", "prior_quarter", "quarter"]

FORMULAS = {
    "ADDBACK_TOTAL": "sum of accepted add-backs",
    "ADJ_EBITDA": "REPORTED_EBITDA + ADDBACK_TOTAL",
    "LTM_ADJ_EBITDA": "sum of ADJ_EBITDA over the last four quarters",
    "NET_DEBT": "TOTAL_DEBT - CASH",
    "LEVERAGE": "TOTAL_DEBT / LTM_ADJ_EBITDA",
    "NET_LEVERAGE": "NET_DEBT / LTM_ADJ_EBITDA",
    "INTEREST_COVER": "LTM_ADJ_EBITDA / INTEREST_EXPENSE_LTM",
    "REVENUE_YOY": "REVENUE / REVENUE same quarter last year - 1",
    "EBITDA_YOY": "REPORTED_EBITDA / REPORTED_EBITDA same quarter last year - 1",
}


def compute(values: dict[tuple[str, str], float], addbacks: dict[str, float] | None = None) -> dict[str, dict]:
    """values: {(line_code, period_type): value}; addbacks: accepted add-backs per period_type."""
    addbacks = addbacks or {}

    def v(code, period="quarter"):
        return values.get((code, period))

    out: dict[str, dict] = {}

    def put(code, value, inputs):
        out[code] = {"value": None if value is None else round(value, 4), "formula": FORMULAS[code], "inputs": inputs}

    adj = {}
    for p in PERIODS:
        rep = v("REPORTED_EBITDA", p)
        adj[p] = None if rep is None else rep + addbacks.get(p, 0.0)
    put("ADDBACK_TOTAL", addbacks.get("quarter", 0.0), {"addbacks": addbacks.get("quarter", 0.0)})
    put("ADJ_EBITDA", adj["quarter"], {"REPORTED_EBITDA": v("REPORTED_EBITDA"), "ADDBACK_TOTAL": addbacks.get("quarter", 0.0)})
    ltm = None if any(adj[p] is None for p in LTM_PERIODS) else sum(adj[p] for p in LTM_PERIODS)
    put("LTM_ADJ_EBITDA", ltm, {p: adj[p] for p in LTM_PERIODS})
    debt, cash, interest = v("TOTAL_DEBT"), v("CASH"), v("INTEREST_EXPENSE_LTM")
    net = None if debt is None or cash is None else debt - cash
    put("NET_DEBT", net, {"TOTAL_DEBT": debt, "CASH": cash})
    put("LEVERAGE", _div(debt, ltm), {"TOTAL_DEBT": debt, "LTM_ADJ_EBITDA": ltm})
    put("NET_LEVERAGE", _div(net, ltm), {"NET_DEBT": net, "LTM_ADJ_EBITDA": ltm})
    put("INTEREST_COVER", _div(ltm, interest), {"LTM_ADJ_EBITDA": ltm, "INTEREST_EXPENSE_LTM": interest})
    rev, rev_ly = v("REVENUE"), v("REVENUE", "same_quarter_last_year")
    put("REVENUE_YOY", None if not rev_ly or rev is None else rev / rev_ly - 1, {"REVENUE": rev, "REVENUE_LY": rev_ly})
    e, e_ly = v("REPORTED_EBITDA"), v("REPORTED_EBITDA", "same_quarter_last_year")
    put("EBITDA_YOY", None if not e_ly or e is None else e / e_ly - 1, {"EBITDA": e, "EBITDA_LY": e_ly})
    return out


def _div(a, b):
    return None if a is None or not b else a / b


OPS = {"<": lambda a, t: a < t, "<=": lambda a, t: a <= t, ">": lambda a, t: a > t, ">=": lambda a, t: a >= t}
METRIC_FOR = {"max_leverage": "LEVERAGE", "min_interest_cover": "INTEREST_COVER", "min_liquidity": "CASH"}


def covenant_test(metrics: dict[str, dict], covenant: dict) -> dict:
    code = METRIC_FOR.get(covenant["COVENANT_TYPE"], "LEVERAGE")
    actual = metrics.get(code, {}).get("value")
    op, thr = covenant["OPERATOR"], float(covenant["THRESHOLD"])
    if actual is None:
        return {"metric_line_code": code, "actual": None, "threshold": thr, "operator": op, "result": "fail",
                "headroom": None, "note": "metric not available"}
    ok = OPS[op](actual, thr)
    headroom = (thr - actual) / thr if op in ("<", "<=") else (actual - thr) / thr
    return {"metric_line_code": code, "actual": round(actual, 4), "threshold": thr, "operator": op,
            "result": "pass" if ok else "fail", "headroom": round(headroom, 4),
            "note": f"{code.lower().replace('_', ' ')} {actual:.2f}x vs {op} {thr:.2f}x"}


def indicative_price(coupon: float, years: float, required_yield: float) -> float:
    """Annual-coupon discount of a par-100 bond: transparent cross-check, labelled indicative, never a mark."""
    n = max(1, int(round(years)))
    frac = years / n
    price = sum(coupon * 100 / (1 + required_yield) ** (t * frac) for t in range(1, n + 1))
    price += 100 / (1 + required_yield) ** years
    return round(price, 2)
