"""A0 Document Classifier (Agentic AI Spec section 6.1): one call, structured output.

Deterministic engine: weighted keyword evidence over the file name and the first
pages. Above `classify.confidence_threshold` the type is applied automatically
(reversible, logged); below it a person confirms in S04.
"""
from __future__ import annotations

import re

DOC_TYPES = ["financial_statements", "covenant_certificate", "supporting", "sponsor_letter", "waiver_request",
             "lincoln_report", "lincoln_marks", "other"]

SIGNALS = {
    "financial_statements": [("statement of operations", 3), ("financial statements", 3), ("balance sheet", 2),
                             ("income statement", 3), ("management accounts", 3), ("revenue", 1), ("ebitda", 1),
                             ("net sales", 1), ("reporting pack", 2), ("financials", 2)],
    "covenant_certificate": [("compliance certificate", 4), ("covenant", 2), ("leverage ratio", 2),
                             ("in compliance", 2), ("cert", 1)],
    "sponsor_letter": [("sponsor", 2), ("equity", 1), ("commit", 1), ("continued support", 2), ("capital", 1)],
    "waiver_request": [("waiver", 4), ("request for waiver", 3)],
    "lincoln_report": [("schedule 1", 2), ("valuation summary", 3), ("prepared for: ab-pci", 3)],
    "lincoln_marks": [("point estimate", 3), ("range low", 2), ("required yield", 2)],
}


def classify(file_name: str, text: str) -> tuple[str, float, list[str]]:
    hay = f"{file_name}\n{text[:4000]}".lower()
    scores: dict[str, float] = {}
    hits: dict[str, list[str]] = {}
    for dtype, signals in SIGNALS.items():
        for kw, w in signals:
            if kw in hay:
                scores[dtype] = scores.get(dtype, 0) + w
                hits.setdefault(dtype, []).append(kw)
    if not scores:
        return "other", 0.4, []
    best = max(scores, key=lambda k: scores[k])
    total = sum(scores.values())
    conf = min(0.99, 0.45 + 0.55 * scores[best] / total) if total else 0.4
    if len(text.strip()) < 40:  # scanned or empty text: lower confidence
        conf = min(conf, 0.72)
    return best, round(conf, 2), hits.get(best, [])


def detect_period(text: str) -> str | None:
    t = text.lower()
    if re.search(r"30 september 2026|q3 2026|sep(tember)? 2026", t):
        return "2026-Q3"
    if re.search(r"30 june 2026|q2 2026", t):
        return "2026-Q2"
    return None
