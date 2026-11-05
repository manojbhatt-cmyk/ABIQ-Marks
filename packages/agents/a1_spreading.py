"""A1 Spreading Agent (Agentic AI Spec section 6.2).

The agent reads the package's tables and notes and proposes the standard template
lines with evidence and confidence. Plan: list tables, map each template line to
the best matching row (label synonyms, then token overlap), pick the period columns,
read the notes for one-off items (add-back candidates), self-check (EBITDA identity),
and report lines not found. It never approves a spread.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from pipeline.parse import ParsedDoc

INPUT_LINES = ["REVENUE", "COGS", "OPEX", "REPORTED_EBITDA", "CASH", "TOTAL_DEBT", "INTEREST_EXPENSE_LTM", "CAPEX",
               "CASH_TAXES"]
SYNONYMS = {
    "REVENUE": ["total revenue", "revenue", "net sales", "freight revenue plus fuel surcharge income", "sales"],
    "COGS": ["cost of revenue", "cost of sales", "cost of goods sold", "direct costs", "fleet operating costs"],
    "OPEX": ["operating expenses", "selling, general and administrative", "sg&a", "overheads"],
    "REPORTED_EBITDA": ["operating profit before depreciation", "ebitda (reported)", "reported ebitda", "ebitda"],
    "CASH": ["cash and cash equivalents", "cash at bank", "cash"],
    "TOTAL_DEBT": ["total debt", "borrowings (total)", "total borrowings"],
    "INTEREST_EXPENSE_LTM": ["interest expense (last twelve months)", "interest paid ltm", "ltm interest expense"],
    "CAPEX": ["capital expenditures", "purchase of property and equipment", "capex"],
    "CASH_TAXES": ["cash taxes paid", "income taxes paid", "taxes paid"],
}
PERIOD_COLS = {"same_quarter_last_year": 0, "q_minus_3": 1, "q_minus_2": 2, "prior_quarter": 3, "quarter": 4}
ADDBACK_PATTERNS = [
    ("severance", re.compile(r"severance costs? of \$?([\d.]+) ?million", re.I)),
    ("restructuring", re.compile(r"restructuring (?:charges?|costs?) of \$?([\d.]+) ?million", re.I)),
    ("non_recurring_legal", re.compile(r"legal (?:settlement|costs?) of \$?([\d.]+) ?million", re.I)),
]


@dataclass
class DocInput:
    doc_id: str
    file_name: str
    parsed: ParsedDoc


def _score(label: str, synonyms: list[str]) -> float:
    lab = label.lower().strip()
    if lab in synonyms:
        return 0.97
    for s in synonyms:
        if lab.startswith(s) or s.startswith(lab) and len(lab) > 4:
            return 0.9
    lt = set(re.findall(r"[a-z]+", lab))
    best = 0.0
    for s in synonyms:
        st = set(re.findall(r"[a-z]+", s))
        if st and lt:
            best = max(best, len(lt & st) / len(lt | st))
    return round(0.5 + 0.35 * best, 2) if best >= 0.5 else 0.0


def propose(docs: list[DocInput], log=lambda *_: None) -> dict:
    lines: list[dict] = []
    not_found: list[str] = []
    log("list_tables", {d.file_name: len(d.parsed.tables) for d in docs})
    for code in INPUT_LINES:
        best = None
        for d in docs:
            for t in d.parsed.tables:
                for r in t.rows:
                    if not r or not isinstance(r[0], str):
                        continue
                    sc = _score(r[0], SYNONYMS[code])
                    if sc and (best is None or sc > best[0]):
                        best = (sc, d, t, r)
        if best is None:
            not_found.append(code)
            log("line_not_found", code)
            continue
        sc, d, t, r = best
        nums = [x for x in r[1:] if isinstance(x, (int, float))]
        if code in ("CASH", "TOTAL_DEBT", "INTEREST_EXPENSE_LTM"):
            periods = {"quarter": nums[-1] if nums else None}
        else:
            periods = {p: (nums[i] if len(nums) == 5 else None) for p, i in PERIOD_COLS.items()}
            if len(nums) != 5:
                periods = {"quarter": nums[-1] if nums else None}
                sc = min(sc, 0.6)
        for ptype, val in periods.items():
            if val is None:
                continue
            lines.append({"line_code": code, "period_type": ptype, "value": float(val), "confidence": sc,
                          "source_label": r[0],
                          "evidence": {"doc_id": d.doc_id, "file": d.file_name, "page": t.page_no,
                                       "table_index": t.table_index, "row": r[0], "col": ptype, "text": str(val)}})
        log("map_line", {"code": code, "label": r[0], "confidence": sc, "doc": d.file_name, "page": t.page_no})

    adjustments = []
    for d in docs:
        for page_no, text, _ in d.parsed.pages:
            flat = " ".join(text.split())
            for adj_type, pat in ADDBACK_PATTERNS:
                for m in pat.finditer(flat):
                    start = max(0, flat.rfind("Note", 0, m.start()))
                    quote = flat[start:m.end() + 60].split(". ")[0:2]
                    adjustments.append({"adj_type": adj_type, "amount": float(m.group(1)),
                                        "description": ". ".join(quote).strip(),
                                        "evidence": {"doc_id": d.doc_id, "file": d.file_name, "page": page_no,
                                                     "text": flat[start:m.end()][:300]}})
                    log("addback_found", {"type": adj_type, "amount": float(m.group(1)), "page": page_no})
    scanned_pages = sum(1 for d in docs for _, _, has in d.parsed.pages if not has)
    if scanned_pages:
        log("scanned_pages", scanned_pages)
    # self-check: revenue - cogs - opex = reported EBITDA for the quarter
    q = {l["line_code"]: l["value"] for l in lines if l["period_type"] == "quarter"}
    check = None
    if all(k in q for k in ("REVENUE", "COGS", "OPEX", "REPORTED_EBITDA")):
        diff = round(q["REVENUE"] - q["COGS"] - q["OPEX"] - q["REPORTED_EBITDA"], 2)
        check = {"identity": "REVENUE - COGS - OPEX = REPORTED_EBITDA", "difference": diff, "ok": abs(diff) <= 0.15}
        log("self_check", check)
        if not check["ok"]:
            for l in lines:
                if l["line_code"] in ("COGS", "OPEX"):
                    l["confidence"] = min(l["confidence"], 0.65)
    return {"lines": lines, "adjustments": adjustments, "not_found": not_found, "self_check": check,
            "scanned_pages": scanned_pages}
