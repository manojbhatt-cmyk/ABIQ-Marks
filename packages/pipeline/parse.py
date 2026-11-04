"""Document parsing: page text and tables from PDF and XLSX (Ingestion Integration Spec section 3).

The spec names Docling as the parser. Docling needs a PyTorch runtime, which is not
installed in this POC environment, so this module implements the same output
contract (pages with text, tables with header and rows, page-level evidence) on
pypdf and openpyxl. A Docling backend can replace `parse_pdf` without changes above
it. Pages without a text layer (scanned) are recorded as such; their content is not
read (no OCR), which drives the low-confidence and "not found" path in A1.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field

NUM = r"\(?-?[\d,]+\.\d+\)?|\(?-?[\d,]+\)?"
ROW_RE = re.compile(rf"^(?P<label>[A-Za-z][A-Za-z0-9 ,&/()'\-\.%]*?)\s+(?P<nums>(?:(?:{NUM})\s*)+)$")


@dataclass
class ParsedTable:
    page_no: int
    table_index: int
    caption: str
    header: list[str]
    rows: list[list]


@dataclass
class ParsedDoc:
    pages: list[tuple[int, str, bool]] = field(default_factory=list)  # (page_no, text, has_text_layer)
    tables: list[ParsedTable] = field(default_factory=list)


def to_number(token: str) -> float | None:
    t = token.strip().replace(",", "")
    neg = t.startswith("(") and t.endswith(")")
    t = t.strip("()")
    try:
        v = float(t)
    except ValueError:
        return None
    return -v if neg else v


def parse_pdf(data: bytes) -> ParsedDoc:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    doc = ParsedDoc()
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        has_text = len(text.strip()) > 20
        doc.pages.append((i, text, has_text))
        if has_text:
            doc.tables.extend(_tables_from_text(i, text, len(doc.tables)))
    return doc


PURE_NUM = re.compile(rf"^(?:{NUM})$")


def _tables_from_text(page_no: int, text: str, start_index: int) -> list[ParsedTable]:
    """Rebuild table rows from extracted text.

    Handles both layouts text extractors produce: a whole row on one line
    ("Total revenue 48.0 45.5 ...") and one cell per line (label line followed by
    number lines). A text line that is not followed by numbers closes the table and
    becomes the caption of the next one.
    """
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    tables: list[ParsedTable] = []
    current: list[list] = []
    caption = ""
    i = 0
    while i < len(lines):
        line = lines[i]
        nums_after = []
        j = i + 1
        while j < len(lines) and PURE_NUM.match(lines[j]):
            nums_after.append(to_number(lines[j]))
            j += 1
        m = ROW_RE.match(line)
        if not PURE_NUM.match(line) and nums_after and not re.match(r"^(Note|Page)", line):
            current.append([line, *nums_after])
            i = j
            continue
        if m and not re.match(r"^(Note|Page|Q\d)", line):
            current.append([m.group("label").strip(), *[to_number(t) for t in re.findall(NUM, m.group("nums"))]])
            i += 1
            continue
        if current:
            tables.append(ParsedTable(page_no, start_index + len(tables), caption, [], current))
            current = []
        if not PURE_NUM.match(line):
            caption = line
        i = max(i + 1, j if nums_after and PURE_NUM.match(line) else i + 1)
    if current:
        tables.append(ParsedTable(page_no, start_index + len(tables), caption, [], current))
    return tables


def parse_xlsx(data: bytes) -> ParsedDoc:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(data), data_only=True)
    doc = ParsedDoc()
    for i, ws in enumerate(wb.worksheets, start=1):
        rows = [[c for c in r] for r in ws.iter_rows(values_only=True) if any(c is not None for c in r)]
        text = "\n".join(" | ".join("" if c is None else str(c) for c in r) for r in rows)
        doc.pages.append((i, f"[{ws.title}]\n{text}", True))
        header = [str(c) for c in rows[0]] if rows else []
        body = [r for r in rows[1:] if r and isinstance(r[0], str)]
        if body:
            doc.tables.append(ParsedTable(i, len(doc.tables), ws.title, header, [list(r) for r in body]))
    return doc


def parse(file_name: str, data: bytes) -> ParsedDoc:
    name = file_name.lower()
    if name.endswith(".pdf"):
        return parse_pdf(data)
    if name.endswith(".xlsx"):
        return parse_xlsx(data)
    return ParsedDoc(pages=[(1, data.decode("utf-8", "ignore"), True)])
