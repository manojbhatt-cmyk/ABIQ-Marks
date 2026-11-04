"""Rows for every synthetic Snowflake table (Data Spec section 2 and 7)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from synth import schema
from synth.portfolio import (DAY0, DOMAIN, FUNDS, PERIOD, PREV_PERIOD, RATING_LABELS, SPONSORS, TEAMS, borrowers,
                             ground_truth_spread, team_emails, team_name, users)

BATCH = "synth-v1"
LOADED = datetime(2026, 10, 1, 2, 0, 0)

SPREAD_TEMPLATE = [
    ("REVENUE", "Revenue", "income", False, "borrower statements"),
    ("COGS", "Cost of goods sold", "income", False, "borrower statements"),
    ("OPEX", "Operating expenses", "income", False, "borrower statements"),
    ("REPORTED_EBITDA", "Reported EBITDA", "income", False, "operating profit before depreciation as reported"),
    ("ADDBACK_TOTAL", "Add-backs (accepted)", "adjustments", True, "sum of accepted adjustment rows"),
    ("ADJ_EBITDA", "Adjusted EBITDA", "adjustments", True, "REPORTED_EBITDA + ADDBACK_TOTAL"),
    ("LTM_ADJ_EBITDA", "LTM adjusted EBITDA", "adjustments", True, "sum of ADJ_EBITDA over the last four quarters"),
    ("CASH", "Cash", "balance", False, "borrower statements"),
    ("TOTAL_DEBT", "Total debt", "debt", False, "borrower statements and facility records"),
    ("NET_DEBT", "Net debt", "debt", True, "TOTAL_DEBT - CASH"),
    ("INTEREST_EXPENSE_LTM", "Interest expense (LTM)", "debt", False, "borrower statements (yearly interest)"),
    ("LEVERAGE", "Leverage", "ratios", True, "TOTAL_DEBT / LTM_ADJ_EBITDA"),
    ("NET_LEVERAGE", "Net leverage", "ratios", True, "NET_DEBT / LTM_ADJ_EBITDA"),
    ("INTEREST_COVER", "Interest cover", "ratios", True, "LTM_ADJ_EBITDA / INTEREST_EXPENSE_LTM"),
    ("REVENUE_YOY", "Revenue change YoY", "ratios", True, "change versus the same quarter last year"),
    ("EBITDA_YOY", "EBITDA change YoY", "ratios", True, "change versus the same quarter last year"),
]

FUND_SPLITS = [("MMDLF1", 0.35), ("MMDLF2", 0.25), ("BDC", 0.20), ("ABLEND", 0.20)]
FUND_SPLITS_ALT = [("LUX1", 0.30), ("PCIPAC", 0.25), ("MMDLF4", 0.25), ("ABPCI", 0.20)]

# CMR Delivery Deadlines (client file), re-dated for the Q3 2026 cycle (Day 26 = 26 Oct 2026).
SCT_SESSIONS = [
    ("Wed", date(2026, 10, 21), "Services", "SCT Reviewer", "1.5BD", "9am Mon 10/19", "12pm Mon 10/19"),
    ("Wed", date(2026, 10, 21), "SW - Person 27", "R5, R6", "1BD", "7pm Mon 10/19", "9am Tues 10/20"),
    ("Thurs", date(2026, 10, 22), "SW - Person 80", "R5/R10", "2BD", "7pm Mon 10/19", "9am Tues 10/20"),
    ("Thurs", date(2026, 10, 22), "DIS #1", "R8/R9", "2BD", "5pm Mon 10/19", "8pm Mon 10/19"),
    ("Fri", date(2026, 10, 23), "SW - Person 81", "R5/R7", "1BD", "7pm Wed 10/21", "9am Thurs 10/22"),
    ("Fri", date(2026, 10, 23), "DIS #2", "R8/R9", "2BD", "12pm Wed 10/21", "3pm Wed 10/21"),
    ("Mon", date(2026, 10, 26), "Healthcare", "R2", "2BD", "7pm Wed 10/21", "9am Thurs 10/22"),
    ("Mon", date(2026, 10, 26), "Services Follow Up", "SCT Reviewer", "1BD", "7pm Thurs 10/22", "9am Fri 10/23"),
]


def _dates_after(period_end: date, days: int) -> date:
    return period_end + timedelta(days=days)


def build_rows() -> dict[str, list[tuple]]:
    bs = borrowers()
    rows: dict[str, list[tuple]] = {t: [] for t in schema.TABLES}
    a = lambda *v: (*v, LOADED, BATCH)  # noqa: E731

    for sid, name, mail in SPONSORS:
        rows["DEALCLOUD.SPONSOR"].append(a(sid, name, mail))
    for tid, tname in TEAMS:
        e = team_emails(tid)
        rows["DEALCLOUD.DEAL_TEAM"].append(a(tid, tname, e["lead"], e["analyst"], e["ac_manager"]))
    user_names = {u.email: u.name for u in users()}

    for i, br in enumerate(bs, start=1):
        deal_id = f"D-{i:04d}"
        e = team_emails(br.team)
        contact = f"finance@{br.domain}"
        rows["DEALCLOUD.BORROWER"].append(a(br.borrower_id, br.legal, br.name, br.sector, "US", br.sponsor, contact,
                                            br.domain, 12, "active", br.description))
        rows["DEALCLOUD.CONTACT"].append(a(f"C-{i:04d}", br.borrower_id, f"CFO, {br.name}", contact, "cfo"))
        closed = date(2023 + i % 3, 1 + (i * 5) % 12, 15)
        rows["DEALCLOUD.DEAL"].append(a(
            deal_id, br.borrower_id, f"{br.name} LBO {closed.year}", br.team, closed, "active",
            f"https://dealcloud.example/deals/{deal_id}", closed, f"Q{(closed.month - 1) // 3 + 1} {closed.year}",
            "Full", br.sector, "Vertical SaaS" if "Software" in br.sector else None, False, br.sct_category,
            user_names[e["ac_manager"]], user_names[e["lead"]], "Catherine Doyle", "NA", user_names[e["lead"]],
            "Priya Menon", br.agenda, br.fye, None, "Core", br.sector.split(" ")[0], True,
            "Low" if br.rating <= 2 else "Medium", "AB Private Credit Investors",
            f"AB-PCI holds the senior secured facilities of {br.legal}; sponsor-backed {closed.year} LBO."))
        pe = date(2026, 3, 31), date(2026, 6, 30), date(2026, 9, 30), date(2026, 12, 31)
        d = br.q_days
        rows["DEALCLOUD.FINANCIALS_SCHEDULE"].append(a(
            deal_id, *(_dates_after(p, d) for p in pe), _dates_after(date(2026, 12, 31), 120), d, d, d, d, 120))
        for fac in br.facilities:
            asset_class = {"term_loan": "Term Loan", "ddtl": "Delayed Draw", "revolver": "Revolver",
                           "second_lien": "Term Loan"}[fac.ftype]
            ftype = "term_loan" if fac.ftype == "second_lien" else fac.ftype
            spread_bps = int(round((fac.coupon - 0.043) * 10000))
            rows["DEALCLOUD.FACILITY"].append(a(
                fac.facility_id, deal_id, f"{br.name} {asset_class}", ftype, asset_class, fac.commitment, "USD",
                fac.coupon, spread_bps, 0.01, spread_bps / 10000, 0.0, fac.maturity,
                "second_lien" if fac.ftype == "second_lien" else "senior_secured", "active", fac.cmr_type))
            kind, op, thr = fac.covenant
            rows["DEALCLOUD.COVENANT"].append(a(f"CV-{fac.facility_id[2:]}", fac.facility_id, kind, op, thr,
                                                "quarterly", f"Total debt to LTM adjusted EBITDA {op} {thr:.2f}x"))
            rows["DEALCLOUD.DEAL_TEAM_ASSIGNMENT"].append(a(fac.facility_id, br.team, date(2024, 1, 1), None))

            # Everest history: Q1 and Q2 ratings and pricing panel final marks.
            for period, mark_shift in (("2026-Q1", 0.25), (PREV_PERIOD, 0.0)):
                mark = round(fac.prev_mark + mark_shift, 4) if fac.in_scope else 100.0
                rows["EVEREST.PRICING_PANEL"].append(a(
                    fac.facility_id, period, 1, mark, mark - fac.range_half, mark + fac.range_half,
                    fac.required_yield or fac.coupon + 0.015, date(2026, 4, 18) if period == "2026-Q1" else date(2026, 7, 18),
                    "approved", mark, e["lead"], datetime(2026, 7, 30, 15, 0), None, mark))
                rows["EVEREST.RISK_RATING"].append(a(
                    fac.facility_id, period, br.rating, RATING_LABELS[br.rating], br.rating, br.watchlist,
                    "none", None, "B (high)" if br.rating <= 2 else "B (low)", "BB-" if br.rating <= 2 else "B",
                    "B" if br.rating <= 2 else "B-", "E1 S1 G1", e["lead"], datetime(2026, 7, 30, 15, 0)))
                rows["EVEREST.CMR"].append(a(
                    f"CMR-{fac.facility_id[2:]}-{period}", fac.facility_id, period, 1, fac.cmr_type, "final",
                    e["analyst"], datetime(2026, 7, 24), f"PrivateCredit/Valuation/{period}/CMRs/{br.slug}-"
                    f"{fac.facility_id}-v1.pdf", mark, mark - fac.range_half, mark + fac.range_half, e["lead"],
                    datetime(2026, 7, 30), None, None))

            # Sentry positions at day 0 (and month end October) split across funds.
            splits = FUND_SPLITS if int(fac.facility_id[2:]) % 2 else FUND_SPLITS_ALT
            for as_of, funded in ((DAY0, fac.funded), (date(2026, 10, 31), fac.funded + _oct_draws(fac))):
                unfunded = max(fac.commitment - funded, 0.0)
                remaining_f, remaining_u = funded, unfunded
                for j, (fund, w) in enumerate(splits):
                    last = j == len(splits) - 1
                    fa = round(remaining_f if last else funded * w, 4)
                    ua = round(remaining_u if last else unfunded * w, 4)
                    remaining_f, remaining_u = round(remaining_f - fa, 4), round(remaining_u - ua, 4)
                    rows["SENTRY.POSITION"].append(a(
                        f"P-{fac.facility_id[2:]}-{fund}-{as_of:%m%d}", fac.facility_id, fund, as_of, fa, ua,
                        round(fa + ua, 4), round(fa * 0.98, 4)))
            if fac.ftype == "ddtl":
                rows["SENTRY.DDTL_COMMITMENT"].append(a(fac.facility_id, fac.commitment, fac.funded,
                                                        fac.commitment - fac.funded, date(2027, 6, 30)))
                for k, (dday, amt) in enumerate(_draw_schedule(fac)):
                    rows["SENTRY.DRAW"].append(a(f"DR-{fac.facility_id[2:]}-{k + 1}", fac.facility_id, dday, amt,
                                                 "settled"))

            if fac.in_scope:
                gt = ground_truth_spread(br)
                lev, cover = gt["LEVERAGE"], gt["INTEREST_COVER"]
                rows["SIGMA.PORTFOLIO_SNAPSHOT_BASE"].append(a(
                    fac.facility_id, "2026-10", fac.prev_mark, br.rating, br.watchlist, "2026-Q2", round(lev, 4),
                    round(cover, 4), "up" if br.watchlist or br.borrower_id == "B-0002" else "flat",
                    round(fac.funded * fac.coupon / 12, 4)))
                expected = round(fac.funded * fac.coupon / 12, 4)
                status = "behind" if br.borrower_id in ("B-0002", "B-0009") else "on_track"
                rows["FINANCE.PACING_FILE"].append(a(
                    fac.facility_id, "2026-10", fac.funded + _oct_draws(fac), expected,
                    round(expected * (0.85 if status == "behind" else 1.0), 4), status,
                    "Interest received late" if status == "behind" else "", "pacing-2026-10.xlsx"))
        if br.watchlist or br.borrower_id == "B-0002":
            rows["FINANCE.WATCHLIST_CALL_NOTE"].append(a(
                f"WN-{br.borrower_id[2:]}", br.facilities[0].facility_id, date(2026, 10, 14),
                "Deal Team, PM Team, sponsor",
                "Management reported volumes in line with plan; liquidity adequate for the next two quarters."
                if br.borrower_id != "B-0002" else
                "Replacement contracts ramping; sponsor equity received 30 October; monthly reporting agreed.",
                e["analyst"]))

    for k, row in enumerate(SPREAD_TEMPLATE, start=1):
        code, label, group, calc, formula = row
        rows["EVEREST.SPREAD_TEMPLATE"].append(a("STD", "v1", code, label, group, k, calc, formula,
                                                 "x" if group == "ratios" and "YOY" not in code else "USD m"))
    for k, (day, sdate, name, reviewer, req, deadline, delivery) in enumerate(SCT_SESSIONS, start=1):
        rows["DEALCLOUD.SCT_SESSION"].append(a(f"SCT-{k:02d}", PERIOD, day, sdate, name, reviewer, req, deadline,
                                               delivery, 12, 20))
    for fid, name, ftype in FUNDS:
        rows["SENTRY.FUND"].append(a(fid, name, ftype))
    return rows


def _draw_schedule(fac) -> list[tuple[date, float]]:
    if fac.facility_id == "F-0005":
        return [(date(2026, 4, 15), 6.0), (date(2026, 7, 20), 6.0), (date(2026, 10, 12), 3.0)]
    return [(date(2026, 5, 10), 15.0), (date(2026, 10, 22), 4.0)]


def _oct_draws(fac) -> float:
    if fac.ftype != "ddtl":
        return 0.0
    return sum(amt for d, amt in _draw_schedule(fac) if d.month == 10 and d.year == 2026)


__all__ = ["build_rows", "SPREAD_TEMPLATE", "DOMAIN", "team_name"]
