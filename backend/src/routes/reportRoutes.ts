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

function horizontalLine(x1: number, y: number, x2: number, color = '0.800 0.835 0.878', lineWidth = 1) {
  return `q ${color} RG ${lineWidth} w ${x1} ${y} m ${x2} ${y} l S Q`;
}

function buildPdf(commands: string[]) {
  const content = commands.join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
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
    fillRect(42, 44, 511, 754, '1 1 1'),
    strokeRect(42, 44, 511, 754, '0.800 0.835 0.878'),
    textAt('ATIVUS · PMPA / DITEL', 94, 746, 10, 'F2'),
    textAt('DOCUMENTO PARA CONFERÊNCIA', 94, 732, 7, 'F1'),
    strokeRect(431, 733, 78, 22, '0.137 0.388 0.922'),
    textAt(response.report.scope.acronym || response.report.scope.name, 443, 741, 8, 'F3'),
    horizontalLine(74, 712, 521),
    textAt('Pré-visualização', 74, 686, 20, 'F2'),
    horizontalLine(74, 670, 521, '0.137 0.388 0.922', 2),
    textAt(response.report.title, 74, 646, 14, 'F2'),
    textAt('Posição patrimonial por unidade e situação.', 74, 625, 10, 'F1'),
    horizontalLine(74, 602, 521),
    textAt('PERÍODO', 74, 581, 8, 'F2'),
    textAt(period, 74, 566, 9, 'F3'),
    textAt('ESCOPO', 312, 581, 8, 'F2'),
    textAt(response.report.scope.name, 312, 566, 9, 'F3'),
    textAt('REGISTROS INCLUÍDOS', 74, 544, 8, 'F2'),
    textAt(`${response.totals.total} equipamentos`, 74, 529, 9, 'F3'),
    textAt('GERADO POR', 312, 544, 8, 'F2'),
    textAt(response.generatedBy.name, 312, 529, 9, 'F3'),
    horizontalLine(74, 508, 521),
    textAt('FILTROS APLICADOS', 74, 489, 8, 'F2'),
    textAt(`Situação: ${situationFilter}`, 74, 474, 9, 'F1'),
    horizontalLine(74, 455, 521),
    textAt(`${response.totals.active} em operação`, 74, 433, 12, 'F2'),
    textAt(`${response.totals.maintenance} em manutenção`, 186, 433, 12, 'F2'),
    textAt(`${response.totals.inactive} inativos`, 316, 433, 12, 'F2'),
    textAt(`${response.totals.attention} requerem atenção`, 414, 433, 12, 'F2'),
    textAt('Resumo por unidade', 74, 398, 12, 'F2'),
    fillRect(74, 370, 447, 20, '0.137 0.388 0.922'),
    textAt('UNIDADE', 84, 377, 8, 'F2'),
    textAt('TOTAL', 298, 377, 8, 'F2'),
    textAt('OPERAÇÃO', 346, 377, 8, 'F2'),
    textAt('MANUT.', 412, 377, 8, 'F2'),
    textAt('ATENÇÃO', 466, 377, 8, 'F2'),
  ];

  response.units.slice(0, 10).forEach((item, index) => {
    const y = 349 - (index * 22);
    if (index % 2 === 0) {
      commands.push(fillRect(74, y - 5, 447, 20, '0.965 0.976 0.988'));
    }
    commands.push(textAt(item.unit.name, 84, y, 8, 'F1'));
    commands.push(textAt(String(item.total), 304, y, 8, 'F3'));
    commands.push(textAt(String(item.active), 360, y, 8, 'F3'));
    commands.push(textAt(String(item.maintenance), 430, y, 8, 'F3'));
    commands.push(textAt(String(item.attention), 486, y, 8, 'F3'));
  });

  commands.push(horizontalLine(74, 92, 521));
  commands.push(textAt('Prévia atualizada para conferência.', 74, 74, 8, 'F1'));
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
