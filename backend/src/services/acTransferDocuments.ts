import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import PDFDocument from 'pdfkit';

export const AC_TRANSFER_DOCUMENT_NOTICE = 'MODELO PROVISÓRIO - NÃO OFICIAL';
export const AC_TRANSFER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 240;
const PDF_MARGIN = 48;
const PDF_CONTENT_WIDTH = 499;
const PDF_MATERIAL_COLUMNS = [25, 65, 75, 184, 150];

export interface AcTransferDocumentInput {
  id: string;
  origin: 'AC';
  status: 'confirmed';
  destinationUnit: { id: string; name: string; acronym: string };
  distributedAt: string;
  deliverer: { name: string; registration?: string };
  receiver: { name: string; registration?: string };
  bg?: { number: string };
  materials: Array<{
    equipmentId: string;
    patrimony: string;
    description?: string;
    identification?: string;
    model?: string;
    serialNumber?: string;
    sourceCustody: { scope: 'AC'; unit: null };
    equipmentUpdatedAt: string;
    equipmentVersion: number;
  }>;
  createdAt: string;
  createdBy: string;
}

export interface AcTransferDocumentMaterial {
  number: string;
  patrimony: string;
  serialNumber: string;
  description: string;
  model: string;
}

export interface AcTransferDocumentLayout {
  header: { institution: string; office: string; title: string; notice: string };
  introduction: string;
  responsibilities: { deliverer: string; receiver: string };
  locationDate: string;
  transfer: { id: string; distributedAt: string; destination: string; acronym: string; bg: string; quantity: string };
  sections: Array<{ title: string }>;
  materials: AcTransferDocumentMaterial[];
  signatures: string[];
  footer: string;
}

export interface AcTransferDocumentModel {
  id: string;
  notice: string;
  origin: string;
  destination: string;
  destinationAcronym: string;
  distributedAt: string;
  deliverer: string;
  receiver: string;
  bg: string | null;
  materials: Array<{ patrimony: string; serialNumber: string; identification: string; description: string; model: string }>;
}

function safeText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
  return normalized || fallback;
}

function personText(person: { name: string; registration?: string }) {
  const name = safeText(person.name, 'Não informado');
  const registration = person.registration ? safeText(person.registration, '') : '';
  return registration ? `${name} — Matrícula ${registration}` : name;
}

export function buildAcTransferDocumentModel(input: AcTransferDocumentInput): AcTransferDocumentModel {
  if (input.status !== 'confirmed' || input.origin !== 'AC') throw new Error('Somente transferências AC confirmadas podem gerar documento.');
  if (input.materials.length === 0 || input.materials.length > 500) throw new Error('Quantidade de bens inválida para o documento.');
  return {
    id: safeText(input.id, 'transferência'), notice: AC_TRANSFER_DOCUMENT_NOTICE, origin: 'AC - Almoxarifado Central',
    destination: safeText(input.destinationUnit.name, 'Não informado'), destinationAcronym: safeText(input.destinationUnit.acronym, '—'),
    distributedAt: new Date(input.distributedAt).toLocaleDateString('pt-BR'), deliverer: personText(input.deliverer), receiver: personText(input.receiver),
    bg: input.bg?.number ? safeText(input.bg.number, '') : null,
    materials: input.materials.map((material) => ({
      patrimony: safeText(material.patrimony, 'Não informado'), serialNumber: safeText(material.serialNumber, 'Não informado'),
      identification: safeText(material.identification, 'Não informado'), description: safeText(material.description ?? material.identification, 'Não informado'), model: safeText(material.model, 'Não informado'),
    })),
  };
}

export function buildAcTransferDocumentLayout(model: AcTransferDocumentModel): AcTransferDocumentLayout {
  return {
    header: { institution: 'POLÍCIA MILITAR DO PARÁ', office: 'AC  |  CONTROLE E DISTRIBUIÇÃO PATRIMONIAL', title: 'TERMO DE TRANSFERÊNCIA DE CARGA PATRIMONIAL', notice: model.notice },
    introduction: 'Por meio deste termo, registra-se a distribuição e a transferência de carga dos bens patrimoniais discriminados abaixo, sob custódia da AC, para a unidade destinatária identificada. O responsável pela entrega e o responsável pelo recebimento são identificados para fins de controle administrativo e rastreabilidade.',
    responsibilities: { deliverer: model.deliverer, receiver: model.receiver }, locationDate: `AC, ${model.distributedAt}`,
    transfer: { id: model.id, distributedAt: model.distributedAt, destination: model.destination, acronym: model.destinationAcronym, bg: model.bg ?? 'Não informado', quantity: String(model.materials.length) },
    sections: ['01  IDENTIFICAÇÃO DA TRANSFERÊNCIA', '02  DECLARAÇÃO DE ENTREGA E RECEBIMENTO', '03  RELAÇÃO DOS BENS TRANSFERIDOS', '04  CIÊNCIA E ASSINATURAS'].map((title) => ({ title })),
    materials: model.materials.map((material, index) => ({ number: String(index + 1).padStart(2, '0'), patrimony: material.patrimony, serialNumber: material.serialNumber, description: material.description, model: material.model })),
    signatures: ['Responsável pela entrega', 'Responsável pelo recebimento'], footer: 'ATIVUS  •  Documento gerado a partir do registro histórico da transferência  •  Modelo provisório',
  };
}

