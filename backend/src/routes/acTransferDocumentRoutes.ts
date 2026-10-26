import express, { type RequestHandler, type Router } from 'express';

import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { readAcTransfer } from '../repositories/acTransfersRepository.js';
import { buildAcTransferDocumentModel, renderAcTransferDocx, renderAcTransferPdf } from '../services/acTransferDocuments.js';

const FORMATS = ['docx', 'pdf'] as const;
type DocumentFormat = typeof FORMATS[number];

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
      res.set({
        'Content-Type': contentType(format),
        'Content-Disposition': `attachment; filename="termo-transferencia-ac-${transfer.id}.${format}"`,
        'X-Document-Template': 'provisional-not-official',
        'Cache-Control': 'no-store',
      });
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
