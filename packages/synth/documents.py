"""Borrower packages, Lincoln outputs and finance files produced by the generator.

Format families (Data Spec section 7.3): A management accounts xlsx, B audited-style
PDF with footnotes, C scanned pack (page images, low confidence). Lincoln's report
follows the five schedules of Lincoln's real draft report (Valuation Summary, Summary
of Valuation Assumptions, Debt Security Terms, Market Approach, Capitalization
Overview); the marks spreadsheet follows Data Spec section 3.3.
"""
from __future__ import annotations

import io
from datetime import date

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

from domain.pdf import (BODY, H1, H2, LINCOLN_GREEN, LINCOLN_NAVY, LINCOLN_STEEL, SMALL, PageBreak, Spacer, Table,
                        band, build, colors, frame, grid, image_page, inch, kv, para, render_text_image)
from synth.portfolio import HARBOR_V1_ASSUMPTIONS, HARBOR_V2, Q_LABELS, Borrower, Facility

# Line labels differ by family on purpose (tests label mapping).
LABELS_B = {"REVENUE": "Total revenue", "COGS": "Cost of revenue", "OPEX": "Operating expenses",
            "REPORTED_EBITDA": "Operating profit before depreciation"}
LABELS_A = {"REVENUE": "Net sales", "COGS": "Direct costs", "OPEX": "Selling, general and administrative",
            "REPORTED_EBITDA": "EBITDA (reported)"}
HARBOR_LABELS = {"REVENUE": "Freight revenue plus fuel surcharge income", "COGS": "Fleet operating costs",
                 "OPEX": "Operating expenses", "REPORTED_EBITDA": "Operating profit before depreciation"}


def _fmt(v: float) -> str:
    return f"{v:,.1f}"


def statements_pdf(br: Borrower) -> bytes:
    f = br.fin
    labels = HARBOR_LABELS if br.borrower_id == "B-0002" else LABELS_B
    story = [para(f"{br.legal}", H1), para("Quarterly financial statements for the period ended 30 September 2026",
                                          H2),
             para("Unaudited. Prepared by management in accordance with US GAAP. USD in millions.", SMALL),
             Spacer(1, 10), para("Consolidated statement of operations", H2)]
    rows = [["", *Q_LABELS]]
    for code in ("REVENUE", "COGS", "OPEX", "REPORTED_EBITDA"):
        rows.append([labels[code], *[_fmt(v) for v in f[code]]])
    story.append(grid(rows, [2.6 * inch] + [0.95 * inch] * 5, bold_rows=[4]))
    story += [Spacer(1, 10), para("Cash flow items", H2),
              grid([["", *Q_LABELS], ["Capital expenditures", *[_fmt(v) for v in f["CAPEX"]]],
                    ["Cash taxes paid", *[_fmt(v) for v in f["CASH_TAXES"]]]], [2.6 * inch] + [0.95 * inch] * 5)]
    story += [Spacer(1, 10), para("Condensed balance sheet at 30 September 2026", H2),
              grid([["", "30 Sep 2026"], ["Cash and cash equivalents", _fmt(f["CASH"])],
                    ["Total debt", _fmt(f["TOTAL_DEBT"])],
                    ["Interest expense (last twelve months)", _fmt(f["INTEREST_EXPENSE_LTM"])]],
                   [3.6 * inch, 1.2 * inch]),
              Spacer(1, 10), para("Notes to the financial statements", H2)]
    notes = ["Note 1: Basis of preparation. These statements are unaudited and subject to year-end adjustments.",
             "Note 4: Debt. Borrowings comprise the senior secured credit facilities held by AB-PCI managed funds."]
    if br.borrower_id == "B-0002":
        notes += [
            "Note 6: Customer concentration. The Company's largest customer, representing 22 percent of revenue, "
            "terminated its contract effective 1 July 2026. Two replacement contracts were signed in September 2026.",
            "Note 7: Restructuring. During the quarter the Company eliminated 40 driver positions and incurred "
            "one-off severance costs of $0.3 million, included in operating expenses.",
            "Note 8: Fleet. The Company operates 180 trucks with an appraised collateral value of approximately "
            "$38 million.",
            "Note 9: Subsequent events. On 6 October 2026 the sponsor, Northgate Capital, committed $5.0 million of "
            "new equity; the funds are expected on 30 October 2026."]
    for n in notes:
        story.append(para(n, BODY))
    return build(story, title=f"{br.name} Q3 2026 financial statements", footer=f"{br.legal} | Q3 2026 | Unaudited")


