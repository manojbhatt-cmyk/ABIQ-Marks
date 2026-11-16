"""Small PDF toolkit on reportlab platypus, shared by the generator and the renderers.

Text PDFs keep a real text layer so the document pipeline reads them back like any
borrower or Lincoln file. No em dashes anywhere (Master Spec conventions).
"""
from __future__ import annotations

import io
from typing import Sequence

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

AB_TEAL = colors.HexColor("#95D9CE")  # client CMR section bands
LINCOLN_NAVY = colors.HexColor("#0E3B4F")  # Lincoln schedule headers
LINCOLN_STEEL = colors.HexColor("#6A9FB5")
LINCOLN_GREEN = colors.HexColor("#00A67E")
TIQ_NAVY = colors.HexColor("#183850")
ROW_GREY = colors.HexColor("#F0F0F0")

# Stone & Sage (TIQ's own documents): graphite text, warm hairlines, sage for AI and accents. No blue.
GRAPHITE = colors.HexColor("#3D3935")
INK = colors.HexColor("#2B2926")
MUTED = colors.HexColor("#625D56")
HAIRLINE = colors.HexColor("#D7D3CB")
WELL = colors.HexColor("#F2F0EC")
SAGE = colors.HexColor("#4F8062")
SAGE_TINT = colors.HexColor("#F1F6F2")

_styles = getSampleStyleSheet()
BODY = ParagraphStyle("body", parent=_styles["BodyText"], fontName="Helvetica", fontSize=9, leading=11.5)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=7.5, leading=9, textColor=colors.HexColor("#555555"))
H1 = ParagraphStyle("h1", parent=_styles["Title"], fontName="Helvetica", fontSize=20, leading=24, alignment=0)
H2 = ParagraphStyle("h2", parent=_styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15)
RIGHT = ParagraphStyle("right", parent=BODY, alignment=TA_RIGHT)


def clean(text: str) -> str:
    return (text or "").replace("—", ", ").replace("–", " to ")


def para(text: str, style=BODY) -> Paragraph:
    return Paragraph(clean(text).replace("&", "&amp;").replace("\n", "<br/>"), style)


def band(title: str, width: float, color=AB_TEAL, text_color=colors.black) -> Table:
    t = Table([[title]], colWidths=[width])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), color), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                           ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 10.5),
                           ("TEXTCOLOR", (0, 0), (-1, -1), text_color), ("BOX", (0, 0), (-1, -1), 0.6, colors.black)]))
    return t


def grid(rows: Sequence[Sequence], col_widths: Sequence[float], header_rows: int = 1, header_bg=AB_TEAL,
         header_fg=colors.black, zebra: bool = True, bold_rows: Sequence[int] = (), font_size: float = 8.5) -> Table:
    data = [[clean(str(c)) if c is not None else "" for c in r] for r in rows]
    t = Table(data, colWidths=col_widths, repeatRows=header_rows)
    style = [("FONTNAME", (0, 0), (-1, -1), "Helvetica"), ("FONTSIZE", (0, 0), (-1, -1), font_size),
             ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
             ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]
    if header_rows:
        style += [("BACKGROUND", (0, 0), (-1, header_rows - 1), header_bg),
                  ("TEXTCOLOR", (0, 0), (-1, header_rows - 1), header_fg),
                  ("FONTNAME", (0, 0), (-1, header_rows - 1), "Helvetica-Bold")]
    if zebra:
        for i in range(header_rows, len(data)):
            if (i - header_rows) % 2 == 0:
                style.append(("BACKGROUND", (0, i), (-1, i), ROW_GREY))
    for i in bold_rows:
        style.append(("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"))
    t.setStyle(TableStyle(style))
    return t


def kv(rows: Sequence[tuple[str, str]], widths=(1.8 * inch, 2.4 * inch)) -> Table:
    t = Table([[clean(a), clean(b)] for a, b in rows], colWidths=list(widths))
    style = [("FONTNAME", (0, 0), (-1, -1), "Helvetica"), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
             ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]
    for i in range(0, len(rows), 2):
        style.append(("BACKGROUND", (0, i), (-1, i), ROW_GREY))
    t.setStyle(TableStyle(style))
    return t


def build(flowables: list, landscape_mode: bool = False, title: str = "", footer: str = "",
          header: tuple[str, str] | None = None, header_color=GRAPHITE) -> bytes:
    """`header` = (left, right): a band on every page; pages are then numbered "Page n"."""
    buf = io.BytesIO()
    size = landscape(letter) if landscape_mode else letter

    def _page(canvas, doc):
        canvas.saveState()
        if header:
            top = size[1] - 0.42 * inch
            canvas.setFillColor(header_color)
            canvas.rect(0.5 * inch, top - 0.06 * inch, size[0] - inch, 0.3 * inch, stroke=0, fill=1)
            canvas.setFillColor(colors.white)
            canvas.setFont("Helvetica-Bold", 8.5)
            canvas.drawString(0.62 * inch, top + 0.04 * inch, clean(header[0]))
            canvas.setFont("Helvetica", 8)
            canvas.drawRightString(size[0] - 0.62 * inch, top + 0.04 * inch, clean(header[1]))
        canvas.setStrokeColor(HAIRLINE)
        canvas.setLineWidth(0.5)
        canvas.line(0.5 * inch, 0.48 * inch, size[0] - 0.5 * inch, 0.48 * inch)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(0.5 * inch, 0.33 * inch, clean(footer))
        canvas.drawRightString(size[0] - 0.5 * inch, 0.33 * inch, f"Page {doc.page}" if header else str(doc.page))
        canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=size, leftMargin=0.5 * inch, rightMargin=0.5 * inch,
                            topMargin=(0.85 if header else 0.5) * inch, bottomMargin=0.65 * inch, title=clean(title))
    doc.build(flowables, onFirstPage=_page, onLaterPages=_page)
    return buf.getvalue()


