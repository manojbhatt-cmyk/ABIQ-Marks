"""Render a CMR PDF in the client's CMR layout (the 2Q26 CMR received on 3 Nov 2026).

Pages and section bands follow the client file: Borrower Description, Deal Structure,
Summary Information, Ratings Information, Deal Team; Company Commentary, Key
Statistics (LTM), Debt Ratios (LTM); Capital Structure, Asset and Mark Summary;
Financial Commentary, Financials; Covenant Commentary and Analysis; Holdings.
Narrative sections come from TIQ's CMR editor; numbers from the approved spread and
the Snowflake source tables (auto-fill). Currency in USD millions.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from connectors.warehouse import get_warehouse
from domain.models import Cmr, CmrRecommendation, CmrSection, CycleLoan
from domain.pdf import (AB_TEAL, BODY, H1, SMALL, PageBreak, Spacer, Table, TableStyle, band, build, colors, grid,
                        inch, kv, para)
from domain.services.spreads import covenant_result, metric_values
from synth.portfolio import RATING_LABELS

W = 7.5 * inch


def _x(v):
    return "-" if v is None else f"{v:.2f}x"


def _m(v):
    return "-" if v is None else f"{v:,.1f}"


def render_cmr_pdf(session: Session, cmr: Cmr) -> bytes:
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    wh = get_warehouse()
    deal = (wh.query("select * from DEALCLOUD.DEAL where DEAL_ID = ?", [cl.deal_id]) or [{}])[0]
    bor = (wh.query("select * from DEALCLOUD.BORROWER where BORROWER_ID = ?", [cl.borrower_id]) or [{}])[0]
    rating = (wh.query("select * from EVEREST.RISK_RATING where FACILITY_ID = ? order by PERIOD desc",
                       [cl.facility_id]) or [{}])[0]
    facs = wh.query("select f.*, (select sum(FUNDED_AMOUNT) from SENTRY.POSITION p where p.FACILITY_ID = f.FACILITY_ID "
                    "and p.AS_OF_DATE = cast('2026-09-30' as date)) FUNDED from DEALCLOUD.FACILITY f where DEAL_ID = ? "
                    "order by FACILITY_ID", [cl.deal_id])
    holdings = wh.query("select FUND_ID, sum(FUNDED_AMOUNT) F, sum(UNFUNDED_AMOUNT) U from SENTRY.POSITION p join "
                        "DEALCLOUD.FACILITY f on f.FACILITY_ID = p.FACILITY_ID where f.DEAL_ID = ? and "
                        "p.AS_OF_DATE = cast('2026-09-30' as date) group by FUND_ID order by FUND_ID", [cl.deal_id])
    secs = {s.section_code: s for s in session.query(CmrSection).filter_by(cmr_id=cmr.id)}
    rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first()
    m = metric_values(session, cl.id)
    cov = covenant_result(session, cl.id)
    mark = cmr.mark_block_json or {}
    title = deal.get("DEAL_NAME") or cl.borrower

    def header():
        return [para(f"{title}", H1),
                para(f"Printed: {cmr.period}   Financials: Q3 2026   Version {cmr.version}   AllianceBernstein", SMALL),
                Spacer(1, 6)]

    def body(code):
        s = secs.get(code)
        return para((s.body_markdown if s and s.body_markdown else "To be updated.").replace("**", ""), BODY)

    def two(left, right):
        t = Table([[left, right]], colWidths=[W / 2 - 4, W / 2 - 4])
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        return t

    lw = W / 2 - 4
    wl = rec.watchlist_action in ("add", "keep") if rec else bool(cl.previous_watchlist)
    story = header() + [
        two([band("BORROWER DESCRIPTION", lw), para(bor.get("COMPANY_DESCRIPTION") or "", BODY)],
            [band("DEAL STRUCTURE", lw), para(deal.get("DEAL_STRUCTURE") or "", BODY)]),
        Spacer(1, 8),
        two([band("SUMMARY INFORMATION", lw),
             kv([("Watchlist:", "Yes" if wl else "No"),
                 ("Covenant Compliant:", "No" if cov.get("result") == "fail" else "Yes"),
                 ("Closing Date:", str(deal.get("DATE_CLOSED") or "")), ("FYE:", deal.get("FYE") or ""),
                 ("Primary Sponsor:", cl.sponsor or ""), ("Admin Agent:", deal.get("ADMIN_AGENT") or ""),
                 ("Strategy:", deal.get("STRATEGY") or ""), ("PA Industry:", deal.get("PA_INDUSTRY") or ""),
                 ("VCOC?:", "Yes" if deal.get("VCOC") else "No"), ("Refi Risk:", deal.get("REFI_RISK") or ""),
                 ("Non Accrual", "-")], widths=(1.4 * inch, 2.2 * inch))],
            [band("RATINGS INFORMATION", lw),
             kv([("AB-PCI:", RATING_LABELS.get(rec.proposed_rating if rec and rec.proposed_rating else cl.previous_rating, "")),
                 ("DBRS Long Term:", rating.get("DBRS_LONG_TERM") or "-"), ("Egan Jones:", rating.get("EGAN_JONES") or "-"),
                 ("ESG:", rating.get("ESG") or "-"), ("S&P:", rating.get("SP_RATING") or "-")],
                widths=(1.4 * inch, 2.2 * inch)),
             Spacer(1, 6), band("DEAL TEAM", lw),
             kv([("CDL/VP", deal.get("CDL") or ""), ("Associate 1", cl.analyst_email or ""), ("SCT", deal.get("SCT") or ""),
                 ("Originator 1", deal.get("ORIGINATOR") or ""), ("PMT", deal.get("PMT") or "")],
                widths=(1.4 * inch, 2.2 * inch))]),
        PageBreak()]
    story += header() + [band("COMPANY COMMENTARY", W), body("summary"), Spacer(1, 8),
                         two([band("KEY STATISTICS (LTM)", lw),
                              grid([["", "Current"], ["Revenue (Q):", _m(m.get("REVENUE"))],
                                    ["Revenue Growth:", f"{(m.get('REVENUE_YOY') or 0) * 100:.0f}%"],
                                    ["Adj. EBITDA (LTM):", _m(m.get("LTM_ADJ_EBITDA"))],
                                    ["B/S Cash:", _m(m.get("CASH"))], ["Funded Debt:", _m(m.get("TOTAL_DEBT"))]],
                                   [1.8 * inch, 1.6 * inch])],
                             [band("DEBT RATIOS (LTM)", lw),
                              grid([["", "Current"], ["Total Leverage:", _x(m.get("LEVERAGE"))],
                                    ["Net Leverage:", _x(m.get("NET_LEVERAGE"))],
                                    ["Interest Cover:", _x(m.get("INTEREST_COVER"))], ["FCCR:", _x(m.get("FCCR"))],
                                    ["Liquidity:", _m(m.get("LIQUIDITY"))],
                                    ["Months of liquidity:", "-" if m.get("LIQUIDITY_MONTHS") is None else f"{m['LIQUIDITY_MONTHS']:.1f}"]],
                                   [1.8 * inch, 1.6 * inch])]),
                         Spacer(1, 8), band("CAPITAL STRUCTURE", W),
                         grid([["", "Funded", "Current PF LTM Adj. EBITDA x"],
                               ["Unrestricted Cash", _m(m.get("CASH")), ""],
                               ["Total Debt", _m(m.get("TOTAL_DEBT")), _x(m.get("LEVERAGE"))],
                               ["Net Debt", _m(m.get("NET_DEBT")), _x(m.get("NET_LEVERAGE"))]],
                              [3.0 * inch, 2.0 * inch, 2.5 * inch], bold_rows=[2]),
                         Spacer(1, 8), band("ASSET AND MARK SUMMARY", W),
                         grid([["Asset", "Asset Class", "Commit", "Funded", "Cash", "Maturity", "Current", "Proposed"]]
                              + [[f["FACILITY_NAME"], f["ASSET_CLASS"], _m(f["COMMITMENT_AMOUNT"]), _m(f["FUNDED"]),
                                  f"{(f['COUPON_RATE'] or 0) * 100:.2f}%", str(f["MATURITY_DATE"]),
                                  f"{cl.previous_mark:.2f}" if f["FACILITY_ID"] == cl.facility_id and cl.previous_mark else "-",
                                  (f"{mark.get('committee_mark') or mark.get('mark'):.2f}" if f["FACILITY_ID"] == cl.facility_id
                                   and (mark.get("committee_mark") or mark.get("mark")) else "To be updated")]
                                 for f in facs],
                              [1.9 * inch, 0.9 * inch, 0.6 * inch, 0.6 * inch, 0.6 * inch, 0.9 * inch, 0.6 * inch, 0.9 * inch],
                              font_size=7.5),
                         PageBreak()]
    story += header() + [band("FINANCIAL COMMENTARY", W), body("financial_performance"), Spacer(1, 8),
                         band("FINANCIALS (Q3 2026)", W),
                         grid([["", "Q3 26A"], ["Revenue", _m(m.get("REVENUE"))], ["COGS", _m(m.get("COGS"))],
                               ["OpEx", _m(m.get("OPEX"))], ["EBITDA", _m(m.get("REPORTED_EBITDA"))],
                               ["Total Adjustments", _m(m.get("ADDBACK_TOTAL"))], ["Adj EBITDA", _m(m.get("ADJ_EBITDA"))],
                               ["LTM Adj EBITDA", _m(m.get("LTM_ADJ_EBITDA"))]], [3.5 * inch, 1.5 * inch], bold_rows=[6]),
                         Spacer(1, 8), band("COVENANT COMMENTARY", W), body("covenants_liquidity"), Spacer(1, 6),
                         band("COVENANT ANALYSIS", W),
                         grid([["", "Q3 26A"], ["Total Debt to EBITDA: Actual", _x(cov.get("actual"))],
                               ["Total Debt to EBITDA: Level", _x(cov.get("threshold"))],
                               ["Total Debt to EBITDA: % Cushion",
                                "-" if cov.get("headroom") is None else f"{cov['headroom'] * 100:.1f}%"]],
                              [3.5 * inch, 1.5 * inch]),
                         PageBreak()]
    story += header() + [band("KEY RISKS", W), body("risks"), band("MITIGANTS", W), body("mitigants"),
                         band("SPONSOR AND COLLATERAL", W), body("sponsor_collateral"),
                         band("RECOMMENDATION", W), body("recommendation"),
                         para(f"Rating {rec.previous_rating} to {rec.proposed_rating}; watchlist {rec.watchlist_action}; "
                              f"waiver {'requested' if rec.waiver_requested else 'none'}"
                              f"{(': ' + rec.waiver_conditions) if rec.waiver_conditions else ''}; expected mark "
                              f"direction {rec.expected_mark_direction}. {rec.rationale or ''}", BODY) if rec else Spacer(1, 1),
                         band("MARK", W),
                         para(("Q3 mark {:.2f}; Lincoln range {} to {}; approved by {} on {}.".format(
                             mark["mark"], mark.get("range_low"), mark.get("range_high"), mark.get("approved_by"),
                             (mark.get("approved_at") or "")[:10]) if mark.get("mark") is not None
                               else "Mark section to be updated after Lincoln's report.")
                              + (f" Committee mark {mark['committee_mark']:.2f}: {mark.get('committee_rationale', '')}"
                                 if mark.get("committee_mark") is not None else ""), BODY),
                         Spacer(1, 8), band("HOLDINGS", W),
                         grid([["Fund Name", "Funded", "Unfunded", "Total"]]
                              + [[h["FUND_ID"], _m(h["F"]), _m(h["U"]), _m((h["F"] or 0) + (h["U"] or 0))] for h in holdings]
                              + [["Total", _m(sum(h["F"] or 0 for h in holdings)), _m(sum(h["U"] or 0 for h in holdings)),
                                  _m(sum((h["F"] or 0) + (h["U"] or 0) for h in holdings))]],
                              [2.5 * inch, 1.5 * inch, 1.5 * inch, 1.5 * inch], bold_rows=[len(holdings) + 1])]
    _ = (AB_TEAL, colors)
    return build(story, title=f"{cl.borrower} CMR {cmr.period} v{cmr.version}",
                 footer="Currency figures are in USD millions  |  Private and Confidential")
