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

function circle(x: number, y: number, radius: number, color: string) {
  const control = radius * 0.5522847498;

  return [
    `q ${color} rg`,
    `${x + radius} ${y} m`,
    `${x + radius} ${y + control} ${x + control} ${y + radius} ${x} ${y + radius} c`,
    `${x - control} ${y + radius} ${x - radius} ${y + control} ${x - radius} ${y} c`,
    `${x - radius} ${y - control} ${x - control} ${y - radius} ${x} ${y - radius} c`,
    `${x + control} ${y - radius} ${x + radius} ${y - control} ${x + radius} ${y} c`,
    'f Q',
  ].join(' ');
}

function buildPdf(commands: string[]) {
  const content = commands.join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n',
    `7 0 obj\n<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream\nendobj\n`,
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
  const commands = [
    fillRect(0, 0, 595, 842, '0.945 0.969 1'),
    fillRect(42, 38, 511, 766, '1 1 1'),
    strokeRect(42, 38, 511, 766, '0.760 0.815 0.878'),
    fillRect(42, 742, 511, 62, '0.055 0.125 0.235'),
    fillRect(42, 742, 9, 62, '0.137 0.388 0.922'),
    circle(81, 772, 13, '0.137 0.388 0.922'),
    textAt('A', 76, 768, 12, 'F2'),
    textAt('POLÍCIA MILITAR DO PARÁ', 105, 779, 8, 'F2'),
    textAt('DIRETORIA DE TELEMÁTICA - DITEL', 105, 765, 8, 'F1'),
    textAt('ATIVUS', 452, 770, 18, 'F2'),
    textAt('Sistema de Gestão Patrimonial', 414, 755, 7, 'F1'),
    fillRect(66, 650, 463, 67, '0.965 0.976 0.988'),
    strokeRect(66, 650, 463, 67, '0.800 0.835 0.878'),
    textAt('RELATÓRIO PATRIMONIAL', 82, 692, 20, 'F2'),
    textAt(response.report.title, 82, 672, 11, 'F2'),
    textAt('Documento para conferência administrativa do inventário institucional.', 82, 657, 8, 'F1'),
    horizontalLine(66, 630, 529, '0.137 0.388 0.922', 2),
    textAt('RECORTE DO RELATÓRIO', 76, 607, 9, 'F2'),
    fillRect(76, 554, 443, 40, '0.985 0.990 1'),
    strokeRect(76, 554, 443, 40, '0.800 0.835 0.878'),
    line(224, 554, 224, 594, '0.800 0.835 0.878'),
    line(372, 554, 372, 594, '0.800 0.835 0.878'),
    textAt('ESCOPO', 92, 578, 7, 'F2'),
    textAt(restrictedScope, 92, 564, 9, 'F1'),
    textAt('PERÍODO', 240, 578, 7, 'F2'),
    textAt(period, 240, 564, 9, 'F1'),
    textAt('GERADO POR', 388, 578, 7, 'F2'),
    textAt(response.generatedBy.name, 388, 564, 9, 'F1'),
    textAt('PAINEL EXECUTIVO', 76, 527, 11, 'F2'),
    fillRect(76, 460, 103, 52, '0.949 0.973 1'),
    fillRect(190, 460, 103, 52, '0.925 0.988 0.953'),
    fillRect(304, 460, 103, 52, '1 0.984 0.902'),
    fillRect(418, 460, 101, 52, '1 0.949 0.949'),
    strokeRect(76, 460, 103, 52, '0.675 0.792 0.976', 1.2),
    strokeRect(190, 460, 103, 52, '0.518 0.855 0.604', 1.2),
    strokeRect(304, 460, 103, 52, '0.949 0.765 0.263', 1.2),
    strokeRect(418, 460, 101, 52, '0.973 0.444 0.444', 1.2),
    fillRect(76, 506, 103, 6, '0.137 0.388 0.922'),
    fillRect(190, 506, 103, 6, '0.063 0.725 0.506'),
    fillRect(304, 506, 103, 6, '0.965 0.620 0.043'),
    fillRect(418, 506, 101, 6, '0.933 0.247 0.247'),
    textAt('TOTAL', 90, 492, 7, 'F2'),
    textAt(`${response.totals.total}`, 90, 472, 20, 'F2'),
    textAt('Equipamentos', 120, 476, 7, 'F1'),
    textAt('OPERAÇÃO', 204, 492, 7, 'F2'),
    textAt(`${response.totals.active}`, 204, 472, 20, 'F2'),
    textAt(`${operationalPercent}% ativos`, 234, 476, 7, 'F1'),
    textAt('MANUTENÇÃO', 318, 492, 7, 'F2'),
    textAt(`${response.totals.maintenance}`, 318, 472, 20, 'F2'),
    textAt('Acompanhar', 348, 476, 7, 'F1'),
    textAt('ATENÇÃO', 432, 492, 7, 'F2'),
    textAt(`${response.totals.attention}`, 432, 472, 20, 'F2'),
    textAt(`${attentionPercent}% do total`, 462, 476, 7, 'F1'),
    fillRect(76, 377, 443, 58, '0.985 0.990 1'),
    strokeRect(76, 377, 443, 58, '0.800 0.835 0.878'),
    fillRect(76, 377, 7, 58, '0.137 0.388 0.922'),
    textAt('LEITURA ADMINISTRATIVA', 94, 414, 9, 'F2'),
    textAt(`Parque em operação: ${response.totals.active} de ${response.totals.total} equipamento(s), equivalente a ${operationalPercent}%.`, 94, 397, 8, 'F1'),
    textAt(`Pendências de atenção: ${response.totals.attention} registro(s) no recorte selecionado.`, 94, 383, 8, 'F1'),
    textAt(`Filtro: ${situationFilter}.`, 374, 397, 8, 'F1'),
    horizontalLine(76, 354, 519),
    textAt('Resumo por unidade', 76, 329, 11, 'F2'),
    fillRect(76, 301, 443, 20, '0.137 0.388 0.922'),
    textAt('UNIDADE', 88, 308, 7, 'F2'),
    textAt('TOTAL', 300, 308, 7, 'F2'),
    textAt('OPERAÇÃO', 348, 308, 7, 'F2'),
    textAt('MANUT.', 414, 308, 7, 'F2'),
    textAt('ATENÇÃO', 466, 308, 7, 'F2'),
  ];

  response.units.slice(0, 10).forEach((item, index) => {
    const y = 278 - (index * 22);
    if (index % 2 === 0) {
      commands.push(fillRect(76, y - 7, 443, 20, '0.965 0.976 0.988'));
    }
    commands.push(line(76, y - 8, 519, y - 8, '0.900 0.925 0.955'));
    commands.push(textAt(item.unit.name, 88, y, 8, 'F1'));
    commands.push(textAt(String(item.total), 306, y, 8, 'F3'));
    commands.push(textAt(String(item.active), 362, y, 8, 'F3'));
    commands.push(textAt(String(item.maintenance), 430, y, 8, 'F3'));
    commands.push(textAt(String(item.attention), 486, y, 8, 'F3'));
  });

  commands.push(fillRect(76, 118, 443, 66, '0.985 0.990 1'));
  commands.push(strokeRect(76, 118, 443, 66, '0.800 0.835 0.878'));
  commands.push(textAt('Conferência administrativa', 90, 161, 10, 'F2'));
  commands.push(textAt('Responsável: ____________________________________  Matrícula: __________________', 90, 143, 8, 'F1'));
  commands.push(textAt('Observações: _________________________________________________________________', 90, 129, 8, 'F1'));
  commands.push(horizontalLine(74, 92, 521));
  commands.push(textAt('Documento emitido pelo ATIVUS para conferência patrimonial.', 74, 74, 8, 'F1'));
  commands.push(textAt(`Emissão: ${generatedAt}`, 426, 74, 8, 'F1'));

  return buildPdf(commands);
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
