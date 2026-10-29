import express, { type RequestHandler, type Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';

import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { readAcTransfer } from '../repositories/acTransfersRepository.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { buildAcTransferDocumentModel, renderAcTransferDocx, renderAcTransferPdf } from '../services/acTransferDocuments.js';

const FORMATS = ['docx', 'pdf'] as const;
type DocumentFormat = typeof FORMATS[number];
export const AC_TRANSFER_DOCUMENT_TEMPLATE_VERSION = 'ac-transfer-v1';

function requireReader(context: SessionContext | undefined) {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  if (context.role !== 'ac_operator' && context.role !== 'ditel_admin') throw new AuthError(403, 'FORBIDDEN', 'Perfil sem acesso aos documentos AC.');
  return context;
}

function parseFormat(query: express.Request['query']): DocumentFormat {
  if (typeof query.format !== 'string' || !FORMATS.includes(query.format as DocumentFormat)) throw new AuthError(400, 'INVALID_DOCUMENT_FORMAT', 'Formato de documento inválido.');
  return query.format as DocumentFormat;
}

function contentType(format: DocumentFormat) {
  return format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
}

export function createAcTransferDocumentRoutes(requireSessionMiddleware: RequestHandler): Router {
  const router = express.Router();
  router.get('/ac/transfers/:transferId/document', requireSessionMiddleware, async (req, res, next) => {
    try {
      requireReader(req.sessionContext);
      if (!/^[a-f\d]{24}$/i.test(req.params.transferId)) throw new AuthError(400, 'INVALID_TRANSFER_ID', 'Identificador da transferência inválido.');
      const format = parseFormat(req.query);
      const transfer = await readAcTransfer(req.params.transferId);
      if (!transfer) {
        res.status(404).json({ code: 'NOT_FOUND', message: 'Transferência AC não encontrada.' });
        return;
      }
      const model = buildAcTransferDocumentModel(transfer);
      const buffer = format === 'docx' ? await renderAcTransferDocx(model) : await renderAcTransferPdf(model);
      const documentId = randomUUID();
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      await recordAuditEvent({
        action: 'ac.transfer.document.emit',
        module: 'ac',
        userId: req.sessionContext?.userId ?? null,
        actor: req.sessionContext ? { id: req.sessionContext.userId, name: req.sessionContext.name, registration: req.sessionContext.registration, role: req.sessionContext.role } : null,
        entity: { type: 'ac_transfer', id: transfer.id, label: `Transferência AC ${transfer.id}` },
        unit: transfer.destinationUnit,
        result: 'success',
        after: { operationId: transfer.id, templateVersion: AC_TRANSFER_DOCUMENT_TEMPLATE_VERSION, format, documentId, sha256, emittedAt: new Date().toISOString() },
      });
      res.set({
        'Content-Type': contentType(format),
        'Content-Disposition': `attachment; filename="termo-transferencia-ac-${transfer.id}.${format}"`,
        'X-Document-Template': 'provisional-not-official',
        'X-Document-Template-Version': AC_TRANSFER_DOCUMENT_TEMPLATE_VERSION,
        'X-Document-Notice': 'MODELO PROVISÓRIO - NÃO OFICIAL',
        'X-Document-Id': documentId,
        'Cache-Control': 'no-store',
      });
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
