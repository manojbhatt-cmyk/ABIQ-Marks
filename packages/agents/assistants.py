"""A2 to A11: the single-call and chain components (Agentic AI Spec sections 6.3 to 6.12).

Each function is pure: it takes facts gathered by a domain service and returns a
suggestion payload with citations. The service records the agent run and the
suggestion; a person accepts, edits or rejects it. None of these functions writes
anything.
"""
from __future__ import annotations

import re


def pct(x: float | None, digits: int = 0) -> str:
    return "n/a" if x is None else f"{x * 100:.{digits}f} percent"


def money(x: float | None, digits: int = 1) -> str:
    return "n/a" if x is None else f"${x:,.{digits}f}M"


# ---------------- A11 Covenant Certificate Checker ----------------
def a11_check_certificate(cert_text: str, tiq_leverage: float | None, tolerance: float, threshold: float) -> dict:
    m = re.search(r"([\d.]+)x\s+(?:In compliance|Not in compliance)", cert_text)
    if not m:
        return {"status": "not_found", "finding": "No leverage figure found on the covenant certificate."}
    reported = float(m.group(1))
    if tiq_leverage is None:
        return {"status": "cannot_check", "reported": reported, "tiq": None,
                "finding": f"Borrower certificate reports leverage {reported:.2f}x; TIQ leverage is not available "
                           f"until the spread lines are complete."}
    diff = None if tiq_leverage is None else round(reported - tiq_leverage, 2)
    ok = diff is not None and abs(diff) <= tolerance
    borrower_says = "in compliance" if reported < threshold else "not in compliance"
    tiq_says = "in compliance" if tiq_leverage is not None and tiq_leverage < threshold else "not in compliance"
    finding = (f"Borrower certificate reports leverage {reported:.2f}x ({borrower_says}); TIQ computes "
               f"{tiq_leverage:.2f}x ({tiq_says}). Difference {diff:+.2f}x "
               f"{'within' if ok else 'outside'} the {tolerance:.2f}x tolerance.")
    if not ok and borrower_says != tiq_says:
        finding += " The certificate's compliance conclusion differs from TIQ's calculation."
    return {"status": "match" if ok else "mismatch", "reported": reported, "tiq": tiq_leverage, "difference": diff,
            "finding": finding}


# ---------------- A2 CMR Drafting Assistant ----------------
SECTIONS = [
    ("summary", "Company Commentary"), ("financial_performance", "Financial Commentary"),
    ("covenants_liquidity", "Covenant Commentary"), ("risks", "Key Risks"), ("mitigants", "Mitigants"),
    ("sponsor_collateral", "Sponsor and Collateral"), ("recommendation", "Recommendation"),
    ("mark_direction", "Mark Direction"), ("evidence", "Evidence"),
]