def statements_xlsx(br: Borrower) -> bytes:
    f = br.fin
    wb = Workbook()
    ws = wb.active
    ws.title = "Income Statement"
    ws.append([f"{br.legal} management accounts (USD m)"])
    ws.append(["Line", *Q_LABELS])
    for code in ("REVENUE", "COGS", "OPEX", "REPORTED_EBITDA"):
        ws.append([LABELS_A[code], *f[code]])
    ws["A1"].font = Font(bold=True)
    bs = wb.create_sheet("Balance Sheet")
    bs.append(["Line", "30 Sep 2026"])
    bs.append(["Cash at bank", f["CASH"]])
    bs.append(["Borrowings (total)", f["TOTAL_DEBT"]])
    bs.append(["Interest paid LTM", f["INTEREST_EXPENSE_LTM"]])
    cf = wb.create_sheet("Cash Flow")
    cf.append(["Line", *Q_LABELS])
    cf.append(["Purchase of property and equipment", *f["CAPEX"]])
    cf.append(["Income taxes paid", *f["CASH_TAXES"]])
    notes = wb.create_sheet("Notes")
    notes.append(["Management accounts, unaudited, prepared for lenders."])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def scanned_pdf(br: Borrower) -> bytes:
    f = br.fin
    cover = render_text_image([br.legal, "", "Quarterly reporting pack, Q3 2026", "", "Dear lenders,",
                               "Please find enclosed our quarterly management pack.", "", "Chief Financial Officer"])
    lines = ["STATEMENT OF OPERATIONS (USD m)", "", f"{'':38}" + "".join(f"{q:>10}" for q in Q_LABELS)]
    for code in ("REVENUE", "COGS", "OPEX", "REPORTED_EBITDA"):
        lines.append(f"{LABELS_B[code]:<38}" + "".join(f"{v:>10.1f}" for v in f[code]))
    table_img = render_text_image(lines, width=1600)
    story = [image_page(cover), PageBreak(), image_page(table_img), PageBreak(),
             para("Balance sheet at 30 September 2026 (typed page)", H2),
             grid([["", "30 Sep 2026"], ["Cash and cash equivalents", _fmt(f["CASH"])],
                   ["Total debt", _fmt(f["TOTAL_DEBT"])],
                   ["Interest expense (last twelve months)", _fmt(f["INTEREST_EXPENSE_LTM"])]],
                  [3.6 * inch, 1.2 * inch]),
             Spacer(1, 10), para("Cash flow items (typed page)", H2),
             grid([["", *Q_LABELS], ["Capital expenditures", *[_fmt(v) for v in f["CAPEX"]]],
                   ["Cash taxes paid", *[_fmt(v) for v in f["CASH_TAXES"]]]], [2.6 * inch] + [0.95 * inch] * 5)]
    return build(story, title=f"{br.name} Q3 2026 pack", footer="Scanned pack")


def covenant_certificate(br: Borrower, fac: Facility) -> bytes:
    f = br.fin
    ltm = sum(e + s for e, s in zip(f["REPORTED_EBITDA"][1:], f["SEVERANCE"][1:]))
    lev = f["TOTAL_DEBT"] / ltm
    if br.borrower_id == "B-0002":
        lev = 3.42  # the borrower's own calculation nets the expected equity: wrong on purpose (A11)
    kind, op, threshold = fac.covenant
    result = "In compliance" if lev < threshold else "Not in compliance"
    story = [para("Compliance Certificate", H1),
             para(f"Borrower: {br.legal}. Facility: {fac.facility_id}. Test date: 30 September 2026.", BODY),
             Spacer(1, 8),
             grid([["Covenant", "Requirement", "Actual", "Result"],
                   ["Maximum total leverage ratio", f"{op} {threshold:.2f}x", f"{lev:.2f}x", result]],
                  [2.6 * inch, 1.3 * inch, 1.1 * inch, 1.6 * inch]),
             Spacer(1, 8),
             para(f"Consolidated total debt {f['TOTAL_DEBT']:.1f}; LTM adjusted EBITDA as calculated by the "
                  f"Borrower.", BODY),
             para("The undersigned Chief Financial Officer certifies the above on behalf of the Borrower.", BODY)]
    return build(story, title="Compliance certificate", footer=br.legal)