function assertDocumentSize(buffer: Buffer) {
  if (buffer.length > AC_TRANSFER_DOCUMENT_MAX_BYTES) throw new Error('Documento excede o limite de tamanho permitido.');
  return buffer;
}

const cellBorders = { top: { style: BorderStyle.SINGLE, size: 4, color: '808080' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: '808080' }, left: { style: BorderStyle.SINGLE, size: 4, color: '808080' }, right: { style: BorderStyle.SINGLE, size: 4, color: '808080' } };
function docxCell(text: string, bold = false, width?: number) {
  return new TableCell({ width: width ? { size: width, type: WidthType.DXA } : undefined, borders: cellBorders, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })] });
}
function docxSectionTitle(title: string) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ cantSplit: true, children: [new TableCell({ borders: cellBorders, shading: { fill: 'D9E2F3', type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 18 })] })] })] })] });
}
function docxParagraph(text: string, bold = false) {
  return new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text, bold, size: 20 })] });
}

export async function renderAcTransferDocx(model: AcTransferDocumentModel): Promise<Buffer> {
  const layout = buildAcTransferDocumentLayout(model);
  const widths = [550, 1200, 1500, 3000, 2200];
  const materialRows = [
    new TableRow({ tableHeader: true, cantSplit: true, children: ['Nº', 'RP', 'N/S', 'DESCRIÇÃO DO BEM', 'MODELO'].map((text, index) => docxCell(text, true, widths[index])) }),
    ...layout.materials.map((material) => new TableRow({ cantSplit: true, children: [material.number, material.patrimony, material.serialNumber, material.description, material.model].map((text, index) => docxCell(text, false, widths[index])) })),
  ];
  const transferRows = [
    ['Referência da transferência', layout.transfer.id, 'Data da distribuição', layout.transfer.distributedAt],
    ['Unidade de origem', 'AC - PMPA', 'Unidade de destino', `${layout.transfer.destination} (${layout.transfer.acronym})`],
    ['Nº do BG (se houver)', layout.transfer.bg, 'Quantidade de bens', layout.transfer.quantity],
  ].map((row) => new TableRow({ cantSplit: true, children: row.map((text, index) => docxCell(text, index % 2 === 0, [2200, 2200, 2200, 2200][index])) }));
  const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: layout.header.institution, bold: true, size: 22 })] }), new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: layout.header.office, bold: true, size: 18 })] })] });
  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: layout.footer, size: 16, italics: true })] })] });
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: layout.header.title, bold: true, size: 26 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 220 }, children: [new TextRun({ text: layout.header.notice, bold: true, color: '9C0006', size: 20 })] }),
    docxParagraph(layout.introduction), docxParagraph(`Responsável pela entrega:  ${layout.responsibilities.deliverer}`), docxParagraph(`Responsável pelo recebimento:  ${layout.responsibilities.receiver}`),
    docxParagraph('Observação: a versão emitida pelo ATIVUS lista todos os bens constantes da transferência confirmada, com paginação automática.'), docxParagraph(`Local e data: ${layout.locationDate}`), docxParagraph('Documento demonstrativo. Não substitui formulário ou validação institucional da PMPA.', true),
    docxSectionTitle(layout.sections[0].title), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: transferRows }),
    docxSectionTitle(layout.sections[1].title), docxParagraph(`A AC declara a entrega dos bens relacionados, e ${layout.responsibilities.receiver} declara o recebimento pela unidade destinatária ${layout.transfer.destination}.`),
    docxSectionTitle(layout.sections[2].title), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: materialRows }),
    docxSectionTitle(layout.sections[3].title), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ cantSplit: true, children: layout.signatures.map((signature) => docxCell(`__________________________________\n${signature}\n${signature === layout.signatures[0] ? layout.responsibilities.deliverer : layout.responsibilities.receiver}\nAssinatura / identificação funcional`)) })] }),
  ];
  const document = new Document({ sections: [{ headers: { default: header }, footers: { default: footer }, properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900, header: 450, footer: 450 } } }, children }] });
  return assertDocumentSize(await Packer.toBuffer(document));
}