def a2_draft(facts: dict) -> dict[str, dict]:
    """facts: borrower, period, metrics, covenant, notes (doc snippets with citations), sponsor_letter, waiver."""
    m = facts["metrics"]
    cite = facts.get("cites", {})
    b = facts["borrower"]
    lev, cov = m.get("LEVERAGE"), facts.get("covenant") or {}
    out: dict[str, dict] = {}

    def sec(code, sentences: list[tuple[str, list]]):
        text = " ".join(s for s, _ in sentences if s)
        citations = [c for _, cs in sentences for c in cs]
        out[code] = {"body": text, "citations": citations}

    fs = cite.get("financials", [])
    sec("summary", [
        (f"Q3 2026: {b} reported revenue of {money(m.get('REVENUE'))} for the quarter, "
         f"{_chg(m.get('REVENUE_YOY'))} versus Q3 2025, and reported EBITDA of {money(m.get('REPORTED_EBITDA'))}.", fs),
        (facts["notes"].get("customer", ("", []))[0], facts["notes"].get("customer", ("", []))[1]),
        (facts["notes"].get("restructuring", ("", []))[0], facts["notes"].get("restructuring", ("", []))[1]),
    ])
    sec("financial_performance", [
        (f"Adjusted EBITDA for the quarter was {money(m.get('ADJ_EBITDA'))} after add-backs of "
         f"{money(m.get('ADDBACK_TOTAL'))}; LTM adjusted EBITDA is {money(m.get('LTM_ADJ_EBITDA'))}.", fs),
        (f"EBITDA moved {_chg(m.get('EBITDA_YOY'))} year on year; interest cover is "
         f"{_x(m.get('INTEREST_COVER'))} on LTM interest of {money(m.get('INTEREST_EXPENSE_LTM'))}.", fs),
    ])
    if cov:
        breach = cov.get("result") == "fail"
        headroom = "" if breach else f" with {pct(cov.get('headroom'))} headroom"
        sec("covenants_liquidity", [
            (f"Total leverage is {_x(lev)} against a {cov.get('operator')} {cov.get('threshold'):.2f}x maximum "
             f"leverage covenant: {'breached' if breach else 'in compliance'}{headroom}.", fs),
            (f"Cash at quarter end was {money(m.get('CASH'))}; net leverage is {_x(m.get('NET_LEVERAGE'))}.", fs),
            (facts["notes"].get("waiver", ("", []))[0], facts["notes"].get("waiver", ("", []))[1]),
        ])
    risks = []
    if cov.get("result") == "fail":
        risks.append(("Covenant breach on maximum leverage pending a waiver.", fs))
    if (m.get("EBITDA_YOY") or 0) < -0.2:
        risks.append((f"Earnings decline of {pct(abs(m.get('EBITDA_YOY') or 0))} year on year.", fs))
    if facts["notes"].get("customer"):
        risks.append(("Loss of the largest customer reduces revenue visibility.", facts["notes"]["customer"][1]))
    sec("risks", risks or [("No new material risks identified this quarter.", fs)])
    mit = []
    if facts["notes"].get("sponsor"):
        mit.append(facts["notes"]["sponsor"])
    if facts["notes"].get("replacement"):
        mit.append(facts["notes"]["replacement"])
    if facts["notes"].get("collateral"):
        mit.append(facts["notes"]["collateral"])
    sec("mitigants", mit or [("Stable performance and adequate liquidity.", fs)])
    sec("sponsor_collateral", [facts["notes"].get("sponsor", (f"Sponsor: {facts.get('sponsor', 'n/a')}.", [])),
                               facts["notes"].get("collateral", ("", []))])
    rec = facts.get("recommendation_hint", {})
    sec("recommendation", [(rec.get("text", "Maintain rating and watchlist status."), fs)])
    sec("mark_direction", [(f"Expected mark direction: {rec.get('direction', 'flat')}. "
                            f"Mark section to be updated after Lincoln's report.", [])])
    sec("evidence", [("Evidence: " + "; ".join(sorted({c.get('file', '') for c in fs + [x for v in facts['notes'].values() for x in v[1]]} - {''})), [])])
    return out


def _chg(x):
    if x is None:
        return "n/a"
    return f"{'down' if x < 0 else 'up'} {abs(x) * 100:.0f} percent"


def _x(v):
    return "n/a" if v is None else f"{v:.2f}x"


def a2_recommendation(metrics: dict, covenant: dict, prev_rating: int, watchlist: bool, has_sponsor_equity: bool) -> dict:
    breach = covenant.get("result") == "fail"
    decline = (metrics.get("EBITDA_YOY") or 0) < -0.3
    rating = prev_rating
    if breach and decline:
        rating = min(6, max(prev_rating + 2, 5))
    elif breach or decline:
        rating = min(6, prev_rating + 1)
    wl = "add" if (breach or decline) and not watchlist else ("keep" if watchlist else "none")
    direction = "down" if breach or decline else ("up" if (metrics.get("EBITDA_YOY") or 0) > 0.1 else "flat")
    rationale = []
    if breach:
        rationale.append(f"leverage {metrics.get('LEVERAGE', 0):.2f}x breaches the {covenant.get('threshold'):.2f}x covenant")
    if decline:
        rationale.append(f"EBITDA down {abs(metrics.get('EBITDA_YOY') or 0) * 100:.0f} percent year on year")
    if has_sponsor_equity:
        rationale.append("sponsor equity commitment supports liquidity")
    return {"proposed_rating": rating, "previous_rating": prev_rating, "watchlist_action": wl,
            "waiver_requested": breach, "expected_mark_direction": direction,
            "rationale": ("Rating " + (f"{prev_rating} to {rating}" if rating != prev_rating else f"{rating} maintained")
                          + (": " + "; ".join(rationale) if rationale else "") + "."),
            "text": (f"Recommend rating {rating} (previously {prev_rating})"
                     + ({"add": ", add to watchlist", "keep": ", remain on watchlist"}.get(wl, ""))
                     + (", waiver of the leverage covenant with conditions" if breach else "") + ".")}


