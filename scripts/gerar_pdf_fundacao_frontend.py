from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "sigat-arquitetura-fundacao-frontend.pdf"

NIGHT = colors.HexColor("#090F1A")
SURFACE = colors.HexColor("#111C2C")
BLUE = colors.HexColor("#2B7FFF")
GREEN = colors.HexColor("#27C18B")
YELLOW = colors.HexColor("#F2C94C")
RED = colors.HexColor("#E46550")
INK = colors.HexColor("#162132")
MUTED = colors.HexColor("#596779")
LIGHT = colors.HexColor("#F3F6FA")
PALE_BLUE = colors.HexColor("#EAF2FF")
PALE_GREEN = colors.HexColor("#E8F8F2")
BORDER = colors.HexColor("#D7DFEA")
WHITE = colors.white


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    "Kicker", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=8, leading=10, textColor=BLUE, spaceAfter=4,
))
styles.add(ParagraphStyle(
    "PageTitle", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=22, leading=25, textColor=NIGHT, spaceAfter=10,
))
styles.add(ParagraphStyle(
    "H2Tech", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=13, leading=16, textColor=SURFACE, spaceBefore=7,
    spaceAfter=5, keepWithNext=True,
))
styles.add(ParagraphStyle(
    "H3Tech", parent=styles["Heading3"], fontName="Helvetica-Bold",
    fontSize=10, leading=13, textColor=BLUE, spaceBefore=5,
    spaceAfter=3, keepWithNext=True,
))
styles.add(ParagraphStyle(
    "BodyTech", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.1, leading=13.1, textColor=INK, spaceAfter=5,
))
styles.add(ParagraphStyle(
    "BodySmall", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.8, leading=10.5, textColor=INK,
))
styles.add(ParagraphStyle(
    "Caption", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.2, leading=9.5, textColor=MUTED, spaceAfter=4,
))
styles.add(ParagraphStyle(
    "BulletTech", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.8, leading=12.3, textColor=INK, leftIndent=11,
    firstLineIndent=-7, spaceAfter=3,
))
styles.add(ParagraphStyle(
    "NumberTech", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.8, leading=12.3, textColor=INK, leftIndent=14,
    firstLineIndent=-11, spaceAfter=4,
))
styles.add(ParagraphStyle(
    "Callout", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.7, leading=12.6, textColor=INK,
))
styles.add(ParagraphStyle(
    "CalloutStrong", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=9.1, leading=12.8, textColor=NIGHT,
))
styles.add(ParagraphStyle(
    "TableHeader", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=7.6, leading=9.7, textColor=WHITE,
))
styles.add(ParagraphStyle(
    "TableCell", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.5, leading=10, textColor=INK,
))
styles.add(ParagraphStyle(
    "TableCellBold", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=7.5, leading=10, textColor=INK,
))
styles.add(ParagraphStyle(
    "CodeTree", parent=styles["Code"], fontName="Courier",
    fontSize=7.4, leading=10.2, textColor=INK,
))
styles.add(ParagraphStyle(
    "CoverKicker", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=9, leading=12, textColor=BLUE, spaceAfter=7,
))
styles.add(ParagraphStyle(
    "CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=31, leading=34, textColor=NIGHT, alignment=TA_LEFT,
    spaceAfter=12,
))
styles.add(ParagraphStyle(
    "CoverSub", parent=styles["Normal"], fontName="Helvetica",
    fontSize=12, leading=17, textColor=MUTED,
))
styles.add(ParagraphStyle(
    "BigNumber", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=18.5, leading=21, textColor=NIGHT, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    "BigLabel", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=7.3, leading=9, textColor=MUTED, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    "PaletteLight", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=7.3, leading=9, textColor=WHITE, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    "PaletteLightCode", parent=styles["Normal"], fontName="Helvetica",
    fontSize=7.3, leading=9, textColor=WHITE, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    "PaletteDark", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=7.3, leading=9, textColor=NIGHT, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    "PaletteDarkCode", parent=styles["Normal"], fontName="Helvetica",
    fontSize=7.3, leading=9, textColor=NIGHT, alignment=TA_CENTER,
))


def P(text, style="BodyTech"):
    return Paragraph(text, styles[style])


def bullet(text):
    return P("• " + text, "BulletTech")


def numbered(number, text):
    return P(f"{number}. {text}", "NumberTech")


def section_header(kicker, title, subtitle=None):
    items = [P(kicker.upper(), "Kicker"), P(title, "PageTitle")]
    if subtitle:
        items.append(P(subtitle, "BodyTech"))
        items.append(Spacer(1, 2 * mm))
    return items


