# invoice_pdf.py
from __future__ import annotations

from pathlib import Path
from typing import Dict, Any, List

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
)

from settings import (
    BUSINESS_NAME, BUSINESS_PHONE, BUSINESS_EMAIL, BUSINESS_ADDRESS_LINES,
    LOGO_PATH, INVOICE_OUTPUT_DIR
)


def money(x: float) -> str:
    return f"${x:,.2f}"


def _clean_lines(*lines: str) -> List[str]:
    """Remove empty/NA-ish lines."""
    out = []
    for s in lines:
        if s is None:
            continue
        s = str(s).strip()
        if not s:
            continue
        if s.lower() in {"na", "n/a", "none", "null"}:
            continue
        out.append(s)
    return out


def build_invoice_pdf(data: Dict[str, Any]) -> str:
    inv = data["invoice"]
    client = data["client"]
    items = data["items"]

    Path(INVOICE_OUTPUT_DIR).mkdir(exist_ok=True)
    filename = f"invoice_{inv['invoice_number']}.pdf"
    pdf_path = str(Path(INVOICE_OUTPUT_DIR) / filename)

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title=f"Invoice {inv['invoice_number']}"
    )

    styles = getSampleStyleSheet()
    normal = styles["BodyText"]
    normal.fontName = "Helvetica"
    normal.fontSize = 10
    normal.leading = 12

    small = ParagraphStyle(
        "small",
        parent=normal,
        fontSize=9,
        leading=11,
        textColor=colors.grey
    )

    h1 = ParagraphStyle(
        "h1",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=18,
        spaceAfter=6
    )

    h2 = ParagraphStyle(
        "h2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=13,
        spaceAfter=4
    )

    story = []

    # --- Header row: Logo + Business info + Invoice meta ---
    left_cells = []

    logo_file = Path(LOGO_PATH)
    if logo_file.exists():
        img = Image(str(logo_file), width=1.0 * inch, height=1.0 * inch)
        left_cells.append(img)
    else:
        left_cells.append(Spacer(1, 1.0 * inch))

    biz_lines = _clean_lines(
        BUSINESS_NAME,
        *BUSINESS_ADDRESS_LINES,
        BUSINESS_PHONE,
        BUSINESS_EMAIL
    )
    biz_block = "<br/>".join([f"<b>{biz_lines[0]}</b>"] + biz_lines[1:]) if biz_lines else ""
    left_cells.append(Paragraph(biz_block, normal))

    left_table = Table([[left_cells[0], left_cells[1]]], colWidths=[1.1 * inch, 3.6 * inch])
    left_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    meta_block = "<br/>".join([
        "<b>INVOICE</b>",
        f"No: {inv['invoice_number']}",
        f"Issue: {inv['issue_date']}",
        f"Due: {inv['due_date']}",
    ])
    meta_para = Paragraph(meta_block, normal)

    header = Table([[left_table, meta_para]], colWidths=[4.9 * inch, 2.0 * inch])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOX", (1, 0), (1, 0), 1, colors.black),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    story.append(header)
    story.append(Spacer(1, 0.25 * inch))

    # --- Bill To ---
    story.append(Paragraph("BILL TO", h2))

    bill_lines = _clean_lines(
        client.get("name", ""),
        client.get("address", ""),
        client.get("phone", ""),
        client.get("email", ""),
    )
    # Preserve newlines in address by converting them to <br/>
    bill_lines_html = []
    for line in bill_lines:
        bill_lines_html.append(line.replace("\n", "<br/>"))

    story.append(Paragraph("<br/>".join(bill_lines_html), normal))
    story.append(Spacer(1, 0.25 * inch))

    # --- Items table ---
    table_data = [["Description", "Qty", "Unit", "Line Total"]]
    subtotal = 0.0

    for it in items:
        qty = float(it["qty"])
        unit_price = float(it["unit_price"])
        line_total = qty * unit_price
        subtotal += line_total


        desc = str(it["description"]).replace("\n", "<br/>")
        table_data.append([
            Paragraph(desc, normal), # type: ignore
            f"{qty:g}",
            money(unit_price),
            money(line_total),
        ])

    tax_rate = float(inv["tax_rate"])
    tax = subtotal * tax_rate
    total = subtotal + tax

    items_table = Table(
        table_data,
        colWidths=[4.4 * inch, 0.7 * inch, 0.9 * inch, 1.0 * inch],
        hAlign="LEFT"
    )
    items_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
    ]))

    story.append(items_table)
    story.append(Spacer(1, 0.2 * inch))

    # --- Totals box ---
    totals_data = [
        ["Subtotal:", money(subtotal)],
        [f"Tax ({tax_rate*100:.2f}%):", money(tax)],
        ["Total:", money(total)],
    ]
    totals_table = Table(totals_data, colWidths=[1.3 * inch, 1.2 * inch], hAlign="RIGHT")
    totals_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, 0), (-1, 1), "Helvetica"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("LINEABOVE", (0, 0), (-1, 0), 1, colors.black),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 0.25 * inch))

    # --- Notes ---
    notes = (inv.get("notes") or "").strip()
    if notes:
        story.append(Paragraph("Notes", h2))
        story.append(Paragraph(notes.replace("\n", "<br/>"), normal))
        story.append(Spacer(1, 0.15 * inch))

    story.append(Paragraph("Thank you for your business!", small))

    doc.build(story)
    return pdf_path
