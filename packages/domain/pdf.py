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


def build(flowables: list, landscape_mode: bool = False, title: str = "", footer: str = "") -> bytes:
    buf = io.BytesIO()
    size = landscape(letter) if landscape_mode else letter

    def _footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.drawString(0.5 * inch, 0.35 * inch, clean(footer))
        canvas.drawRightString(size[0] - 0.5 * inch, 0.35 * inch, str(doc.page))
        canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=size, leftMargin=0.5 * inch, rightMargin=0.5 * inch,
                            topMargin=0.5 * inch, bottomMargin=0.6 * inch, title=clean(title))
    doc.build(flowables, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


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


__all__ = ["para", "band", "grid", "kv", "build", "image_page", "render_text_image", "PageBreak", "Spacer",
           "inch", "H1", "H2", "BODY", "SMALL", "RIGHT", "AB_TEAL", "LINCOLN_NAVY", "LINCOLN_STEEL",
           "LINCOLN_GREEN", "TIQ_NAVY", "colors", "Table", "TableStyle", "clean"]
