from pathlib import Path
import html
import re

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, PageBreak, Paragraph, Spacer, Table, TableStyle, Preformatted

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "backup-planejamento-frontend-sigat.md"
OUTPUT = ROOT / "output" / "pdf" / "design-experiencia-unidades-sigat.pdf"

NAVY = colors.HexColor("#173B4D")
TEAL = colors.HexColor("#2E766B")
MINT = colors.HexColor("#EAF4F1")
INK = colors.HexColor("#1D2933")
MUTED = colors.HexColor("#5E6D76")
LINE = colors.HexColor("#D8E3E1")
LIGHT = colors.HexColor("#F5F8F7")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle("CoverKicker", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=TEAL, alignment=1, spaceAfter=9))
styles.add(ParagraphStyle("CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=28, leading=32, textColor=NAVY, alignment=1, spaceAfter=10))
styles.add(ParagraphStyle("CoverSub", parent=styles["Normal"], fontName="Helvetica", fontSize=12, leading=17, textColor=MUTED, alignment=1))
styles.add(ParagraphStyle("H1x", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=NAVY, spaceBefore=14, spaceAfter=9, keepWithNext=True))
styles.add(ParagraphStyle("H2x", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=TEAL, spaceBefore=11, spaceAfter=6, keepWithNext=True))
styles.add(ParagraphStyle("H3x", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=INK, spaceBefore=8, spaceAfter=4, keepWithNext=True))
styles.add(ParagraphStyle("Bodyx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13.2, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle("Smallx", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, leading=10.5, textColor=INK))
styles.add(ParagraphStyle("TableHead", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8, leading=10.5, textColor=colors.white))
styles.add(ParagraphStyle("Bulletx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13, textColor=INK, leftIndent=12, firstLineIndent=-8, spaceAfter=3))
styles.add(ParagraphStyle("Quote", parent=styles["BodyText"], fontName="Helvetica-Oblique", fontSize=9.5, leading=14, textColor=NAVY, leftIndent=12, borderColor=TEAL, borderWidth=2, borderPadding=8, spaceBefore=12, spaceAfter=12, backColor=MINT))
styles.add(ParagraphStyle("Codex", parent=styles["Code"], fontName="Courier", fontSize=7.1, leading=9, textColor=INK, backColor=LIGHT, borderColor=LINE, borderWidth=.5, borderPadding=7, spaceBefore=5, spaceAfter=8))

def inline(text):
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"\[(.+?)\]\(#.*?\)", r"\1", text)
    return text

def footer(canvas, doc):
    canvas.saveState()
    w, _ = A4
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 14 * mm, w - 18 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9 * mm, "SIGAT · Design da Experiência da DITEL")
    canvas.drawRightString(w - 18 * mm, 9 * mm, f"{doc.page}")
    canvas.restoreState()

def metadata_table():
    data = [["Documento", "Design da Experiência da DITEL"], ["Produto", "SIGAT — PMPA"], ["Público", "Administradores DITEL"], ["Status", "Design validado em nível conceitual"], ["Data", "22 de agosto de 2026"], ["Escopo", "Frontend e experiência de uso"]]
    table = Table(data, colWidths=[34 * mm, 108 * mm], hAlign="CENTER")
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), MINT), ("TEXTCOLOR", (0, 0), (0, -1), NAVY), ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"), ("FONTNAME", (1, 0), (1, -1), "Helvetica"), ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("GRID", (0, 0), (-1, -1), .35, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return table

def parse_markdown(text):
    lines = text.splitlines(); story = []; i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line or line == "---" or line.startswith("<p") or line == "</p>": i += 1; continue
        if line.startswith("# "): i += 1; continue
        if line.startswith("## "): story.append(Paragraph(inline(line[3:]), styles["H1x"])); i += 1; continue
        if line.startswith("### "): story.append(Paragraph(inline(line[4:]), styles["H2x"])); i += 1; continue
        if line.startswith("#### "): story.append(Paragraph(inline(line[5:]), styles["H3x"])); i += 1; continue
        if line.startswith(">"):
            quote = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote.append(lines[i].strip()[1:].strip()); i += 1
            story.append(Spacer(1, 3)); story.append(Paragraph(inline(" ".join(quote)), styles["Quote"])); continue
        if line.startswith("```"):
            language = line[3:].strip(); code = []; i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"): code.append(lines[i]); i += 1
            i += 1
            if language == "mermaid":
                story.append(Paragraph("<b>Fluxo principal:</b> Login institucional  ->  Dashboard da Unidade  ->  Inventário  ->  Detalhes do equipamento  ->  Chamado e acompanhamento", styles["Quote"]))
            else:
                story.append(Preformatted("\n".join(code), styles["Codex"]))
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(set(c) <= {"-", ":", " "} for c in cells):
                    row_style = styles["TableHead"] if not rows else styles["Smallx"]
                    rows.append([Paragraph(inline(c), row_style) for c in cells])
                i += 1
            if rows:
                cols = max(len(r) for r in rows); widths = [43 * mm] + [((150 - 43) / max(cols - 1, 1)) * mm] * (cols - 1)
                table = Table(rows, colWidths=widths[:cols], repeatRows=1, hAlign="LEFT")
                table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("GRID", (0, 0), (-1, -1), .35, LINE), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
                story += [Spacer(1, 3), table, Spacer(1, 7)]
            continue
        if re.match(r"^[-*] ", line): story.append(Paragraph("• " + inline(line[2:]), styles["Bulletx"])); i += 1; continue
        if re.match(r"^\d+\. ", line): story.append(Paragraph(inline(line), styles["Bulletx"])); i += 1; continue
        paragraph = [line]; i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|>|```|\||[-*] |\d+\. )", lines[i].strip()): paragraph.append(lines[i].strip()); i += 1
        story.append(Paragraph(inline(" ".join(paragraph)), styles["Bodyx"]))
    return story

def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=17 * mm, bottomMargin=19 * mm, title="Design da Experiência das Unidades — SIGAT", author="SIGAT")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="main", frames=frame, onPage=footer)])
    story = [Spacer(1, 25 * mm), Paragraph("SIGAT · PMPA", styles["CoverKicker"]), Paragraph("Design da Experiência<br/>da DITEL", styles["CoverTitle"]), Paragraph("Documento de referência para o planejamento do frontend", styles["CoverSub"]), Spacer(1, 17 * mm), metadata_table(), Spacer(1, 16 * mm), Paragraph("Este documento consolida a experiência aprovada para administradores da DITEL, incluindo sua visão estadual, seus fluxos administrativos e sua relação operacional com as Unidades.", styles["Quote"]), PageBreak()]
    source_text = SOURCE.read_text(encoding="utf-8")
    source_text = source_text[source_text.index("## Como usar este documento"):]
    story += parse_markdown(source_text)
    doc.build(story)
    print(OUTPUT)

if __name__ == "__main__": build()