# ---------- bordered building blocks ----------
TITLE_BAR = ParagraphStyle("titlebar", parent=_styles["BodyText"], fontName="Helvetica-Bold", fontSize=9.5,
                           leading=12, textColor=INK)
LABEL = ParagraphStyle("label", parent=_styles["BodyText"], fontName="Helvetica", fontSize=7.5, leading=9.5,
                       textColor=MUTED)
FIGURE = ParagraphStyle("figure", parent=_styles["BodyText"], fontName="Helvetica-Bold", fontSize=13, leading=16,
                        textColor=INK)
PROSE = ParagraphStyle("prose", parent=_styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13.5,
                       textColor=INK, spaceAfter=0)


def boxed(title: str, content: list, width: float, number: str | None = None, bar=WELL, rule=HAIRLINE,
          title_color=INK) -> Table:
    """A section with a title bar and a hairline box. Each flowable is its own row, so long sections break between
    paragraphs and the title bar repeats on the next page."""
    head = f"<font color='#78726A'>{number}</font>&nbsp;&nbsp;{clean(title)}" if number else clean(title)
    rows = [[Paragraph(head, ParagraphStyle("tb", parent=TITLE_BAR, textColor=title_color))]]
    rows += [[c] for c in content] or [[para("To be updated.", PROSE)]]
    t = Table(rows, colWidths=[width], repeatRows=1)
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, rule), ("BACKGROUND", (0, 0), (-1, 0), bar),
                           ("LINEBELOW", (0, 0), (-1, 0), 0.6, rule),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, 0), 6), ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                           ("TOPPADDING", (0, 1), (-1, -1), 4), ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
                           ("TOPPADDING", (0, 1), (-1, 1), 8), ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
                           ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t


def figures(items: list[tuple[str, str, str]], width: float, per_row: int = 4) -> Table:
    """Key figures panel: label, big value, small note, in bordered cells."""
    cells = [[para(lbl, LABEL), para(val, FIGURE), para(note, LABEL)] for lbl, val, note in items]
    while len(cells) % per_row:
        cells.append("")
    rows = [cells[i:i + per_row] for i in range(0, len(cells), per_row)]
    t = Table(rows, colWidths=[width / per_row] * per_row)
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, HAIRLINE), ("INNERGRID", (0, 0), (-1, -1), 0.6, HAIRLINE),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 9),
                           ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def callout(title: str, content: list, width: float, rule=SAGE, tint=SAGE_TINT) -> Table:
    """A bordered block with a coloured rule on the left, for the recommendation or a conclusion."""
    rows = [[Paragraph(clean(title), TITLE_BAR)]] + [[c] for c in content]
    t = Table(rows, colWidths=[width])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, HAIRLINE), ("LINEBEFORE", (0, 0), (0, -1), 3, rule),
                           ("BACKGROUND", (0, 0), (-1, -1), tint), ("LEFTPADDING", (0, 0), (-1, -1), 12),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, 0), 8),
                           ("TOPPADDING", (0, 1), (-1, -1), 2), ("BOTTOMPADDING", (0, -1), (-1, -1), 9)]))
    return t


def ruled(rows: Sequence[Sequence], col_widths: Sequence[float], header_bg=WELL, header_fg=INK,
          bold_rows: Sequence[int] = (), font_size: float = 8.5) -> Table:
    """A bordered table: hairline box and inner grid, a tinted header, roomy rows, numbers right-aligned."""
    t = grid(rows, col_widths, header_bg=header_bg, header_fg=header_fg, zebra=False, bold_rows=bold_rows,
             font_size=font_size)
    return frame(t)


def frame(t: Table, rule=HAIRLINE, width: float = 0.6) -> Table:
    """Add a hairline box and inner grid to a table (third-party layouts keep their own colours)."""
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), width, rule), ("INNERGRID", (0, 0), (-1, -1), 0.4, rule),
                           ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                           ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6)]))
    return t


def image_page(png: bytes, width: float = 7.5 * inch) -> Image:
    from PIL import Image as PILImage

    im = PILImage.open(io.BytesIO(png))
    ratio = im.height / im.width
    return Image(io.BytesIO(png), width=width, height=width * ratio)


def render_text_image(lines: list[str], width: int = 1400, line_h: int = 30) -> bytes:
    """Render text as a 'scanned' page image (no text layer) for format family C."""
    from PIL import Image as PILImage, ImageDraw, ImageFont

    img = PILImage.new("RGB", (width, max(400, 80 + line_h * len(lines))), (250, 249, 245))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("DejaVuSansMono.ttf", 20)
    except OSError:
        try:
            font = ImageFont.truetype("consola.ttf", 20)
        except OSError:
            font = ImageFont.load_default()
    for i, line in enumerate(lines):
        draw.text((50, 40 + i * line_h), clean(line), fill=(30, 30, 30), font=font)
    out = io.BytesIO()
    img.rotate(0.4, fillcolor=(250, 249, 245)).save(out, format="PNG")
    return out.getvalue()


__all__ = ["para", "band", "grid", "kv", "build", "boxed", "figures", "callout", "ruled", "frame", "PROSE", "LABEL",
           "GRAPHITE", "INK", "MUTED", "HAIRLINE", "WELL", "SAGE", "SAGE_TINT", "image_page", "render_text_image", "PageBreak", "Spacer",
           "inch", "H1", "H2", "BODY", "SMALL", "RIGHT", "AB_TEAL", "LINCOLN_NAVY", "LINCOLN_STEEL",
           "LINCOLN_GREEN", "TIQ_NAVY", "colors", "Table", "TableStyle", "clean"]