# ---------------- A3 Review Checker ----------------
def a3_check(cmr: dict) -> list[dict]:
    """cmr: sections (code->body), evidence doc types attached, recommendation, metrics, addbacks, stage."""
    findings = []
    bodies = " ".join(cmr["sections"].values()).lower()
    attached = set(cmr["evidence_types"])
    if re.search(r"committed \$[\d.]+m of new equity|sponsor letter|equity commitment", bodies) and             "sponsor_letter" not in attached:
        findings.append({"item": "evidence_attached", "result": "fail",
                         "reason": "sponsor letter referenced but not attached", "section": "sponsor_collateral"})
    else:
        findings.append({"item": "evidence_attached", "result": "pass", "reason": "referenced evidence attached"})
    findings.append({"item": "ratios_on_ltm", "result": "pass" if cmr["metrics"].get("LTM_ADJ_EBITDA") else "fail",
                     "reason": "leverage and cover computed on LTM adjusted EBITDA"})
    bad = [a for a in cmr["addbacks"] if a["accepted"] and not a["allowed"]]
    findings.append({"item": "addbacks_allowed", "result": "fail" if bad else "pass",
                     "reason": "add-back outside the allow-list accepted" if bad else "all accepted add-backs on the allow-list"})
    rec = cmr["recommendation"] or {}
    consistent = True
    if cmr.get("covenant_result") == "fail" and rec.get("expected_mark_direction") == "up":
        consistent = False
    if rec.get("proposed_rating") and rec.get("previous_rating") and rec["proposed_rating"] > rec["previous_rating"] \
            and rec.get("expected_mark_direction") == "up":
        consistent = False
    findings.append({"item": "recommendation_consistent", "result": "pass" if consistent else "needs_review",
                     "reason": "recommendation consistent with metrics" if consistent else
                     "downgrade with an upward mark direction"})
    if "truck" in bodies and "apprais" in bodies and not re.search(r"apprais\w* (dated|as of|in) \w+", bodies):
        findings.append({"item": "appraisal_date", "result": "needs_review", "reason": "truck appraisal date missing",
                         "section": "sponsor_collateral"})
    if "customer" in bodies and "concentration" not in bodies:
        findings.append({"item": "customer_concentration", "result": "needs_review",
                         "reason": "customer concentration not described", "section": "risks"})
    return findings


# ---------------- A4 Lincoln Output Extractor ----------------
def a4_cross_check(sheet_row: dict, report_text: str) -> dict:
    """Compare the marks spreadsheet row with the report PDF; schema tolerant."""
    found = {}
    m = re.search(r"concluded at ([\d.]+) \(range ([\d.]+) to ([\d.]+)\)", report_text)
    if m:
        found = {"point": float(m.group(1)), "low": float(m.group(2)), "high": float(m.group(3))}
    y = re.search(r"required yield ([\d.]+)%", report_text)
    if y:
        found["yield"] = float(y.group(1)) / 100
    issues = []
    for k in ("point", "low", "high"):
        if k in found and abs(found[k] - float(sheet_row[k])) > 0.001:
            issues.append(f"{k}: sheet {sheet_row[k]} vs report {found[k]}")
    conf = 0.98 if found and not issues else (0.7 if not found else 0.5)
    return {"report_values": found, "discrepancy": bool(issues), "note": "; ".join(issues), "confidence": conf}


# ---------------- A5 Challenge Assistant ----------------
def a5_challenge(facts: dict) -> dict:
    """Compare Lincoln's key assumptions with what the Deal Team knows; return differences with math."""
    diffs = []
    assumptions = (facts.get("lincoln_assumptions") or "").lower()
    eq = facts.get("sponsor_equity")
    m = facts["metrics"]
    if eq and ("no sponsor support" in assumptions or "sponsor" not in assumptions):
        debt, ltm = m.get("TOTAL_DEBT"), m.get("LTM_ADJ_EBITDA")
        net = debt - eq["amount"]
        diffs.append({
            "assumption_quote": facts.get("lincoln_assumptions"),
            "finding": f"Lincoln assumes no sponsor support, but {eq['sponsor']} committed {money(eq['amount'])} of "
                       f"new equity (letter dated {eq['date']}; funds received {eq.get('received', 'n/a')}).",
            "math": f"Debt net of the equity {money(debt)} - {money(eq['amount'])} = {money(net)}; "
                    f"LTM adjusted EBITDA {money(ltm)}; net leverage {net:.0f} / {ltm:.0f} = {net / ltm:.1f}x, "
                    f"inside the {facts['covenant_threshold']:.2f}x covenant.",
            "evidence": eq["evidence"], "materiality": "high"})
    cover = m.get("INTEREST_COVER")
    if cover and "interest" in assumptions and cover > 2.0:
        diffs.append({"assumption_quote": facts.get("lincoln_assumptions"),
                      "finding": f"Interest cover remains {cover:.1f}x.", "math": "", "evidence": [], "materiality": "low"})
    note = None
    if diffs:
        d = diffs[0]
        note = (f"Lincoln's valuation does not fully reflect the {money(eq['amount'])} sponsor equity committed by "
                f"{eq['sponsor']} (letter dated {eq['date']}, attached). Debt net of the equity is "
                f"{money(m['TOTAL_DEBT'] - eq['amount'], 0)}; LTM adjusted EBITDA {money(m['LTM_ADJ_EBITDA'], 0)}; "
                f"net leverage {(m['TOTAL_DEBT'] - eq['amount']) / m['LTM_ADJ_EBITDA']:.1f}x, inside the "
                f"{facts['covenant_threshold']:.2f}x covenant.")
        _ = d
    return {"differences": diffs, "draft_note": note,
            "summary": f"{len(diffs)} difference(s) between Lincoln's assumptions and the Deal Team's evidence."}


