"""Snowflake source schemas (Transorg Data Spec.md section 2), version 1, all assumed.

Column sets follow the Data Spec. Columns marked "client file" are added from the
AllianceBernstein files received on 3 Nov 2026 (3Q26 PR Master Agenda, CMR Delivery
Deadlines, the 2Q26 CMR and Lincoln's draft valuation report) so the synthetic data
carries the client's own field names.
"""
from __future__ import annotations

S = "STRING"
N = "NUMBER(18,4)"
M = "NUMBER(8,4)"
I = "INTEGER"
D = "DATE"
B = "BOOLEAN"
T = "TIMESTAMP_NTZ"

TABLES: dict[str, list[tuple[str, str]]] = {
    "DEALCLOUD.SPONSOR": [("SPONSOR_ID", S), ("NAME", S), ("CONTACT_EMAIL", S)],
    "DEALCLOUD.BORROWER": [
        ("BORROWER_ID", S), ("LEGAL_NAME", S), ("SHORT_NAME", S), ("INDUSTRY", S), ("COUNTRY", S),
        ("SPONSOR_ID", S), ("PRIMARY_CONTACT_EMAIL", S), ("EMAIL_DOMAIN", S), ("FISCAL_YEAR_END_MONTH", I),
        ("STATUS", S), ("COMPANY_DESCRIPTION", S)],
    "DEALCLOUD.DEAL_TEAM": [("DEAL_TEAM_ID", S), ("TEAM_NAME", S), ("LEAD_USER_EMAIL", S),
                            ("ANALYST_USER_EMAIL", S), ("AC_MANAGER_USER_EMAIL", S)],
    # Master Agenda columns (client file): Deal, Risk Rating, Date Closed, Closed Qtr, CMR Status, Sector,
    # SW Subsector, Equity Only, SCT Review Category, AM, CDL, SCT, Sector Lead, Originator, PMT, Agenda, FYE,
    # PMT Comments; CMR "Summary information" (client file): Strategy, PA Industry, VCOC, Refi Risk, Admin Agent.
    "DEALCLOUD.DEAL": [
        ("DEAL_ID", S), ("BORROWER_ID", S), ("DEAL_NAME", S), ("DEAL_TEAM_ID", S), ("ORIGINATION_DATE", D),
        ("STATUS", S), ("DEALCLOUD_URL", S), ("DATE_CLOSED", D), ("CLOSED_QTR", S), ("CMR_STATUS", S),
        ("SECTOR", S), ("SW_SUBSECTOR", S), ("EQUITY_ONLY", B), ("SCT_REVIEW_CATEGORY", S), ("AM", S),
        ("CDL", S), ("SCT", S), ("SECTOR_LEAD", S), ("ORIGINATOR", S), ("PMT", S), ("AGENDA", S), ("FYE", S),
        ("PMT_COMMENTS", S), ("STRATEGY", S), ("PA_INDUSTRY", S), ("VCOC", B), ("REFI_RISK", S),
        ("ADMIN_AGENT", S), ("DEAL_STRUCTURE", S), ("VALUATION_METHOD", S)],
    # Master Agenda financials-due schedule (client file): Q1..Q4 and Annual dates and days after period end.
    "DEALCLOUD.FINANCIALS_SCHEDULE": [
        ("DEAL_ID", S), ("Q1_DATE", D), ("Q2_DATE", D), ("Q3_DATE", D), ("Q4_DATE", D), ("ANNUAL_DATE", D),
        ("Q1_DAYS", I), ("Q2_DAYS", I), ("Q3_DAYS", I), ("Q4_DAYS", I), ("ANNUAL_DAYS", I)],
    # CMR "Asset and mark summary" (client file) adds ASSET_CLASS, FLOOR, CASH_MARGIN, PIK.
    "DEALCLOUD.FACILITY": [
        ("FACILITY_ID", S), ("DEAL_ID", S), ("FACILITY_NAME", S), ("FACILITY_TYPE", S), ("ASSET_CLASS", S),
        ("COMMITMENT_AMOUNT", N), ("CURRENCY", S), ("COUPON_RATE", M), ("SPREAD_BPS", I), ("FLOOR", M),
        ("CASH_MARGIN", M), ("PIK", M), ("MATURITY_DATE", D), ("SENIORITY", S), ("STATUS", S), ("CMR_TYPE", S)],
    "DEALCLOUD.COVENANT": [("COVENANT_ID", S), ("FACILITY_ID", S), ("COVENANT_TYPE", S), ("OPERATOR", S),
                           ("THRESHOLD", M), ("TEST_FREQUENCY", S), ("DEFINITION_NOTES", S)],
    "DEALCLOUD.DEAL_TEAM_ASSIGNMENT": [("FACILITY_ID", S), ("DEAL_TEAM_ID", S), ("EFFECTIVE_FROM", D),
                                       ("EFFECTIVE_TO", D)],
    "DEALCLOUD.CONTACT": [("CONTACT_ID", S), ("BORROWER_ID", S), ("NAME", S), ("EMAIL", S), ("ROLE", S)],
    # CMR Delivery Deadlines (client file): Day, Date, SCT Review Date, Reviewer, Requested time to review,
    # Deadline, Delivery to SCT. Plus the Master Agenda "Timing" sheet minutes per deal.
    "DEALCLOUD.SCT_SESSION": [
        ("SESSION_ID", S), ("PERIOD", S), ("DAY", S), ("SESSION_DATE", D), ("SCT_REVIEW_DATE", S),
        ("REVIEWER", S), ("REQUESTED_TIME_TO_REVIEW", S), ("DEADLINE", S), ("DELIVERY_TO_SCT", S),
        ("MIN_PER_DEAL_NON_WL", I), ("MIN_PER_DEAL_WL", I)],

    "EVEREST.SPREAD_TEMPLATE": [
        ("TEMPLATE_ID", S), ("TEMPLATE_VERSION", S), ("LINE_CODE", S), ("LINE_LABEL", S), ("LINE_GROUP", S),
        ("SORT_ORDER", I), ("IS_CALCULATED", B), ("FORMULA", S), ("UNIT", S)],
    "EVEREST.SPREAD_MODEL": [
        ("SPREAD_ID", S), ("FACILITY_ID", S), ("PERIOD_END_DATE", D), ("PERIOD_TYPE", S), ("VERSION", I),
        ("STATUS", S), ("CREATED_BY", S), ("APPROVED_BY", S), ("APPROVED_AT", T), ("SOURCE_SYSTEM", S)],
    "EVEREST.SPREAD_VALUE": [("SPREAD_ID", S), ("LINE_CODE", S), ("VALUE", N), ("CURRENCY", S),
                             ("SOURCE_DOC_REF", S), ("NOTE", S)],
    "EVEREST.ADJUSTMENT": [("ADJUSTMENT_ID", S), ("SPREAD_ID", S), ("ADJ_TYPE", S), ("AMOUNT", N),
                           ("DESCRIPTION", S), ("ALLOWED_FLAG", B), ("SOURCE_DOC_REF", S)],
    "EVEREST.CMR": [
        ("CMR_ID", S), ("FACILITY_ID", S), ("PERIOD", S), ("VERSION", I), ("CMR_TYPE", S), ("STATUS", S),
        ("AUTHOR", S), ("FILED_AT", T), ("SHAREPOINT_PATH", S), ("MARK", M), ("MARK_RANGE_LOW", M),
        ("MARK_RANGE_HIGH", M), ("MARK_APPROVED_BY", S), ("MARK_APPROVED_AT", T), ("COMMITTEE_MARK", M),
        ("COMMITTEE_RATIONALE", S)],
    "EVEREST.CMR_SECTION": [("CMR_ID", S), ("SECTION_CODE", S), ("SECTION_TITLE", S), ("BODY_TEXT", S),
                            ("SORT_ORDER", I)],
    # CMR "Ratings information" (client file): AB-PCI rating plus DBRS, Egan Jones, S&P and ESG.
    "EVEREST.RISK_RATING": [
        ("FACILITY_ID", S), ("PERIOD", S), ("RATING", I), ("RATING_LABEL", S), ("PREVIOUS_RATING", I),
        ("WATCHLIST_FLAG", B), ("WAIVER_STATUS", S), ("WAIVER_CONDITIONS", S), ("DBRS_LONG_TERM", S),
        ("EGAN_JONES", S), ("SP_RATING", S), ("ESG", S), ("SET_BY", S), ("SET_AT", T)],
    "EVEREST.PRICING_PANEL": [
        ("FACILITY_ID", S), ("PERIOD", S), ("LINCOLN_VERSION", I), ("LINCOLN_POINT", M),
        ("LINCOLN_RANGE_LOW", M), ("LINCOLN_RANGE_HIGH", M), ("REQUIRED_YIELD", M), ("VALUATION_DATE", D),
        ("DEAL_TEAM_STATUS", S), ("DEAL_TEAM_MARK", M), ("DEAL_TEAM_DECIDED_BY", S),
        ("DEAL_TEAM_DECIDED_AT", T), ("SEND_BACK_REASON", S), ("FINAL_MARK", M)],
    "EVEREST.GOVERNANCE_SIGNOFF": [("SIGNOFF_ID", S), ("PERIOD", S), ("CYCLE_TYPE", S), ("SIGNED_BY", S),
                                   ("SIGNED_AT", T), ("SCHEDULE_HASH", S), ("SCHEDULE_DOC_REF", S), ("NOTES", S)],

    # CMR "Holdings" (client file): funds MMDLF1, MMDLF2, BDC, LUX1, PCIPAC, ABLEND, MMDLF4, ABPCI.
    "SENTRY.FUND": [("FUND_ID", S), ("FUND_NAME", S), ("FUND_TYPE", S)],
    "SENTRY.POSITION": [("POSITION_ID", S), ("FACILITY_ID", S), ("FUND_ID", S), ("AS_OF_DATE", D),
                        ("FUNDED_AMOUNT", N), ("UNFUNDED_AMOUNT", N), ("PAR_AMOUNT", N), ("COST_BASIS", N)],
    "SENTRY.DDTL_COMMITMENT": [("FACILITY_ID", S), ("TOTAL_COMMITMENT", N), ("DRAWN_TO_DATE", N),
                               ("UNDRAWN", N), ("AVAILABILITY_END_DATE", D)],
    "SENTRY.DRAW": [("DRAW_ID", S), ("FACILITY_ID", S), ("DRAW_DATE", D), ("AMOUNT", N), ("STATUS", S)],

    "SIGMA.PORTFOLIO_SNAPSHOT_BASE": [
        ("FACILITY_ID", S), ("AS_OF_MONTH", S), ("CURRENT_MARK", M), ("RISK_RATING", I), ("WATCHLIST_FLAG", B),
        ("LAST_FINANCIALS_PERIOD", S), ("LTM_LEVERAGE", M), ("LTM_INTEREST_COVER", M), ("LEVERAGE_TREND", S),
        ("INTEREST_RECEIVED_MTD", N)],

    "FINANCE.PACING_FILE": [("FACILITY_ID", S), ("AS_OF_MONTH", S), ("FUNDED_AMOUNT", N),
                            ("EXPECTED_INTEREST", N), ("INTEREST_RECEIVED", N), ("PACING_STATUS", S),
                            ("NOTES", S), ("SOURCE_FILE_NAME", S)],
    # Reunderwriting Guidance Q3 2026 (client file "August 31 Snapshot", page 3): market spread and maximum
    # leverage by security type and EBITDA band, May 2026 vs current. Band thresholds are redacted: assumed.
    "FINANCE.REUNDERWRITING_GRID": [("AS_OF_MONTH", S), ("SOURCE_DOC", S), ("SECURITY", S), ("EBITDA_BAND", I),
                                    ("BAND_LOW", N), ("BAND_HIGH", N), ("SPREAD_BPS", I), ("FIXED_YIELD", M),
                                    ("MAX_LEVERAGE", M)],
    "FINANCE.WATCHLIST_CALL_NOTE": [("NOTE_ID", S), ("FACILITY_ID", S), ("CALL_DATE", D), ("ATTENDEES", S),
                                    ("NOTE_TEXT", S), ("UPLOADED_BY", S)],
}