def sponsor_letter(br: Borrower, sponsor_name: str) -> bytes:
    if br.borrower_id == "B-0002":
        text = ("6 October 2026\n\nTo the Lenders under the Harbor Logistics credit agreement\n\n"
                "Northgate Capital hereby confirms its commitment to contribute $5.0 million of new common equity "
                "to Harbor Logistics Holdings Inc. The funds will be wired on or before 30 October 2026 and applied "
                "to reduce outstanding borrowings and support liquidity during the customer transition.\n\n"
                "Yours faithfully,\nManaging Partner, Northgate Capital")
    else:
        text = (f"5 October 2026\n\nTo the Lenders of {br.legal}\n\n{sponsor_name} confirms its continued "
                f"support of the Company and its management plan. No new equity is committed at this time.\n\n"
                f"Yours faithfully,\nPartner, {sponsor_name}")
    return build([para("Sponsor letter", H1), para(text, BODY)], title="Sponsor letter", footer=sponsor_name)


def waiver_request(br: Borrower) -> bytes:
    text = ("8 October 2026\n\nThe Company requests a waiver of the maximum total leverage covenant (3.50x) for the "
            "test period ended 30 September 2026, in which leverage was 3.75x following the loss of its largest "
            "customer. Northgate Capital has committed $5.0 million of new equity. The Company proposes monthly "
            "reporting and a 3.25x step-down by 30 June 2027 as conditions.")
    return build([para("Request for waiver", H1), para(text, BODY)], title="Waiver request", footer=br.legal)


def cover_letter(br: Borrower) -> str:
    return (f"Dear AB-PCI team,\n\nPlease find attached the Q3 2026 reporting package for {br.legal}.\n\n"
            f"Kind regards,\nFinance team, {br.name}")


# ---------------- Lincoln ----------------

def lincoln_marks_xlsx(rows: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Marks"
    head = ["Facility ID", "Borrower", "Valuation date", "Version", "Point estimate", "Range low", "Range high",
            "Required yield", "Methodology", "Key assumptions", "Comments"]
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="0E3B4F")
    for r in rows:
        ws.append([r["facility_id"], r["borrower"], r["valuation_date"], r["version"], r["point"], r["low"],
                   r["high"], r["yield_text"], r["methodology"], r["assumptions"], r.get("comments", "")])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def lincoln_row(br: Borrower, fac: Facility, version: int = 1) -> dict:
    if version == 2:
        v = HARBOR_V2
        return {"facility_id": fac.facility_id, "borrower": br.name, "valuation_date": v["valuation_date"].isoformat(),
                "version": 2, "point": v["point"], "low": v["low"], "high": v["high"], "yield": v["yield"],
                "yield_text": f"{v['yield'] * 100:.1f}%", "methodology": "Yield-based, cross-checked with recovery",
                "assumptions": v["assumptions"], "comments": v["comments"]}
    y = fac.required_yield or round(fac.coupon + 0.012 + (100 - fac.lincoln_point) / 300, 4)
    assumptions = HARBOR_V1_ASSUMPTIONS if fac.facility_id == "F-0002" else (
        "Stable performance; leverage within covenant" if not br.watchlist else
        "Watchlist credit; recovery in progress; sponsor support continues")
    if fac.facility_id == "F-0003":
        assumptions = "Recovery in volumes and margin over two quarters; refinancing risk reduced"
    return {"facility_id": fac.facility_id, "borrower": br.name, "valuation_date": "2026-10-18", "version": 1,
            "point": fac.lincoln_point, "low": round(fac.lincoln_point - fac.range_half, 2),
            "high": round(fac.lincoln_point + fac.range_half, 2), "yield": y, "yield_text": f"{y * 100:.1f}%",
            "methodology": "Yield-based, cross-checked with recovery" if fac.ftype != "ddtl" else
            "Market Pricing Comparison", "assumptions": assumptions, "comments": ""}