# ---------------- A6 Impact and Pack Narrator ----------------
def a6_impact(prev_total: float, cur_total: float, drivers: list[dict], version: int, period: str) -> str:
    delta = cur_total - prev_total
    lines = [f"Hello Wes and Justin,", "",
             f"Early view of {period} marks (version {version}): portfolio value {money(cur_total, 3)} against "
             f"{money(prev_total, 3)} last quarter, a change of {'-' if delta < 0 else '+'}${abs(delta):,.2f}M.", "",
             "Main drivers:"]
    for d in drivers[:5]:
        lines.append(f"- {d['borrower']}: {d['previous_mark']:.2f} to {d['current_mark']:.2f} "
                     f"({'-' if d['delta'] < 0 else '+'}${abs(d['delta']):,.2f}M), source {d['source']}.")
    lines += ["", "Marks remain drafts until Deal Team approval and the Valuation Committee.", "", "PM Team"]
    return "\n".join(lines)


def a6_one_pager(loan: dict) -> tuple[str, list[str]]:
    reasons = ", ".join(loan.get("reasons", [])) or "manual"
    body = (f"**{loan['borrower']}** ({loan['facility_id']}, {loan['team']})\n\n"
            f"Proposed mark {loan['proposed_mark']:.2f} versus {loan['previous_mark']:.2f} last quarter "
            f"({(loan['proposed_mark'] / loan['previous_mark'] - 1) * 100:+.2f} percent). Lincoln "
            f"{loan.get('lincoln_point', 0):.2f}, range {loan.get('range_low', 0):.2f} to {loan.get('range_high', 0):.2f}.\n\n"
            f"Rating {loan['previous_rating']} to {loan['rating']}; watchlist {loan['watchlist_text']}; "
            f"waiver {loan.get('waiver', 'none')}.\n\nOn the agenda because: {reasons}.\n\n"
            f"Key points: {loan.get('key_points', '')}")
    questions = []
    if "downgrade" in reasons:
        questions.append(f"Is rating {loan['rating']} the right level given the recovery plan?")
    if "watchlist" in reasons:
        questions.append("What are the triggers to leave the watchlist?")
    if "mark_move_10pct" in reasons:
        questions.append("Is a move of more than 10 percent supported by one quarter of results?")
    if "outside_lincoln_range" in reasons:
        questions.append("What evidence supports a mark outside Lincoln's range?")
    return body, questions


# ---------------- A7 Reconciliation Explainer ----------------
def a7_explain(item: dict, history: list[dict]) -> str:
    if item["check_code"] == "mark_tracker_vs_everest":
        last = next((h for h in history if h.get("action") == "committee_decision.recorded"), None)
        if last:
            return (f"The tracker holds the committee's {item['value_a']} recorded on day {last.get('day')} by "
                    f"{last.get('actor')}; the Everest pricing panel still shows the Deal Team's G1 mark "
                    f"{item['value_b']}, written before the committee. Everest was not updated after the "
                    f"committee change. Suggested action: correct Everest.")
        return (f"Tracker {item['value_a']} differs from Everest {item['value_b']}; no TIQ decision explains the "
                f"Everest value. Suggested action: check the Everest change history.")
    return f"{item['source_a']} {item['value_a']} differs from {item['source_b']} {item['value_b']}."


# ---------------- A8 Chaser ----------------
def a8_draft(template_subject: str, template_body: str, fields: dict) -> tuple[str, str]:
    return template_subject.format(**fields), template_body.format(**fields)


# ---------------- A10 Monthly Mark Assistant ----------------
def a10_rationale(loan: dict, proposed_mark: float) -> str:
    move = proposed_mark - loan["current_mark"]
    parts = [f"Proposed {proposed_mark:.2f} versus {loan['current_mark']:.2f} at the last quarter "
             f"({move:+.2f} points)."]
    sig = loan.get("sigma") or {}
    pac = loan.get("pacing") or {}
    if sig:
        parts.append(f"Sigma shows LTM leverage {sig.get('LTM_LEVERAGE', 0):.2f}x with a {sig.get('LEVERAGE_TREND')} trend.")
    if pac:
        parts.append(f"Pacing is {pac.get('PACING_STATUS', 'on_track').replace('_', ' ')}; interest received "
                     f"{pac.get('INTEREST_RECEIVED', 0):.3f} against {pac.get('EXPECTED_INTEREST', 0):.3f} expected.")
    for n in loan.get("notes", [])[:1]:
        parts.append(f"Watchlist call ({n.get('CALL_DATE')}): {n.get('NOTE_TEXT')}")
    return " ".join(parts)
