import express, { type RequestHandler, type Router } from 'express';
import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { EquipmentModel } from '../models/Equipment.js';
import { CallModel } from '../models/Call.js';
import { createAttachmentStorage } from '../storage/attachmentStorage.js';

async function scope(context: SessionContext | undefined) {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  const access = await resolveAccessScopeFromContext(context);
  if (!access) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
  return access;
}

function contentDisposition(name: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function createAttachmentRoutes(requireSession: RequestHandler): Router {
  const router = express.Router();

  router.get('/attachments/:attachmentId/download', requireSession, async (req, res, next) => {
    try {
      const access = await scope(req.sessionContext);
      const attachmentId = req.params.attachmentId;
      const scopeFilter = access.role === 'unit_user' ? { 'unit.id': access.unitId } : {};
      const [equipment, call] = await Promise.all([
        EquipmentModel.findOne({ ...scopeFilter, 'attachments.id': attachmentId }).select({ attachments: 1 }).lean().exec(),
        CallModel.findOne({ ...scopeFilter, 'attachments.id': attachmentId }).select({ attachments: 1 }).lean().exec(),
      ]);
      const attachment = [...(equipment?.attachments ?? []), ...(call?.attachments ?? [])].find((item: any) => item.id === attachmentId && item.status === 'active') as any;
      if (!attachment) throw new AuthError(404, 'NOT_FOUND', 'Anexo não encontrado.');
      const buffer = await createAttachmentStorage().read(attachment.storageKey);
      res.setHeader('Content-Type', attachment.type);
      res.setHeader('Content-Length', String(attachment.size));
      res.setHeader('Content-Disposition', contentDisposition(attachment.name));
      res.status(200).send(buffer);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