def lincoln_report_pdf(br: Borrower, fac: Facility, row: dict, prev_mark: float, sponsor: str) -> bytes:
    """Lincoln draft report, five schedules, landscape, with the DRAFT watermark."""
    W = 10 * inch

    def header(n: int, title: str) -> list:
        return [para(f"<font color='#6A9FB5'><i>{br.name} - Schedule {n}</i></font>", BODY),
                para(f"<font color='#0E3B4F'>{title}</font>", H1),
                para(f"Valuation Date: {row['valuation_date']}   |   Market Input Date: {row['valuation_date']}   |   "
                     f"Report Date: {row['valuation_date']}   |   Prepared For: AB-PCI", SMALL), Spacer(1, 6)]

    tranche = {"term_loan": "Term Loan", "ddtl": "DDTL", "second_lien": "Second Lien Term Loan"}.get(fac.ftype, "Term Loan")
    f = br.fin
    ltm_rev = sum(f["REVENUE"][1:])
    ltm_ebitda = sum(e + s for e, s in zip(f["REPORTED_EBITDA"][1:], f["SEVERANCE"][1:]))
    nl = (f["TOTAL_DEBT"] - f["CASH"]) / ltm_ebitda
    covenant_ok = "Pass" if fac.facility_id not in ("F-0002",) else "Fail"
    story = header(1, "Valuation Summary")
    story += [kv([("Company Description", br.description), ("Initial Transaction", "Acquisition"),
                  ("Sponsor", sponsor), ("Overview of Valuation",
                   f"Fair value of the {tranche} concluded at {row['point']:.2f} (range {row['low']:.2f} to "
                   f"{row['high']:.2f}). {row['assumptions']}."), ("Methodology Change", "None")],
                 widths=(2.0 * inch, 8.0 * inch)), Spacer(1, 6),
              grid([["Valuation History (Midpoint of Concluded Range, Per Unit)", "2026 Jun", "2026 Sep",
                     "Change vs. Prior Valuation Period"],
                    [tranche, f"{prev_mark:.2f}", f"{row['point']:.2f}", f"{row['point'] - prev_mark:+.2f}"]],
                   [4.2 * inch, 1.6 * inch, 1.6 * inch, 2.6 * inch], header_bg=LINCOLN_NAVY, header_fg=colors.white),
              Spacer(1, 6),
              grid([["Scorecard", "Result"], ["Covenant Compliance", covenant_ok], ["Non-Accrual", "No"],
                    ["Maturity within one year?", "No"], ["Amendment?", "No"]],
                   [3.0 * inch, 1.5 * inch], header_bg=LINCOLN_NAVY, header_fg=colors.white),
              Spacer(1, 6),
              grid([["Financial Metrics", "Prior Period", "Current Period"],
                    ["LTM Revenue", _fmt(sum(f["REVENUE"][:4])), _fmt(ltm_rev)],
                    ["LTM EBITDA", _fmt(sum(f["REPORTED_EBITDA"][:4])), _fmt(ltm_ebitda)],
                    ["Net Leverage", "", f"{nl:.2f}x"]],
                   [3.0 * inch, 1.5 * inch, 1.5 * inch], header_bg=LINCOLN_STEEL, header_fg=colors.white),
              Spacer(1, 6),
              grid([[f"{tranche} (Due {fac.maturity:%Y %b})", "Prior Period", "Current Period"],
                    ["Contractual Spread", f"3M S + {int((fac.coupon - 0.043) * 10000)}",
                     f"3M S + {int((fac.coupon - 0.043) * 10000)}"],
                    ["Contractual Yield to Par", f"{fac.coupon * 100:.2f}%", f"{fac.coupon * 100:.2f}%"],
                    ["Concluded Yield (Mid)", "", row["yield_text"]]],
                   [3.0 * inch, 1.5 * inch, 1.5 * inch], header_bg=LINCOLN_NAVY, header_fg=colors.white),
              PageBreak()]
    story += header(2, "Summary of Valuation Assumptions")
    story += [grid([["Fair Value Conclusion", "Prior Low", "Prior High", "Current Low", "Current High"],
                    [f"{tranche} % of Par", f"{prev_mark - fac.range_half:.2f}", f"{prev_mark + fac.range_half:.2f}",
                     f"{row['low']:.2f}", f"{row['high']:.2f}"]],
                   [3.0 * inch] + [1.5 * inch] * 4, header_bg=LINCOLN_NAVY, header_fg=colors.white),
              Spacer(1, 6),
              grid([["Selected Valuation Technique(s)", "Prior", "Current"],
                    [tranche, "Yield Method", row["methodology"]]],
                   [3.0 * inch, 2.5 * inch, 3.5 * inch], header_bg=LINCOLN_STEEL, header_fg=colors.white),
              Spacer(1, 6),
              para(f"Business Update: {row['assumptions']}.", BODY),
              para(f"Yield Method: required yield {row['yield_text']}; point estimate {row['point']:.2f}; "
                   f"range {row['low']:.2f} to {row['high']:.2f}.", BODY),
              para(f"Comments: {row.get('comments') or 'None'}", BODY), PageBreak()]
    story += header(3, "Debt Security Terms")
    story += [grid([[tranche, ""], ["Currency", "USD"], ["Commitment - AB-PCI", _fmt(fac.commitment)],
                    ["Outstanding - AB-PCI", _fmt(fac.funded)], ["Stated Maturity Date", fac.maturity.isoformat()],
                    ["Pricing Description", f"3M S + {int((fac.coupon - 0.043) * 10000)}"],
                    ["Interest Payment Frequency (Per Yr.)", "4"],
                    ["Yield to Par as of Valuation Date", f"{fac.coupon * 100:.2f}%"]],
                   [3.5 * inch, 2.5 * inch], header_bg=LINCOLN_NAVY, header_fg=colors.white), PageBreak()]
    story += header(4, "Market Approach - Selected Public Companies Analysis")
    comps = [["Company Name", "EV / LTM Revenue", "EV / LTM EBITDA", "LTM Margin EBITDA"],
             ["Comparable A", "1.4x", "8.9x", "15.7%"], ["Comparable B", "1.1x", "7.6x", "14.5%"],
             ["Comparable C", "1.8x", "10.2x", "17.6%"], ["Median", "1.4x", "8.9x", "15.7%"]]
    story += [grid(comps, [3.5 * inch, 2.0 * inch, 2.0 * inch, 2.0 * inch], header_bg=LINCOLN_NAVY,
                   header_fg=colors.white, bold_rows=[4]), PageBreak()]
    story += header(5, "Capitalization Overview")
    story += [grid([["", "Amount", "Net Leverage"], ["Excess Cash", _fmt(f["CASH"]), ""],
                    [tranche, _fmt(fac.funded), ""], ["Total Debt", _fmt(f["TOTAL_DEBT"]), ""],
                    ["Net Debt", _fmt(f["TOTAL_DEBT"] - f["CASH"]), f"{nl:.2f}x"],
                    ["Primary Reference Financial Statistic", _fmt(ltm_ebitda), "LTM EBITDA"]],
                   [3.5 * inch, 2.0 * inch, 2.0 * inch], header_bg=LINCOLN_NAVY, header_fg=colors.white,
                   bold_rows=[3])]
    _ = (LINCOLN_GREEN, W)
    # Every schedule table gets a border and inner rules in Lincoln's steel; the text is unchanged, so the
    # cross-check (A4) reads the report the same way.
    story = [frame(f, rule=LINCOLN_STEEL) if isinstance(f, Table) else f for f in story]
    return build(story, landscape_mode=True, title=f"{br.name} Lincoln draft valuation v{row['version']}",
                 footer=f"DRAFT | Lincoln International | {br.name} | Version {row['version']}",
                 header=(f"Lincoln International  |  {br.name}", f"Draft valuation  |  Version {row['version']}"),
                 header_color=LINCOLN_NAVY)


def pacing_xlsx(rows: list[dict], month: str) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Pacing"
    ws.append(["Facility ID", "Borrower", "Month", "Funded amount", "Expected interest", "Interest received",
               "Pacing status", "Notes"])
    for r in rows:
        ws.append([r["FACILITY_ID"], r["BORROWER"], month, r["FUNDED_AMOUNT"], r["EXPECTED_INTEREST"],
                   r["INTEREST_RECEIVED"], r["PACING_STATUS"], r["NOTES"]])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


__all__ = ["statements_pdf", "statements_xlsx", "scanned_pdf", "covenant_certificate", "sponsor_letter",
           "waiver_request", "cover_letter", "lincoln_marks_xlsx", "lincoln_row", "lincoln_report_pdf",
           "pacing_xlsx", "date"]