def callout(title, body, tone="blue"):
    palettes = {
        "blue": (PALE_BLUE, BLUE),
        "green": (PALE_GREEN, GREEN),
        "yellow": (colors.HexColor("#FFF7D8"), YELLOW),
        "red": (colors.HexColor("#FDECE8"), RED),
        "neutral": (LIGHT, BORDER),
    }
    background, accent = palettes[tone]
    content = P(f"<b>{title}</b><br/>{body}", "Callout")
    table = Table([[content]], colWidths=[166 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("LINEBEFORE", (0, 0), (0, -1), 3.2, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def data_table(headers, rows, widths, header_color=SURFACE):
    data = [[P(h, "TableHeader") for h in headers]]
    for row in rows:
        data.append([
            P(str(cell), "TableCellBold" if index == 0 else "TableCell")
            for index, cell in enumerate(row)
        ])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header_color),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def metric_cards(items):
    cells = []
    for number, label, color in items:
        content = [P(str(number), "BigNumber"), P(label.upper(), "BigLabel")]
        cell = Table([[content]], colWidths=[36 * mm])
        cell.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), WHITE),
            ("LINEABOVE", (0, 0), (-1, 0), 3, color),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 2),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        cells.append(cell)
    outer = Table([cells], colWidths=[41.5 * mm] * len(cells))
    outer.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return outer


class ArchitectureDiagram(Flowable):
    def __init__(self, width=166 * mm, height=58 * mm):
        super().__init__()
        self.width = width
        self.height = height

    def draw_box(self, canvas, x, y, w, h, title, subtitle, fill, stroke=BLUE):
        canvas.setFillColor(fill)
        canvas.setStrokeColor(stroke)
        canvas.setLineWidth(0.8)
        canvas.roundRect(x, y, w, h, 4, fill=1, stroke=1)
        canvas.setFillColor(NIGHT)
        canvas.setFont("Helvetica-Bold", 8.5)
        canvas.drawCentredString(x + w / 2, y + h - 13, title)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 6.7)
        canvas.drawCentredString(x + w / 2, y + 8, subtitle)

    def arrow(self, canvas, x1, y, x2):
        canvas.setStrokeColor(BLUE)
        canvas.setFillColor(BLUE)
        canvas.setLineWidth(1.2)
        canvas.line(x1, y, x2, y)
        canvas.line(x2, y, x2 - 5, y + 3)
        canvas.line(x2, y, x2 - 5, y - 3)

    def draw(self):
        c = self.canv
        c.setFillColor(LIGHT)
        c.roundRect(0, 0, self.width, self.height, 6, fill=1, stroke=0)
        box_w = 31 * mm
        box_h = 21 * mm
        y = 22 * mm
        xs = [6 * mm, 48 * mm, 90 * mm, 132 * mm]
        self.draw_box(c, xs[0], y, box_w, box_h, "Navegador", "Desktop, tablet, celular", WHITE)
        self.draw_box(c, xs[1], y, box_w, box_h, "Nginx", "HTTPS, estáticos, /api", PALE_BLUE)
        self.draw_box(c, xs[2], y, box_w, box_h, "API Node.js", "Regras e autorização", PALE_GREEN, GREEN)
        self.draw_box(c, xs[3], y, 28 * mm, box_h, "MongoDB", "Dados e auditoria", colors.HexColor("#FFF7D8"), YELLOW)
        self.arrow(c, xs[0] + box_w, y + box_h / 2, xs[1] - 3)
        self.arrow(c, xs[1] + box_w, y + box_h / 2, xs[2] - 3)
        self.arrow(c, xs[2] + box_w, y + box_h / 2, xs[3] - 3)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 6.5)
        c.drawString(7 * mm, 9 * mm, "Frontend React compilado: arquivos estáticos servidos pelo Nginx")
        c.drawRightString(self.width - 7 * mm, 9 * mm, "API versionada: /api/v1")


def page_chrome(canvas, doc):
    canvas.saveState()
    width, height = A4
    if doc.page == 1:
        canvas.restoreState()
        return
    canvas.setFillColor(NIGHT)
    canvas.rect(0, height - 7 * mm, width, 7 * mm, fill=1, stroke=0)
    canvas.setFillColor(BLUE)
    canvas.rect(0, height - 7 * mm, 38 * mm, 1.2 * mm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(18 * mm, 10 * mm, "SIGAT - Arquitetura e Fundação Técnica do Frontend")
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"Versão 1.0  |  {doc.page:02d}")
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.restoreState()