AUDIT_COLS = [("LOADED_AT", T), ("SOURCE_BATCH_ID", S)]

VIEWS = {
    "SIGMA.PORTFOLIO_SNAPSHOT": "select FACILITY_ID, AS_OF_MONTH, CURRENT_MARK, RISK_RATING, WATCHLIST_FLAG, "
                                "LAST_FINANCIALS_PERIOD, LTM_LEVERAGE, LTM_INTEREST_COVER, LEVERAGE_TREND, "
                                "INTEREST_RECEIVED_MTD from SIGMA.PORTFOLIO_SNAPSHOT_BASE",
}


def columns(table: str) -> list[str]:
    return [c for c, _ in TABLES[table]]


def ddl(dialect: str = "snowflake") -> list[str]:
    stmts: list[str] = []
    schemas = sorted({t.split(".")[0] for t in TABLES})
    for s in schemas:
        stmts.append(f"create schema if not exists {s}")
    for table, cols in TABLES.items():
        body = ", ".join(f"{c} {_type(t, dialect)}" for c, t in cols + AUDIT_COLS)
        stmts.append(f"create or replace table {table} ({body})" if dialect == "snowflake"
                     else f"create table {table} ({body})")
    for view, sql in VIEWS.items():
        stmts.append(f"create or replace view {view} as {sql}")
    return stmts


def _type(t: str, dialect: str) -> str:
    if dialect == "duckdb":
        return {"STRING": "VARCHAR", "TIMESTAMP_NTZ": "TIMESTAMP", "NUMBER(18,4)": "DECIMAL(18,4)",
                "NUMBER(8,4)": "DECIMAL(8,4)"}.get(t, t)
    return t