function pdfHeader(document: PDFKit.PDFDocument, layout: AcTransferDocumentLayout) {
  document.font('Helvetica-Bold').fontSize(11).text(layout.header.institution, PDF_MARGIN, 36, { width: PDF_CONTENT_WIDTH, align: 'center' });
  document.fontSize(9).text(layout.header.office, PDF_MARGIN, 51, { width: PDF_CONTENT_WIDTH, align: 'center' });
  document.font('Helvetica').fontSize(8).fillColor('#9c0006').text(layout.header.notice, PDF_MARGIN, 66, { width: PDF_CONTENT_WIDTH, align: 'center' }).fillColor('#000000');
  document.y = 88;
}
function pdfSection(document: PDFKit.PDFDocument, title: string) {
  if (document.y > 745) document.addPage();
  document.font('Helvetica-Bold').fontSize(9).text(title, PDF_MARGIN, document.y, { width: PDF_CONTENT_WIDTH });
  document.moveDown(0.35);
}
function pdfTable(document: PDFKit.PDFDocument, layout: AcTransferDocumentLayout, rows: string[][], widths: number[], repeatHeader: boolean) {
  const drawRow = (row: string[], header = false) => {
    document.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    const contentHeights = row.map((text, index) => document.heightOfString(text, { width: widths[index] - 8 }));
    const height = Math.max(22, ...contentHeights.map((value) => value + 8));
    if (document.y + height > 770) { document.addPage(); pdfHeader(document, layout); if (repeatHeader) drawRow(rows[0], true); }
    const top = document.y;
    let x = PDF_MARGIN;
    row.forEach((text, index) => { document.rect(x, top, widths[index], height).stroke('#888888'); document.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(text, x + 4, top + 4, { width: widths[index] - 8, height: height - 6 }); x += widths[index]; });
    document.y = top + height;
  };
  rows.forEach((row, index) => drawRow(row, index === 0 && repeatHeader));
}

export async function renderAcTransferPdf(model: AcTransferDocumentModel): Promise<Buffer> {
  const layout = buildAcTransferDocumentLayout(model);
  const document = new PDFDocument({ size: 'A4', margin: PDF_MARGIN, compress: false });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => { document.on('end', () => resolve(assertDocumentSize(Buffer.concat(chunks)))); document.on('error', reject); });
  pdfHeader(document, layout);
  document.font('Helvetica-Bold').fontSize(15).text(layout.header.title, { align: 'center' });
  document.moveDown(0.8).font('Helvetica').fontSize(9).text(layout.introduction, { align: 'justify' });
  document.moveDown(0.5).text(`Responsável pela entrega:  ${layout.responsibilities.deliverer}`); document.text(`Responsável pelo recebimento:  ${layout.responsibilities.receiver}`); document.moveDown(0.3).text(`Local e data: ${layout.locationDate}`);
  document.font('Helvetica-Bold').text('Documento demonstrativo. Não substitui formulário ou validação institucional da PMPA.');
  pdfSection(document, layout.sections[0].title);
  pdfTable(document, layout, [['Referência da transferência', layout.transfer.id, 'Data da distribuição', layout.transfer.distributedAt], ['Unidade de origem', 'AC - PMPA', 'Unidade de destino', `${layout.transfer.destination} (${layout.transfer.acronym})`], ['Nº do BG (se houver)', layout.transfer.bg, 'Quantidade de bens', layout.transfer.quantity]], [125, 125, 125, 124], false);
  pdfSection(document, layout.sections[1].title); document.font('Helvetica').fontSize(9).text(`A AC declara a entrega dos bens relacionados, e ${layout.responsibilities.receiver} declara o recebimento pela unidade destinatária ${layout.transfer.destination}.`);
  pdfSection(document, layout.sections[2].title);
  pdfTable(document, layout, [['Nº', 'RP', 'N/S', 'DESCRIÇÃO DO BEM', 'MODELO'], ...layout.materials.map((material) => [material.number, material.patrimony, material.serialNumber, material.description, material.model])], PDF_MATERIAL_COLUMNS, true);
  pdfSection(document, layout.sections[3].title); document.font('Helvetica').fontSize(9).text('__________________________________        __________________________________'); document.text(`${layout.signatures[0]}                         ${layout.signatures[1]}`); document.text(`${layout.responsibilities.deliverer}                 ${layout.responsibilities.receiver}`); document.text('Assinatura / identificação funcional       Assinatura / identificação funcional');
  document.fontSize(7).fillColor('#555555').text(layout.footer, PDF_MARGIN, 778, { width: PDF_CONTENT_WIDTH, align: 'center' });
  document.end();
  return completed;
}
