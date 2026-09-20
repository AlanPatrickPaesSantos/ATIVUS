import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

import { Router, type RequestHandler } from 'express';

import { resolveAccessScopeFromContext, type ActiveUnitAccessScope } from '../auth/activeUnitScope.js';
import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { STATEWIDE_DASHBOARD_UNIT } from '../middlewares/authorization.js';
import { findActiveUnitReference } from '../repositories/unitsRepository.js';
import {
  readCallsReport,
  readGeneralReport,
  readInventoryReport,
  readMovementsReport,
  REPORT_PERIODS,
  REPORT_SITUATIONS,
  type InventoryReport,
  type InventoryReportFilters,
  type InventoryReportPeriod,
  type InventoryReportSituation,
} from '../repositories/reportsRepository.js';

const CSV_HEADERS = ['Unidade', 'Total', 'Em operação', 'Em manutenção', 'Inativos', 'Perdidos', 'Baixados', 'Atenção'];
type PdfImage = { name: string; width: number; height: number; data: Buffer };

async function scope(context: SessionContext | undefined): Promise<ActiveUnitAccessScope> {
  if (!context) {
    throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  }

  const access = await resolveAccessScopeFromContext(context);

  if (!access) {
    throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
  }

  return access;
}

function parseFilters(query: Record<string, unknown>): InventoryReportFilters {
  const filters: InventoryReportFilters = {};
  const unitId = typeof query.unitId === 'string' && query.unitId.trim() ? query.unitId.trim() : undefined;
  const situation = typeof query.situation === 'string' && query.situation.trim() ? query.situation.trim() : undefined;
  const period = typeof query.period === 'string' && query.period.trim() ? query.period.trim() : undefined;

  if (unitId) {
    filters.unitId = unitId;
  }

  if (situation) {
    if (!REPORT_SITUATIONS.includes(situation as InventoryReportSituation)) {
      throw new AuthError(400, 'INVALID_QUERY', 'Situação inválida.');
    }

    filters.situation = situation as InventoryReportSituation;
  }

  if (period) {
    if (!REPORT_PERIODS.includes(period as InventoryReportPeriod)) {
      throw new AuthError(400, 'INVALID_QUERY', 'Período inválido.');
    }

    filters.period = period as InventoryReportPeriod;
  }

  return filters;
}

async function resolveReportScope(access: ActiveUnitAccessScope, filters: InventoryReportFilters) {
  if (access.role === 'unit_user') {
    return access.unit;
  }

  if (!filters.unitId) {
    return STATEWIDE_DASHBOARD_UNIT;
  }

  const unit = await findActiveUnitReference(filters.unitId);

  if (!unit) {
    throw new AuthError(400, 'INVALID_QUERY', 'Unidade inválida.');
  }

  return unit;
}

async function buildInventoryReportResponse(context: SessionContext, query: Record<string, unknown>) {
  const access = await scope(context);
  const filters = parseFilters(query);
  const requestedScope = await resolveReportScope(access, filters);
  const report = await readInventoryReport(filters, { role: access.role, unitId: access.unitId });

  return {
    report: {
      id: 'inventory-summary',
      title: 'Inventário consolidado',
      generatedAt: new Date().toISOString(),
      scope: requestedScope,
      filters: {
        situation: filters.situation ?? null,
        ...(filters.period ? { period: filters.period } : {}),
      },
    },
    totals: report.totals,
    units: report.units,
    generatedBy: {
      name: context.name,
      role: context.role,
    },
  };
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function reportToCsv(report: InventoryReport) {
  const rows = report.units.map((unitSummary) => [
    unitSummary.unit.name,
    unitSummary.total,
    unitSummary.active,
    unitSummary.maintenance,
    unitSummary.inactive,
    unitSummary.lost,
    unitSummary.writtenOff,
    unitSummary.attention,
  ]);

  return [
    CSV_HEADERS,
    ...rows,
  ].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function pdfText(value: string) {
  const bytes = Buffer.from(value, 'latin1');
  let escaped = '';

  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      escaped += `\\${String.fromCharCode(byte)}`;
    } else if (byte < 0x20 || byte > 0x7e) {
      escaped += `\\${byte.toString(8).padStart(3, '0')}`;
    } else {
      escaped += String.fromCharCode(byte);
    }
  }

  return `(${escaped})`;
}