def cover_background(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(NIGHT)
    canvas.rect(0, 0, 12 * mm, height, fill=1, stroke=0)
    canvas.setFillColor(BLUE)
    canvas.rect(12 * mm, height - 11 * mm, width - 12 * mm, 11 * mm, fill=1, stroke=0)
    canvas.setFillColor(GREEN)
    canvas.rect(width - 22 * mm, 0, 22 * mm, 4 * mm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7)
    canvas.drawRightString(width - 18 * mm, 10 * mm, "22 de agosto de 2026")
    canvas.restoreState()


def build_story():
    story = []

    # 1 - Capa
    story.extend([
        Spacer(1, 31 * mm),
        P("SIGAT  /  PMPA  /  DOCUMENTO TÉCNICO", "CoverKicker"),
        P("Arquitetura e<br/>Fundação Técnica<br/>do Frontend", "CoverTitle"),
        P("Decisões aprovadas para a primeira implementação do Sistema Integrado de Gestão de Ativos e Tecnologia", "CoverSub"),
        Spacer(1, 19 * mm),
        data_table(
            ["CONTROLE", "INFORMAÇÃO"],
            [
                ["Produto", "SIGAT - Polícia Militar do Pará"],
                ["Versão", "1.0"],
                ["Status", "Arquitetura conceitual aprovada"],
                ["Público", "Product Owner, chefia, arquitetura e desenvolvimento"],
                ["Escopo", "Frontend, integração, implantação e qualidade"],
                ["Referência visual", "PROMETHEUS - Operação Noturna"],
            ],
            [38 * mm, 128 * mm],
            header_color=NIGHT,
        ),
        Spacer(1, 14 * mm),
        callout(
            "Objetivo do documento",
            "Registrar por que cada tecnologia foi escolhida, como os componentes se relacionam e quais limites devem orientar a implementação.",
            "green",
        ),
        NextPageTemplate("main"),
        PageBreak(),
    ])

    # 2 - Resumo executivo
    story.extend(section_header(
        "01 / Visão executiva",
        "Decisão em uma página",
        "O SIGAT será uma aplicação web institucional, orientada a dados, executada inicialmente na infraestrutura Debian da PMPA.",
    ))
    story.append(metric_cards([
        ("React", "interface", BLUE),
        ("Vite", "compilação", GREEN),
        ("Node.js", "API", YELLOW),
        ("MongoDB", "dados", RED),
    ]))
    story.extend([
        Spacer(1, 5 * mm),
        P("Decisão principal", "H2Tech"),
        callout(
            "Arquitetura aprovada",
            "React + TypeScript + Vite em uma Single Page Application separada da API Node.js. O Nginx servirá o frontend e encaminhará /api para o backend.",
            "blue",
        ),
        Spacer(1, 4 * mm),
        P("Por que esta solução", "H2Tech"),
        bullet("Combina implantação simples no Debian com uma interface rica para tabelas, filtros, modais e fluxos administrativos."),
        bullet("Mantém frontend e backend independentes, reduzindo impacto de mudanças e facilitando testes."),
        bullet("Não depende de renderização no servidor, pois o SIGAT é autenticado e não precisa de indexação por mecanismos de busca."),
        bullet("Permite futura exposição externa sem reconstruir o frontend; domínio, HTTPS e controles de borda serão adicionados na infraestrutura."),
        P("O que não está sendo adotado agora", "H2Tech"),
        data_table(
            ["ITEM", "MOTIVO"],
            [
                ["Next.js e SSR", "Complexidade operacional sem benefício relevante para um sistema autenticado."],
                ["Docker", "A PMPA prefere instalar Node.js, MongoDB e Nginx diretamente no Debian."],
                ["Modo offline", "A primeira versão exigirá conexão ativa com o servidor."],
                ["Redux ou Zustand", "O estado previsto pode ser resolvido com URL, TanStack Query e estado local."],
            ],
            [43 * mm, 123 * mm],
        ),
        PageBreak(),
    ])

    # 3 - Contexto
    story.extend(section_header(
        "02 / Contexto e restrições",
        "O ambiente que orienta a arquitetura",
        "A escolha tecnológica responde à infraestrutura real da PMPA e à evolução prevista do produto.",
    ))
    story.extend([
        P("Infraestrutura confirmada", "H2Tech"),
        data_table(
            ["ASPECTO", "DECISÃO OU CONDIÇÃO"],
            [
                ["Servidor", "Linux Debian, mantido na própria PMPA."],
                ["Acesso inicial", "Rede institucional, utilizando o IP cedido ao servidor."],
                ["Acesso futuro", "Também pela internet, após reforço da camada de segurança."],
                ["Instalação", "Nginx, Node.js e MongoDB diretamente no sistema operacional."],
                ["Conectividade", "Conexão permanente; não haverá sincronização offline."],
                ["Certificado", "Ainda inexistente; HTTPS é requisito antes do uso real."],
                ["Banco", "MongoDB confirmado pelo Product Owner."],
            ],
            [43 * mm, 123 * mm],
        ),
        Spacer(1, 5 * mm),
        P("Atributos de qualidade prioritários", "H2Tech"),
        data_table(
            ["ATRIBUTO", "COMO SERÁ TRATADO"],
            [
                ["Segurança", "Sessão protegida, autorização no servidor, auditoria e HTTPS obrigatório."],
                ["Manutenibilidade", "Módulos por funcionalidade, contratos claros e arquivos focados."],
                ["Desempenho", "Ativos estáticos no Nginx, cache de consultas e divisão por rotas."],
                ["Rastreabilidade", "Operações relevantes registradas e vinculadas ao usuário e à Unidade."],
                ["Acessibilidade", "Contraste, teclado, foco visível, texto para estados e movimento reduzido."],
                ["Responsividade", "Desktop prioritário, com adaptação para tablet e celular."],
            ],
            [43 * mm, 123 * mm],
        ),
        Spacer(1, 5 * mm),
        callout(
            "Limite importante",
            "O frontend nunca determinará sozinho o escopo de uma Unidade. A API obterá o perfil e a Unidade da sessão autenticada e reaplicará as permissões em todas as operações.",
            "yellow",
        ),
        PageBreak(),
    ])

    # 4 - Alternativas
    story.extend(section_header(
        "03 / Registro de decisão",
        "Alternativas avaliadas",
        "A recomendação foi escolhida por adequação ao SIGAT, não por preferência isolada por uma ferramenta.",
    ))
    story.extend([
        data_table(
            ["ALTERNATIVA", "PONTOS FAVORÁVEIS", "LIMITAÇÕES NO SIGAT", "DECISÃO"],
            [
                ["React + Vite SPA", "Implantação estática, ecossistema maduro, ótima interatividade.", "Exige definir roteamento e dados explicitamente.", "Aprovada"],
                ["React Router Framework Mode", "Convenções fortes, rotas tipadas, opção de SSR.", "Acrescenta camada de servidor e sobreposição com a API.", "Adiada"],
                ["Next.js", "Framework completo, SSR e Server Components.", "Mais processos, convenções e complexidade sem necessidade de SEO.", "Não adotada"],
            ],
            [36 * mm, 44 * mm, 54 * mm, 32 * mm],
        ),
        Spacer(1, 6 * mm),
        P("Consequências da escolha", "H2Tech"),
        bullet("O Nginx entrega o frontend como arquivos estáticos e encaminha chamadas de API."),
        bullet("O backend continua sendo a fonte de verdade para regras, permissões, dados e auditoria."),
        bullet("O frontend pode ser atualizado independentemente, desde que preserve o contrato versionado da API."),
        bullet("A aplicação não terá custo de renderização do React no servidor."),
        bullet("A equipe deverá manter disciplina de módulos, testes e contratos porque o Vite não impõe uma arquitetura completa."),
        P("Reversibilidade", "H2Tech"),
        P("Se no futuro surgir uma necessidade comprovada de renderização no servidor, o uso de React e rotas isoladas permite migrar por etapas. Essa possibilidade não justifica introduzir a complexidade agora."),
        Spacer(1, 4 * mm),
        callout(
            "Critério de revisão",
            "Esta decisão deverá ser reavaliada somente se surgirem páginas públicas indexáveis, requisitos severos de primeira renderização ou necessidade real de código executado no servidor pelo frontend.",
            "neutral",
        ),
        Spacer(1, 5 * mm),
        P("Decisões do Product Owner", "H2Tech"),
        data_table(
            ["DECISÃO", "ESTADO"],
            [
                ["React + Vite em SPA", "Aprovada"],
                ["MongoDB", "Aprovada"],
                ["Instalação direta no Debian", "Aprovada"],
                ["Sem modo offline", "Aprovada"],
                ["Operação Noturna como base visual", "Aprovada com possibilidade de refinamento"],
            ],
            [105 * mm, 61 * mm],
        ),
        PageBreak(),
    ])

    # 5 - Linguagens
    story.extend(section_header(
        "04 / Linguagens e fundamentos",
        "O que será usado e por quê",
        "A stack privilegia tipagem, padrões web, implantação simples e manutenção de longo prazo.",
    ))
    story.extend([
        data_table(
            ["TECNOLOGIA", "PAPEL", "JUSTIFICATIVA"],
            [
                ["TypeScript", "Linguagem principal do frontend e backend.", "Detecta incompatibilidades cedo e compartilha conceitos entre interface e API."],
                ["TSX + React", "Composição das telas e componentes.", "Modela interfaces complexas como unidades reutilizáveis e testáveis."],
                ["HTML semântico", "Estrutura acessível da interface.", "Melhora navegação por teclado, leitores de tela e manutenção."],
                ["CSS + Tailwind", "Layout, responsividade e aparência.", "Combina tokens próprios com produtividade, sem impor tema genérico."],
                ["Node.js", "Execução da API no Debian.", "Mantém TypeScript em toda a aplicação e possui ecossistema maduro para HTTP e MongoDB."],
                ["JSON sobre HTTP", "Comunicação entre frontend e API.", "Formato simples, interoperável e adequado ao contrato OpenAPI."],
                ["MongoDB", "Persistência de dados.", "Decisão aprovada para inventário, chamados, histórico e auditoria."],
                ["Nginx", "Entrada da aplicação.", "Serve estáticos, aplica HTTPS e encaminha /api para o Node.js."],
            ],
            [31 * mm, 48 * mm, 87 * mm],
        ),
        Spacer(1, 6 * mm),
        P("Política de versões", "H2Tech"),
        bullet("Usar versões estáveis e suportadas no momento da implementação."),
        bullet("Fixar dependências no arquivo de lock e atualizar de forma controlada."),
        bullet("Adotar uma versão LTS do Node.js compatível com Vite, API e ferramentas de teste."),
        bullet("Evitar recursos experimentais na fundação do sistema."),
        Spacer(1, 4 * mm),
        callout(
            "Dependências externas",
            "Fontes, ícones e ativos essenciais serão hospedados junto ao sistema. O funcionamento da interface não dependerá de Google Fonts ou de serviços externos.",
            "green",
        ),
        Spacer(1, 5 * mm),
        P("Referências primárias consultadas", "H2Tech"),
        P("React: react.dev/learn/creating-a-react-app<br/>Vite: vite.dev/guide/<br/>React Router: reactrouter.com/start/modes<br/>TanStack Query: tanstack.com/query/latest/docs/framework/react/overview", "Caption"),
        PageBreak(),
    ])

    # 6 - Bibliotecas
    story.extend(section_header(
        "05 / Bibliotecas do frontend",
        "Uma responsabilidade por ferramenta",
        "A fundação evita bibliotecas sobrepostas e mantém a aparência sob controle do SIGAT.",
    ))
    story.extend([
        data_table(
            ["BIBLIOTECA", "RESPONSABILIDADE", "REGRA DE USO"],
            [
                ["React", "Componentes e composição da interface.", "Componentes pequenos, acessíveis e orientados a uma tarefa."],
                ["Vite", "Servidor de desenvolvimento e build.", "Gera arquivos estáticos otimizados para o Nginx."],
                ["React Router - Data Mode", "Rotas, carregamento por página e proteção visual.", "URLs representam filtros, paginação e contexto navegável."],
                ["TanStack Query", "Dados do servidor, cache e mutações.", "Não armazenar dados remotos em estado global manual."],
                ["TanStack Table", "Tabelas densas e controladas.", "Ordenação, paginação e filtros integrados à URL e API."],
                ["React Hook Form", "Estado e desempenho de formulários.", "Formulários divididos por etapas ou abas quando necessário."],
                ["Zod", "Validação e contratos em tempo de execução.", "Mensagens claras; servidor sempre revalida."],
                ["Radix Primitives", "Modais, abas, menus e foco.", "Somente comportamento e acessibilidade; aparência própria."],
                ["Tailwind CSS", "Utilidades e tokens visuais.", "Sem cores arbitrárias espalhadas; usar variáveis semânticas."],
            ],
            [35 * mm, 59 * mm, 72 * mm],
        ),
        Spacer(1, 6 * mm),
        P("Estado da aplicação", "H2Tech"),
        data_table(
            ["TIPO DE ESTADO", "FONTE DE VERDADE"],
            [
                ["Filtros, busca, paginação", "URL"],
                ["Equipamentos, chamados, usuários", "API + TanStack Query"],
                ["Modal aberta, aba selecionada", "Estado local do React"],
                ["Sessão e perfil", "Endpoint de sessão + cookie seguro"],
                ["Formulário em edição", "React Hook Form"],
            ],
            [67 * mm, 99 * mm],
        ),
        Spacer(1, 5 * mm),
        callout(
            "Decisão de simplicidade",
            "Redux ou Zustand somente serão adicionados se surgir um estado global complexo que não possa ser representado pela URL, pela API ou por componentes locais.",
            "yellow",
        ),
        PageBreak(),
    ])

    # 7 - Arquitetura de implantação
    story.extend(section_header(
        "06 / Arquitetura de execução",
        "Como o sistema funcionará no Debian",
        "A separação entre entrega visual, regras e dados reduz acoplamento e facilita operação.",
    ))
    story.extend([
        ArchitectureDiagram(),
        Spacer(1, 6 * mm),
        P("Caminho de uma requisição", "H2Tech"),
        numbered(1, "O navegador solicita a aplicação ao endereço institucional."),
        numbered(2, "O Nginx entrega HTML, CSS, JavaScript, fontes e ícones do frontend compilado."),
        numbered(3, "Chamadas iniciadas pela interface usam o prefixo versionado /api/v1."),
        numbered(4, "O Nginx encaminha essas chamadas para o serviço Node.js local."),
        numbered(5, "A API autentica, autoriza, valida e consulta o MongoDB."),
        numbered(6, "A resposta retorna em JSON; o TanStack Query atualiza a interface e o cache."),
        Spacer(1, 4 * mm),
        P("Processos no servidor", "H2Tech"),
        data_table(
            ["COMPONENTE", "EXECUÇÃO", "RESPONSABILIDADE OPERACIONAL"],
            [
                ["Nginx", "Serviço do Debian", "HTTPS, cabeçalhos, compressão, estáticos e proxy reverso."],
                ["API Node.js", "Serviço systemd dedicado", "Reinício automático, logs e variáveis protegidas."],
                ["MongoDB", "Serviço local restrito", "Persistência, índices, backup e acesso apenas necessário."],
                ["Frontend", "Arquivos versionados", "Publicação atômica com possibilidade de reversão."],
            ],
            [39 * mm, 48 * mm, 79 * mm],
        ),
        Spacer(1, 5 * mm),
        callout(
            "Antes da entrada em produção",
            "Associar um domínio ao IP e configurar certificado HTTPS. Credenciais, cookies de sessão e anexos não devem trafegar por HTTP.",
            "red",
        ),
        PageBreak(),
    ])

    # 8 - Organização interna
    story.extend(section_header(
        "07 / Estrutura interna",
        "Módulos com limites claros",
        "A estrutura por funcionalidade mantém Inventário, Chamados e Administração independentes e compreensíveis.",
    ))
    tree = """frontend/src/
|-- app/                 inicialização, rotas, providers e layouts
|-- features/
|   |-- auth/            login, recuperação e sessão
|   |-- dashboard/       indicadores por escopo
|   |-- inventory/       equipamentos e detalhes
|   |-- tickets/         abertura, acompanhamento e triagem
|   |-- movements/       solicitações e aprovações
|   |-- reports/         filtros, prévia e exportação
|   `-- administration/  usuários, unidades e auditoria
|-- shared/
|   |-- api/             cliente HTTP e contratos
|   |-- auth/            perfil, escopo e permissões visuais
|   |-- ui/              componentes do design system
|   |-- validation/      esquemas compartilhados
|   |-- styles/          tokens, temas e fontes locais
|   `-- lib/             utilidades sem regra de negócio
`-- test/                configuração e apoio aos testes"""
    tree_table = Table([[P(tree.replace("\n", "<br/>").replace(" ", "&nbsp;"), "CodeTree")]], colWidths=[166 * mm])
    tree_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([
        tree_table,
        Spacer(1, 5 * mm),
        P("Regras de dependência", "H2Tech"),
        data_table(
            ["ÁREA", "REGRA"],
            [
                ["app", "Compõe rotas, provedores e layouts, mas não concentra regras de negócio."],
                ["feature", "Possui páginas, componentes, chamadas de API, validações e testes do próprio módulo."],
                ["shared", "Pode ser usado por qualquer módulo, mas não pode importar uma feature."],
                ["ui", "Não acessa a API diretamente; recebe dados e eventos por interfaces claras."],
                ["arquivos", "Devem permanecer focados; crescimento excessivo indica necessidade de divisão."],
            ],
            [35 * mm, 131 * mm],
        ),
        Spacer(1, 4 * mm),
        callout(
            "Contrato entre equipes",
            "A especificação OpenAPI será a referência compartilhada. Tipos de requisição e resposta serão gerados ou validados a partir desse contrato para reduzir divergências.",
            "blue",
        ),
        PageBreak(),
    ])

    # 9 - Dados e permissões
    story.extend(section_header(
        "08 / Dados, sessão e permissões",
        "A interface orienta; o servidor decide",
        "O frontend melhora a experiência, mas nunca substitui as regras de segurança da API.",
    ))
    story.extend([
        P("Fluxo de autenticação", "H2Tech"),
        numbered(1, "O usuário informa matrícula e senha na tela institucional."),
        numbered(2, "A API valida credenciais, situação do usuário, perfil e Unidade vinculada."),
        numbered(3, "A sessão é criada em cookie HttpOnly, Secure e SameSite após a adoção de HTTPS."),
        numbered(4, "O frontend consulta o contexto da sessão e monta a navegação permitida."),
        numbered(5, "Cada operação é novamente autorizada pelo servidor."),
        numbered(6, "Ao sair, a sessão é invalidada e dados sensíveis deixam a interface."),
        P("Dois perfis iniciais", "H2Tech"),
        data_table(
            ["PERFIL", "ESCOPO", "EXPERIÊNCIA"],
            [
                ["Administrador DITEL", "Todas as Unidades e equipamentos autorizados.", "Filtros estaduais, ações administrativas e auditoria."],
                ["Usuário da Unidade", "Somente a Unidade vinculada à sessão.", "Dados locais, abertura de chamados e operações permitidas."],
            ],
            [39 * mm, 58 * mm, 69 * mm],
        ),
        Spacer(1, 5 * mm),
        P("Regras que não podem depender do frontend", "H2Tech"),
        bullet("Isolamento dos dados entre Unidades."),
        bullet("Definição da Unidade responsável no cadastro de equipamento."),
        bullet("Mudança de perfil, vínculo, prioridade ou situação sensível."),
        bullet("Validação de anexos, tamanho, extensão e autorização de download."),
        bullet("Auditoria e preservação de histórico."),
        Spacer(1, 4 * mm),
        callout(
            "Risco registrado",
            "A sessão permanecer ativa até o usuário selecionar Sair, conforme decisão atual. Antes da exposição externa, essa política deverá ser revista por causa de computadores compartilhados e sessões abandonadas.",
            "yellow",
        ),
        PageBreak(),
    ])

    # 10 - Design system
    story.extend(section_header(
        "09 / Sistema visual",
        "Operação Noturna como fundação",
        "O modelo aprovado será traduzido em componentes responsivos, e não reproduzido por coordenadas fixas do Canva.",
    ))
    palette = Table([
        [P("NOITE", "PaletteLight"), P("SUPERFÍCIE", "PaletteLight"), P("OPERACIONAL", "PaletteLight"), P("DISPONÍVEL", "PaletteDark"), P("ATENÇÃO", "PaletteDark"), P("CRÍTICO", "PaletteDark")],
        [P("#090F1A", "PaletteLightCode"), P("#111C2C", "PaletteLightCode"), P("#2B7FFF", "PaletteLightCode"), P("#27C18B", "PaletteDarkCode"), P("#F2C94C", "PaletteDarkCode"), P("#E46550", "PaletteDarkCode")],
    ], colWidths=[27.66 * mm] * 6)
    palette.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), NIGHT),
        ("BACKGROUND", (1, 0), (1, -1), SURFACE),
        ("BACKGROUND", (2, 0), (2, -1), BLUE),
        ("BACKGROUND", (3, 0), (3, -1), GREEN),
        ("BACKGROUND", (4, 0), (4, -1), YELLOW),
        ("BACKGROUND", (5, 0), (5, -1), RED),
        ("TEXTCOLOR", (0, 0), (3, -1), WHITE),
        ("TEXTCOLOR", (4, 0), (5, -1), NIGHT),
        ("GRID", (0, 0), (-1, -1), 0.4, WHITE),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([
        palette,
        Spacer(1, 5 * mm),
        P("Tipografia", "H2Tech"),
        data_table(
            ["FAMÍLIA", "USO"],
            [
                ["Archivo", "Títulos, comandos e hierarquia operacional."],
                ["Inter", "Textos, formulários, tabelas e leitura contínua."],
                ["JetBrains Mono", "Patrimônio, protocolo, matrícula e identificadores."],
            ],
            [45 * mm, 121 * mm],
        ),
        Spacer(1, 5 * mm),
        P("Comportamento responsivo", "H2Tech"),
        data_table(
            ["DISPOSITIVO", "NAVEGAÇÃO E CONTEÚDO"],
            [
                ["Desktop", "Módulos no topo, tabelas completas, painéis densos e modais amplas."],
                ["Tablet", "Módulos secundários em Mais, painéis reorganizados e ações preservadas."],
                ["Celular", "Menu em tela cheia, consulta rápida, cartões adaptados e modal em tela inteira."],
            ],
            [43 * mm, 123 * mm],
        ),
        Spacer(1, 5 * mm),
        P("Componentes fundamentais", "H2Tech"),
        bullet("Navegação superior, seletor de contexto e identificação permanente de Unidade e perfil."),
        bullet("Tabela com busca, filtros, ordenação, paginação e estados de carregamento."),
        bullet("Modal ampla com abas, confirmação adicional e histórico contextual."),
        bullet("Campos, seletores, badges, notificações, anexos e mensagens de recuperação."),
        Spacer(1, 3 * mm),
        callout(
            "Assinatura visual",
            "A faixa operacional superior mantém Unidade, perfil, escopo e módulo atual sempre reconhecíveis. Os detalhes estéticos continuarão refináveis durante a implementação.",
            "green",
        ),
        PageBreak(),
    ])

    # 11 - Qualidade e segurança
    story.extend(section_header(
        "10 / Qualidade, segurança e operação",
        "Critérios para uma base confiável",
        "A fundação inclui testes, acessibilidade e controles operacionais desde o início.",
    ))
    story.extend([
        P("Estratégia de testes", "H2Tech"),
        data_table(
            ["CAMADA", "FERRAMENTA", "COBERTURA"],
            [
                ["Unidade", "Vitest", "Funções, validações, permissões visuais e transformações."],
                ["Componentes", "Testing Library", "Comportamento acessível observado pelo usuário."],
                ["Integração HTTP", "MSW", "Sucesso, erro, atraso, sessão expirada e respostas inválidas."],
                ["Ponta a ponta", "Playwright", "Login, inventário, chamados e fluxos críticos."],
            ],
            [31 * mm, 42 * mm, 93 * mm],
        ),
        Spacer(1, 5 * mm),
        P("Controles de segurança", "H2Tech"),
        bullet("HTTPS, cookies HttpOnly/Secure/SameSite e proteção contra CSRF."),
        bullet("Nenhum token sensível persistido em localStorage."),
        bullet("Autorização por perfil e Unidade em todos os endpoints."),
        bullet("Validação de entrada no frontend e novamente na API."),
        bullet("Limites, tipos permitidos, nomes seguros e autorização para anexos."),
        bullet("Cabeçalhos de segurança no Nginx, incluindo política de conteúdo."),
        bullet("Limite de requisições no login e auditoria de eventos relevantes."),
        P("Acessibilidade e desempenho", "H2Tech"),
        bullet("Contraste AA, foco visível, uso completo por teclado e estados acompanhados por texto."),
        bullet("Áreas de toque adequadas e respeito à preferência de redução de movimento."),
        bullet("Divisão do código por rota, tabelas paginadas no servidor e consultas com cache controlado."),
        Spacer(1, 4 * mm),
        callout(
            "Critério de entrega",
            "Nenhum módulo será considerado pronto apenas por aparência. Build, testes, acessibilidade básica, tratamento de erros e autorização precisam ser demonstrados.",
            "blue",
        ),
        PageBreak(),
    ])

    # 12 - Próximos passos
    story.extend(section_header(
        "11 / Governança e próximos passos",
        "O que está fechado e o que ainda falta",
        "O documento registra a fundação aprovada; detalhes de domínio continuam sujeitos à validação antes de cada módulo.",
    ))
    story.extend([
        P("Decisões consolidadas", "H2Tech"),
        data_table(
            ["ITEM", "ESTADO"],
            [
                ["React + TypeScript + Vite SPA", "Aprovado"],
                ["API Node.js separada e MongoDB", "Aprovado"],
                ["Nginx e instalação direta no Debian", "Aprovado"],
                ["Estrutura por features e shared", "Aprovado"],
                ["Operação Noturna como base visual", "Aprovado com refinamento permitido"],
                ["Desktop prioritário e responsividade", "Aprovado"],
            ],
            [112 * mm, 54 * mm],
        ),
        Spacer(1, 5 * mm),
        P("Pendências antes da implementação completa", "H2Tech"),
        bullet("Matriz detalhada de permissões e ações por perfil."),
        bullet("Contrato inicial OpenAPI e padrão de erros da API."),
        bullet("Política final de sessão, especialmente antes do acesso externo."),
        bullet("Limites, formatos e armazenamento de anexos."),
        bullet("Estratégia de backup, restauração e retenção do MongoDB."),
        bullet("Domínio, certificado HTTPS e endurecimento do servidor."),
        P("Sequência recomendada", "H2Tech"),
        numbered(1, "Especificar e aprovar a fundação executável do frontend."),
        numbered(2, "Criar tokens, componentes globais e AppShell com navegação superior."),
        numbered(3, "Implementar autenticação e contexto de sessão com API simulada."),
        numbered(4, "Construir o primeiro fluxo vertical pela experiência da Unidade."),
        numbered(5, "Integrar gradualmente contratos reais da API e validar permissões."),
        Spacer(1, 4 * mm),
        callout(
            "Regra de evolução",
            "Toda alteração de tecnologia principal, segurança, escopo ou experiência deverá registrar contexto, impacto, decisão e aprovação do Product Owner.",
            "green",
        ),
        Spacer(1, 5 * mm),
        P("Documento encerrado", "H2Tech"),
        P("Versão 1.0 - 22 de agosto de 2026<br/>Fonte de verdade: decisões aprovadas no planejamento do SIGAT e documentação oficial do projeto.", "Caption"),
    ])
    return story


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=18 * mm,
        bottomMargin=19 * mm,
        title="SIGAT - Arquitetura e Fundação Técnica do Frontend",
        author="Projeto SIGAT - PMPA",
        subject="Decisões técnicas aprovadas para a fundação do frontend",
        creator="Projeto SIGAT",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=frame, onPage=cover_background),
        PageTemplate(id="main", frames=frame, onPage=page_chrome),
    ])
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    build()
