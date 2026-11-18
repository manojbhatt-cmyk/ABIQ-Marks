"""Render a CMR PDF: the client's CMR content (the 2Q26 CMR received on 3 Nov 2026) in a structured layout.

The content follows the client file: Borrower Description, Deal Structure, Summary Information,
Ratings Information, Deal Team; Company Commentary, Key Statistics (LTM), Debt Ratios (LTM);
Capital Structure, Asset and Mark Summary; Financial Commentary, Financials; Covenant Commentary
and Analysis; risks, mitigants, sponsor, recommendation, mark; Holdings. Narrative sections come
from ABIQ's CMR editor; numbers from the approved spread and the Snowflake source tables (auto-fill).
Layout (decision D28): a header band on every page, a key-figures panel, numbered boxed sections,
bordered tables and the recommendation as a callout, in Stone & Sage colours. Currency in USD millions.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from connectors.warehouse import get_warehouse
from domain.models import Cmr, CmrRecommendation, CmrSection, CycleLoan
from reportlab.platypus import Paragraph

from domain.pdf import (H1, LABEL, PROSE, SMALL, PageBreak, ParagraphStyle, Spacer, Table, TableStyle, boxed, build,
                        callout, clean, colors, figures, inch, para, ruled)
from domain.services.spreads import covenant_result, metric_values
from synth.portfolio import RATING_LABELS

W = 7.5 * inch
GAP = 0.18 * inch
HALF = (W - GAP) / 2
TITLE = ParagraphStyle("cmr-title", parent=H1, fontName="Helvetica-Bold", fontSize=19, leading=23,
                       textColor=colors.HexColor("#2B2926"))
SECTION_NO = {"summary": "01", "financial_performance": "02", "covenants_liquidity": "03", "risks": "04",
              "mitigants": "05", "sponsor_collateral": "06", "recommendation": "07"}


def _x(v):
    return "-" if v is None else f"{v:.2f}x"


def _m(v):
    return "-" if v is None else f"{v:,.1f}"


def _prose(text: str) -> list:
    """Paragraphs from the editor text; citation markers set small and muted."""
    out = []
    for chunk in re.split(r"\n\s*\n", (text or "").replace("**", "").strip()):
        if chunk.strip():
            chunk = clean(chunk).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            chunk = re.sub(r"\[([^\]]+? p\.\d+)\]", r"<font color='#78726A' size='7.5'>[\1]</font>", chunk)
            out.append(Paragraph(chunk.replace("\n", "<br/>"), PROSE))
    return out


def _two(left, right) -> Table:
    t = Table([[left, "", right]], colWidths=[HALF, GAP, HALF])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return t


def _pairs(rows, widths=(1.35 * inch, HALF - 1.35 * inch - 20)) -> Table:
    """Label and value rows on hairlines, inside a boxed section."""
    t = Table([[para(a, LABEL), para(b or "-", PROSE)] for a, b in rows], colWidths=list(widths))
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#E8E5DF")),
                           ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]))
    return t


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
    wl = rec.watchlist_action in ("add", "keep") if rec else bool(cl.previous_watchlist)
    proposed = rec.proposed_rating if rec and rec.proposed_rating else cl.previous_rating
    quarter_mark = mark.get("committee_mark") if mark.get("committee_mark") is not None else mark.get("mark")

    def section(code: str, title_: str, extra: list | None = None, width: float = W):
        s = secs.get(code)
        body = _prose(s.body_markdown) if s and s.body_markdown else [para("To be updated.", PROSE)]
        return boxed(title_, body + (extra or []), width, number=SECTION_NO.get(code))

    # ---- page 1: identity, key figures, profile
    story = [para(title, TITLE),
             para(f"Credit monitoring review  |  {(cmr.cmr_type or 'standard').title()} CMR  |  {cmr.period}  |  "
                  f"Financials Q3 2026  |  Version {cmr.version}  |  {cmr.status.replace('_', ' ').title()}", SMALL),
             Spacer(1, 10),
             figures([("Quarter mark", "-" if quarter_mark is None else f"{quarter_mark:.2f}",
                       "committee" if mark.get("committee_mark") is not None else ("Gate 1" if mark else "after Gate 1")),
                      ("Previous mark", "-" if cl.previous_mark is None else f"{cl.previous_mark:.2f}", "2026-Q2"),
                      ("Lincoln range", f"{mark['range_low']:.2f} to {mark['range_high']:.2f}"
                       if mark.get("range_low") is not None else "-", "draft valuation"),
                      ("AB-PCI rating", f"{cl.previous_rating} to {proposed}", RATING_LABELS.get(proposed, "")),
                      ("Total leverage", _x(m.get("LEVERAGE")),
                       f"covenant {_x(cov.get('threshold'))}, {'breached' if cov.get('result') == 'fail' else 'pass'}"
                       if cov else "not spread"),
                      ("LTM adj. EBITDA", _m(m.get("LTM_ADJ_EBITDA")), "USD millions"),
                      ("Liquidity", _m(m.get("LIQUIDITY")), "USD millions"),
                      ("Watchlist", "Yes" if wl else "No", f"action: {rec.watchlist_action}" if rec else "")], W),
             Spacer(1, 12),
             _two(boxed("Borrower description", _prose(bor.get("COMPANY_DESCRIPTION") or "-"), HALF),
                  boxed("Deal structure", _prose(deal.get("DEAL_STRUCTURE") or "-"), HALF)),
             Spacer(1, 12),
             _two(boxed("Summary information", [_pairs([
                 ("Watchlist", "Yes" if wl else "No"),
                 ("Covenant compliant", "No" if cov.get("result") == "fail" else "Yes"),
                 ("Closing date", str(deal.get("DATE_CLOSED") or "")), ("FYE", deal.get("FYE") or ""),
                 ("Primary sponsor", cl.sponsor or ""), ("Admin agent", deal.get("ADMIN_AGENT") or ""),
                 ("Strategy", deal.get("STRATEGY") or ""), ("PA industry", deal.get("PA_INDUSTRY") or ""),
                 ("VCOC", "Yes" if deal.get("VCOC") else "No"), ("Refi risk", deal.get("REFI_RISK") or ""),
                 ("Non accrual", "-")])], HALF),
                  boxed("Ratings and deal team", [_pairs([
                      ("AB-PCI", RATING_LABELS.get(proposed, "")),
                      ("DBRS long term", rating.get("DBRS_LONG_TERM") or "-"), ("Egan Jones", rating.get("EGAN_JONES") or "-"),
                      ("ESG", rating.get("ESG") or "-"), ("S&P", rating.get("SP_RATING") or "-"),
                      ("CDL / VP", deal.get("CDL") or ""), ("Associate", cl.analyst_email or ""),
                      ("SCT", deal.get("SCT") or ""), ("Originator", deal.get("ORIGINATOR") or ""),
                      ("PMT", deal.get("PMT") or "")])], HALF)),
             PageBreak()]

    # ---- page 2: company, statistics, capital structure
    tw = HALF - 20
    story += [section("summary", "Company commentary"), Spacer(1, 12),
              _two(boxed("Key statistics (LTM)", [ruled(
                  [["", "Current"], ["Revenue (Q)", _m(m.get("REVENUE"))],
                   ["Revenue growth", f"{(m.get('REVENUE_YOY') or 0) * 100:.0f}%"],
                   ["Adj. EBITDA (LTM)", _m(m.get("LTM_ADJ_EBITDA"))], ["B/S cash", _m(m.get("CASH"))],
                   ["Funded debt", _m(m.get("TOTAL_DEBT"))]], [tw * 0.6, tw * 0.4])], HALF),
                   boxed("Debt ratios (LTM)", [ruled(
                       [["", "Current"], ["Total leverage", _x(m.get("LEVERAGE"))],
                        ["Net leverage", _x(m.get("NET_LEVERAGE"))], ["Interest cover", _x(m.get("INTEREST_COVER"))],
                        ["FCCR", _x(m.get("FCCR"))], ["Liquidity", _m(m.get("LIQUIDITY"))],
                        ["Months of liquidity", "-" if m.get("LIQUIDITY_MONTHS") is None else f"{m['LIQUIDITY_MONTHS']:.1f}"]],
                       [tw * 0.6, tw * 0.4])], HALF)),
              Spacer(1, 12),
              boxed("Capital structure", [ruled(
                  [["", "Funded", "x LTM adj. EBITDA"], ["Unrestricted cash", _m(m.get("CASH")), ""],
                   ["Total debt", _m(m.get("TOTAL_DEBT")), _x(m.get("LEVERAGE"))],
                   ["Net debt", _m(m.get("NET_DEBT")), _x(m.get("NET_LEVERAGE"))]],
                  [3.0 * inch, 2.0 * inch, W - 5.0 * inch - 20], bold_rows=[2])], W),
              Spacer(1, 12),
              boxed("Asset and mark summary", [ruled(
                  [["Asset", "Class", "Commit", "Funded", "Cash", "Maturity", "Current", "Proposed"]]
                  + [[f["FACILITY_NAME"], f["ASSET_CLASS"], _m(f["COMMITMENT_AMOUNT"]), _m(f["FUNDED"]),
                      f"{(f['COUPON_RATE'] or 0) * 100:.2f}%", str(f["MATURITY_DATE"]),
                      f"{cl.previous_mark:.2f}" if f["FACILITY_ID"] == cl.facility_id and cl.previous_mark else "-",
                      (f"{quarter_mark:.2f}" if f["FACILITY_ID"] == cl.facility_id and quarter_mark is not None
                       else "To be updated")] for f in facs],
                  [1.75 * inch, 0.85 * inch, 0.6 * inch, 0.6 * inch, 0.55 * inch, 0.85 * inch, 0.6 * inch,
                   W - 5.8 * inch - 20], font_size=7.5)], W),
              PageBreak()]

    # ---- page 3: financials and covenants
    story += [section("financial_performance", "Financial commentary"), Spacer(1, 12),
              boxed("Financials (Q3 2026)", [ruled(
                  [["", "Q3 26A"], ["Revenue", _m(m.get("REVENUE"))], ["COGS", _m(m.get("COGS"))],
                   ["OpEx", _m(m.get("OPEX"))], ["EBITDA", _m(m.get("REPORTED_EBITDA"))],
                   ["Total adjustments", _m(m.get("ADDBACK_TOTAL"))], ["Adj. EBITDA", _m(m.get("ADJ_EBITDA"))],
                   ["LTM adj. EBITDA", _m(m.get("LTM_ADJ_EBITDA"))]], [3.5 * inch, 1.5 * inch], bold_rows=[6])], W),
              Spacer(1, 12),
              section("covenants_liquidity", "Covenant commentary", [Spacer(1, 6), ruled(
                  [["Total debt to EBITDA", "Q3 26A"], ["Actual", _x(cov.get("actual"))],
                   ["Level", _x(cov.get("threshold"))],
                   ["Cushion", "-" if cov.get("headroom") is None else f"{cov['headroom'] * 100:.1f}%"],
                   ["Result", "Breached" if cov.get("result") == "fail" else ("Pass" if cov else "-")]],
                  [3.5 * inch, 1.5 * inch])]),
              PageBreak()]

    # ---- page 4: risks, mitigants, sponsor, recommendation, mark, holdings
    def v(x):
        return "-" if x in (None, "") else x

    rec_line = (f"Rating {v(rec.previous_rating)} to {v(rec.proposed_rating)}; watchlist {v(rec.watchlist_action)}; "
                f"waiver {'requested' if rec.waiver_requested else 'none'}"
                f"{(': ' + rec.waiver_conditions) if rec.waiver_conditions else ''}; expected mark direction "
                f"{v(rec.expected_mark_direction)}.") if rec and rec.proposed_rating else "Recommendation not set yet."
    rec_sec = secs.get("recommendation")
    mark_text = ("Q3 mark {:.2f}; Lincoln range {} to {}; approved by {} on {}.".format(
        mark["mark"], mark.get("range_low"), mark.get("range_high"), mark.get("approved_by"),
        (mark.get("approved_at") or "")[:10]) if mark.get("mark") is not None
        else "Mark section to be updated after Lincoln's report.") + (
        f" Committee mark {mark['committee_mark']:.2f}: {mark.get('committee_rationale', '')}"
        if mark.get("committee_mark") is not None else "")
    story += [section("risks", "Key risks"), Spacer(1, 10), section("mitigants", "Mitigants"), Spacer(1, 10),
              section("sponsor_collateral", "Sponsor and collateral"), Spacer(1, 10),
              callout("07  Recommendation",
                      (_prose(rec_sec.body_markdown) if rec_sec and rec_sec.body_markdown else [])
                      + [Spacer(1, 4), para(f"<b>{rec_line}</b> {(rec.rationale or '') if rec else ''}", PROSE)], W),
              Spacer(1, 10), boxed("Mark", [para(mark_text, PROSE)], W), Spacer(1, 10),
              boxed("Holdings", [ruled(
                  [["Fund", "Funded", "Unfunded", "Total"]]
                  + [[h["FUND_ID"], _m(h["F"]), _m(h["U"]), _m((h["F"] or 0) + (h["U"] or 0))] for h in holdings]
                  + [["Total", _m(sum(h["F"] or 0 for h in holdings)), _m(sum(h["U"] or 0 for h in holdings)),
                      _m(sum((h["F"] or 0) + (h["U"] or 0) for h in holdings))]],
                  [2.5 * inch, 1.5 * inch, 1.5 * inch, W - 5.5 * inch - 20], bold_rows=[len(holdings) + 1])], W)]
    return build(story, title=f"{cl.borrower} CMR {cmr.period} v{cmr.version}",
                 footer="Currency figures are in USD millions  |  Private and Confidential  |  AllianceBernstein PCI",
                 header=(f"{title}  |  CMR", f"{cmr.period}  |  v{cmr.version}"))