function textAt(value: string, x: number, y: number, size = 10, font = 'F1') {
  return `BT /${font} ${size} Tf ${x} ${y} Td ${pdfText(value)} Tj ET`;
}

function fillRect(x: number, y: number, width: number, height: number, color: string) {
  return `q ${color} rg ${x} ${y} ${width} ${height} re f Q`;
}

function strokeRect(x: number, y: number, width: number, height: number, color: string, lineWidth = 1) {
  return `q ${color} RG ${lineWidth} w ${x} ${y} ${width} ${height} re S Q`;
}

function line(x1: number, y1: number, x2: number, y2: number, color = '0.800 0.835 0.878', lineWidth = 1) {
  return `q ${color} RG ${lineWidth} w ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

function horizontalLine(x1: number, y: number, x2: number, color = '0.800 0.835 0.878', lineWidth = 1) {
  return line(x1, y, x2, y, color, lineWidth);
}

function imageAt(name: string, x: number, y: number, width: number, height: number) {
  return `q ${width} 0 0 ${height} ${x} ${y} cm /${name} Do Q`;
}

function paethPredictor(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);

  if (pa <= pb && pa <= pc) {
    return a;
  }

  return pb <= pc ? b : c;
}

function decodePngImage(filePath: string, name: string): PdfImage | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const png = readFileSync(filePath);

  if (!png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return null;
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!width || !height || bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    return null;
  }

  const inputChannels = colorType === 6 ? 4 : 3;
  const scanlineLength = width * inputChannels;
  const inflated = inflateSync(Buffer.concat(idat));
  const unfiltered = Buffer.alloc(width * height * inputChannels);
  let inputOffset = 0;
  let outputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;

    for (let x = 0; x < scanlineLength; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= inputChannels ? unfiltered[outputOffset + x - inputChannels] : 0;
      const up = y > 0 ? unfiltered[outputOffset + x - scanlineLength] : 0;
      const upLeft = y > 0 && x >= inputChannels ? unfiltered[outputOffset + x - scanlineLength - inputChannels] : 0;
      let value = raw;

      if (filter === 1) {
        value = (raw + left) & 0xff;
      } else if (filter === 2) {
        value = (raw + up) & 0xff;
      } else if (filter === 3) {
        value = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        value = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      }

      unfiltered[outputOffset + x] = value;
    }

    inputOffset += scanlineLength;
    outputOffset += scanlineLength;
  }

  const rgb = Buffer.alloc(width * height * 3);

  for (let source = 0, target = 0; source < unfiltered.length; source += inputChannels, target += 3) {
    rgb[target] = unfiltered[source];
    rgb[target + 1] = unfiltered[source + 1];
    rgb[target + 2] = unfiltered[source + 2];
  }

  return { name, width, height, data: deflateSync(rgb) };
}

function loadReportLogo(): PdfImage | null {
  return decodePngImage(join(process.cwd(), '..', 'frontend', 'public', 'images', 'brasao-pmpa.png'), 'LogoPmpa');
}

function buildPdf(commands: string[], images: PdfImage[] = []) {
  const content = commands.join('\n');
  const imageResources = images.length > 0
    ? ` /XObject << ${images.map((image, index) => `/${image.name} ${8 + index} 0 R`).join(' ')} >>`
    : '';

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>${imageResources} >> /Contents 7 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n',
    `7 0 obj\n<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream\nendobj\n`,
    ...images.map((image, index) => `${8 + index} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.data.length} >>\nstream\n${image.data.toString('latin1')}\nendstream\nendobj\n`),
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(output, 'latin1'));
    output += object;
  }

  const xrefOffset = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(output, 'latin1');
}

function reportToPdf(response: Awaited<ReturnType<typeof buildInventoryReportResponse>>) {
  const generatedAt = new Date(response.report.generatedAt).toLocaleDateString('pt-BR');
  const situationFilter = response.report.filters.situation ?? 'Todas as situações';
  const period = response.report.filters.period ?? 'Agosto de 2026';
  const operationalPercent = response.totals.total > 0 ? Math.round((response.totals.active / response.totals.total) * 100) : 0;
  const attentionPercent = response.totals.total > 0 ? Math.round((response.totals.attention / response.totals.total) * 100) : 0;
  const restrictedScope = response.report.scope.id === 'statewide' ? 'Consolidação estadual' : response.report.scope.name;
  const barWidth = 330;
  const segmentWidth = (value: number) => (response.totals.total > 0 ? Math.max(value === 0 ? 0 : 3, Math.round((value / response.totals.total) * barWidth)) : 0);
  const activeWidth = segmentWidth(response.totals.active);
  const maintenanceWidth = segmentWidth(response.totals.maintenance);
  const attentionWidth = Math.max(0, barWidth - activeWidth - maintenanceWidth);
  const operationBarWidth = response.totals.total > 0 ? Math.round((response.totals.active / response.totals.total) * 210) : 0;
  const attentionBarWidth = response.totals.total > 0 ? Math.round((response.totals.attention / response.totals.total) * 210) : 0;
  const logo = loadReportLogo();
  const images = logo ? [logo] : [];
  const commands = [
    fillRect(0, 0, 595, 842, '1 1 1'),
    ...(logo ? [imageAt(logo.name, 44, 750, 38, 46), imageAt(logo.name, 513, 750, 38, 46)] : [
      strokeRect(42, 748, 40, 48, '0.137 0.388 0.922', 1),
      textAt('PMPA', 50, 770, 8, 'F2'),
      strokeRect(513, 748, 40, 48, '0.137 0.388 0.922', 1),
      textAt('ATIVUS', 518, 770, 7, 'F2'),
    ]),
    textAt('GOVERNO DO ESTADO DO PARÁ', 224, 790, 7, 'F2'),
    textAt('SECRETARIA DE SEGURANÇA PÚBLICA E DEFESA SOCIAL', 188, 779, 7, 'F2'),
    textAt('POLÍCIA MILITAR DO PARÁ', 232, 768, 7, 'F2'),
    textAt('DIRETORIA DE TELEMÁTICA', 234, 757, 8, 'F2'),
    horizontalLine(42, 736, 553, '0 0 0', 1),
    textAt('RELATÓRIO PATRIMONIAL', 201, 706, 16, 'F2'),
    textAt(response.report.title, 238, 687, 9, 'F2'),
    textAt('Documento oficial para conferência administrativa do inventário institucional.', 133, 670, 8, 'F1'),
    horizontalLine(82, 650, 513, '0.137 0.388 0.922', 1.5),
    textAt('UNIDADE EMISSORA', 82, 626, 8, 'F2'),
    fillRect(82, 607, 170, 14, '0.925 0.961 1'),
    textAt(response.report.scope.name, 90, 611, 8, 'F2'),
    textAt('PERÍODO', 286, 626, 7, 'F2'),
    textAt(period, 286, 612, 8, 'F1'),
    textAt('GERADO POR', 410, 626, 7, 'F2'),
    textAt(response.generatedBy.name, 410, 612, 8, 'F1'),
    textAt(`Escopo autorizado: ${restrictedScope}.`, 82, 590, 7, 'F1'),
    horizontalLine(82, 566, 513),
    textAt('SÍNTESE EXECUTIVA', 82, 543, 10, 'F2'),
    textAt(`${response.totals.total}`, 82, 516, 18, 'F2'),
    textAt('equipamentos no recorte', 110, 521, 7, 'F1'),
    textAt(`${response.totals.active}`, 242, 516, 18, 'F2'),
    textAt('em operação', 270, 521, 7, 'F1'),
    textAt(`${response.totals.maintenance}`, 390, 516, 18, 'F2'),
    textAt('em manutenção', 418, 521, 7, 'F1'),
    horizontalLine(82, 500, 513),
    textAt('DIAGNÓSTICO VISUAL', 82, 477, 10, 'F2'),
    textAt('Indicador de operação', 82, 456, 8, 'F2'),
    fillRect(82, 436, 210, 8, '0.900 0.925 0.955'),
    fillRect(82, 436, operationBarWidth, 8, '0.063 0.725 0.506'),
    textAt(`${operationalPercent}%`, 302, 432, 14, 'F2'),
    textAt('Parque em operação no recorte autorizado.', 82, 420, 7, 'F1'),
    textAt('Atenção administrativa', 82, 396, 8, 'F2'),
    fillRect(82, 376, 210, 8, '0.900 0.925 0.955'),
    fillRect(82, 376, attentionBarWidth, 8, '0.933 0.247 0.247'),
    textAt(`${attentionPercent}%`, 302, 372, 14, 'F2'),
    textAt('Registros que exigem acompanhamento.', 82, 360, 7, 'F1'),
    textAt('COMPOSIÇÃO DO PARQUE', 82, 334, 10, 'F2'),
    textAt('Equipamentos por situação', 82, 317, 8, 'F2'),
    fillRect(82, 297, barWidth, 12, '0.900 0.925 0.955'),
    fillRect(82, 297, activeWidth, 12, '0.063 0.725 0.506'),
    fillRect(82 + activeWidth, 297, maintenanceWidth, 12, '0.965 0.620 0.043'),
    fillRect(82 + activeWidth + maintenanceWidth, 297, attentionWidth, 12, '0.933 0.247 0.247'),
    textAt('OPERAÇÃO', 82, 277, 7, 'F2'),
    textAt(`${response.totals.active} item(ns)`, 82, 265, 7, 'F1'),
    textAt('MANUTENÇÃO', 202, 277, 7, 'F2'),
    textAt(`${response.totals.maintenance} item(ns)`, 202, 265, 7, 'F1'),
    textAt('ATENÇÃO', 332, 277, 7, 'F2'),
    textAt(`${response.totals.attention} item(ns)`, 332, 265, 7, 'F1'),
    textAt(`Parque em operação: ${response.totals.active} de ${response.totals.total} equipamento(s), equivalente a ${operationalPercent}%.`, 82, 244, 7, 'F1'),
    textAt(`Filtro aplicado: ${situationFilter}.`, 82, 232, 7, 'F1'),
    horizontalLine(82, 214, 513),
    textAt('Resumo por unidade', 82, 191, 10, 'F2'),
    fillRect(82, 166, 431, 16, '0.137 0.388 0.922'),
    textAt('UNIDADE', 94, 171, 7, 'F2'),
    textAt('TOTAL', 304, 171, 7, 'F2'),
    textAt('OPERAÇÃO', 352, 171, 7, 'F2'),
    textAt('MANUT.', 418, 171, 7, 'F2'),
    textAt('ATENÇÃO', 468, 171, 7, 'F2'),
  ];

  response.units.slice(0, 10).forEach((item, index) => {
    const y = 146 - (index * 18);
    if (index % 2 === 0) {
      commands.push(fillRect(82, y - 6, 431, 16, '0.965 0.976 0.988'));
    }
    commands.push(line(82, y - 7, 513, y - 7, '0.900 0.925 0.955'));
    commands.push(textAt(item.unit.name, 94, y, 8, 'F1'));
    commands.push(textAt(String(item.total), 310, y, 8, 'F3'));
    commands.push(textAt(String(item.active), 366, y, 8, 'F3'));
    commands.push(textAt(String(item.maintenance), 434, y, 8, 'F3'));
    commands.push(textAt(String(item.attention), 488, y, 8, 'F3'));
  });

  commands.push(horizontalLine(70, 74, 260, '0 0 0', 1));
  commands.push(horizontalLine(335, 74, 525, '0 0 0', 1));
  commands.push(textAt('RESPONSÁVEL TÉCNICO', 116, 58, 7, 'F2'));
  commands.push(textAt('DIRETORIA DE TELEMÁTICA - PMPA', 99, 47, 6, 'F2'));
  commands.push(textAt('ASSINATURA DO RECEPTOR / SOLICITANTE', 374, 58, 7, 'F2'));
  commands.push(textAt(response.report.scope.name.toUpperCase(), 397, 47, 6, 'F2'));
  commands.push(textAt(`Emissão: ${generatedAt}`, 450, 28, 7, 'F1'));

  return buildPdf(commands, images);
}

async function buildCallsReportResponse(context: SessionContext, query: Record<string, unknown>) {
  const access = await scope(context);
  const filters = parseFilters(query);
  const requestedScope = await resolveReportScope(access, filters);
  const report = await readCallsReport(filters, { role: access.role, unitId: access.unitId });

  return {
    report: {
      id: 'calls-summary',
      title: 'Chamados por status e prioridade',
      generatedAt: new Date().toISOString(),
      scope: requestedScope,
      filters: {},
    },
    totals: report.totals,
    byStatus: report.byStatus,
    byPriority: report.byPriority,
    generatedBy: { name: context.name, role: context.role },
  };
}

async function buildMovementsReportResponse(context: SessionContext, query: Record<string, unknown>) {
  const access = await scope(context);
  const filters = parseFilters(query);
  const requestedScope = await resolveReportScope(access, filters);
  const report = await readMovementsReport(filters, { role: access.role, unitId: access.unitId });

  return {
    report: {
      id: 'movements-summary',
      title: 'Movimentações por período',
      generatedAt: new Date().toISOString(),
      scope: requestedScope,
      filters: {},
    },
    totals: report.totals,
    byStatus: report.byStatus,
    generatedBy: { name: context.name, role: context.role },
  };
}

async function buildGeneralReportResponse(context: SessionContext, query: Record<string, unknown>) {
  const access = await scope(context);
  const filters = parseFilters(query);
  const requestedScope = await resolveReportScope(access, filters);
  const report = await readGeneralReport(filters, { role: access.role, unitId: access.unitId });

  return {
    report: {
      id: 'general',
      title: 'Relatório geral DITEL',
      generatedAt: new Date().toISOString(),
      scope: requestedScope,
      filters: {
        situation: filters.situation ?? null,
        ...(filters.period ? { period: filters.period } : {}),
      },
    },
    inventory: report.inventory,
    calls: report.calls,
    movements: report.movements,
    generatedBy: { name: context.name, role: context.role },
  };
}

export function createReportRoutes(requireSession: RequestHandler) {
  const router = Router();

  router.get('/reports/inventory-summary', requireSession, async (req, res, next) => {
    try {
      res.status(200).json(await buildInventoryReportResponse(req.sessionContext as SessionContext, req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports/inventory-summary/export', requireSession, async (req, res, next) => {
    try {
      const format = typeof req.query.format === 'string' ? req.query.format : '';
      const response = await buildInventoryReportResponse(req.sessionContext as SessionContext, req.query);

      if (format === 'csv') {
        res
          .status(200)
          .type('text/csv; charset=utf-8')
          .attachment('inventory-summary.csv')
          .send(reportToCsv({ totals: response.totals, units: response.units }));
        return;
      }

      if (format === 'pdf') {
        res
          .status(200)
          .type('application/pdf')
          .attachment('inventory-summary.pdf')
          .send(reportToPdf(response));
        return;
      }

      throw new AuthError(400, 'INVALID_EXPORT_FORMAT', 'Formato de exportação inválido.');
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports/calls-summary', requireSession, async (req, res, next) => {
    try {
      res.status(200).json(await buildCallsReportResponse(req.sessionContext as SessionContext, req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports/movements-summary', requireSession, async (req, res, next) => {
    try {
      res.status(200).json(await buildMovementsReportResponse(req.sessionContext as SessionContext, req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports/general', requireSession, async (req, res, next) => {
    try {
      res.status(200).json(await buildGeneralReportResponse(req.sessionContext as SessionContext, req.query));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
