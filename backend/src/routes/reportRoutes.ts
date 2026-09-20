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
  const commands = [
    fillRect(0, 0, 595, 842, '0.945 0.969 1'),
    fillRect(44, 40, 507, 762, '1 1 1'),
    strokeRect(44, 40, 507, 762, '0.760 0.815 0.878'),
    fillRect(44, 747, 507, 55, '0.965 0.976 0.988'),
    fillRect(44, 747, 6, 55, '0.137 0.388 0.922'),
    textAt('POLÍCIA MILITAR DO PARÁ', 74, 778, 8, 'F2'),
    textAt('DIRETORIA DE TELEMÁTICA - DITEL', 74, 764, 8, 'F1'),
    textAt('ATIVUS', 461, 772, 16, 'F2'),
    textAt('Relatório patrimonial', 74, 727, 20, 'F2'),
    textAt(response.report.title, 74, 704, 12, 'F2'),
    textAt('Documento gerado para conferência administrativa do inventário institucional.', 74, 686, 9, 'F1'),
    horizontalLine(74, 670, 521, '0.137 0.388 0.922', 2),
    fillRect(74, 612, 447, 44, '0.965 0.976 0.988'),
    strokeRect(74, 612, 447, 44, '0.800 0.835 0.878'),
    textAt('ESCOPO', 90, 637, 7, 'F2'),
    textAt(response.report.scope.name, 90, 622, 10, 'F1'),
    textAt('PERÍODO', 304, 637, 7, 'F2'),
    textAt(period, 304, 622, 10, 'F1'),
    textAt('GERADO POR', 420, 637, 7, 'F2'),
    textAt(response.generatedBy.name, 420, 622, 10, 'F1'),
    textAt('Resumo executivo', 74, 582, 12, 'F2'),
    fillRect(74, 526, 103, 42, '0.949 0.973 1'),
    fillRect(188, 526, 103, 42, '0.925 0.988 0.953'),
    fillRect(302, 526, 103, 42, '1 0.984 0.902'),
    fillRect(416, 526, 105, 42, '1 0.949 0.949'),
    strokeRect(74, 526, 103, 42, '0.675 0.792 0.976'),
    strokeRect(188, 526, 103, 42, '0.518 0.855 0.604'),
    strokeRect(302, 526, 103, 42, '0.949 0.765 0.263'),
    strokeRect(416, 526, 105, 42, '0.973 0.444 0.444'),
    textAt('TOTAL', 88, 551, 7, 'F2'),
    textAt(`${response.totals.total}`, 88, 535, 14, 'F2'),
    textAt('EM OPERAÇÃO', 202, 551, 7, 'F2'),
    textAt(`${response.totals.active}`, 202, 535, 14, 'F2'),
    textAt('MANUTENÇÃO', 316, 551, 7, 'F2'),
    textAt(`${response.totals.maintenance}`, 316, 535, 14, 'F2'),
    textAt('ATENÇÃO', 430, 551, 7, 'F2'),
    textAt(`${response.totals.attention}`, 430, 535, 14, 'F2'),
    textAt('Filtros aplicados', 74, 497, 12, 'F2'),
    textAt(`Situação: ${situationFilter}`, 74, 478, 9, 'F1'),
    horizontalLine(74, 462, 521),
    textAt('Resumo por unidade', 74, 431, 12, 'F2'),
    fillRect(74, 400, 447, 22, '0.137 0.388 0.922'),
    textAt('UNIDADE', 86, 408, 8, 'F2'),
    textAt('TOTAL', 298, 408, 8, 'F2'),
    textAt('OPERAÇÃO', 346, 408, 8, 'F2'),
    textAt('MANUT.', 412, 408, 8, 'F2'),
    textAt('ATENÇÃO', 466, 408, 8, 'F2'),
  ];

  response.units.slice(0, 10).forEach((item, index) => {
    const y = 377 - (index * 24);
    if (index % 2 === 0) {
      commands.push(fillRect(74, y - 7, 447, 22, '0.965 0.976 0.988'));
    }
    commands.push(line(74, y - 8, 521, y - 8, '0.900 0.925 0.955'));
    commands.push(textAt(item.unit.name, 84, y, 8, 'F1'));
    commands.push(textAt(String(item.total), 304, y, 8, 'F3'));
    commands.push(textAt(String(item.active), 360, y, 8, 'F3'));
    commands.push(textAt(String(item.maintenance), 430, y, 8, 'F3'));
    commands.push(textAt(String(item.attention), 486, y, 8, 'F3'));
  });

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
