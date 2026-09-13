import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AuthError } from '../auth/sessionService.js';
import { createAttachmentStorage, type AttachmentStorage } from '../storage/attachmentStorage.js';

export type AttachmentKind = 'equipment' | 'call';

export interface AttachmentMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: Date;
  status: 'active';
  storageKey: string;
}

export interface PublicAttachmentMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  status: 'active';
  downloadUrl: string;
}

const MAX_ATTACHMENTS = 5;
const RULES: Record<AttachmentKind, { maxBytes: number; maxLabel: string; allowed: Record<string, readonly string[]>; message: string }> = {
  equipment: {
    maxBytes: 15 * 1024 * 1024,
    maxLabel: '15 MiB',
    allowed: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    message: 'Tipo de anexo não permitido. Use PDF, JPG ou PNG.',
  },
  call: {
    maxBytes: 10 * 1024 * 1024,
    maxLabel: '10 MiB',
    allowed: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/gif': ['.gif'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    message: 'Tipo de anexo não permitido. Use documentos PDF/DOC/DOCX ou fotos JPG/PNG/WEBP/GIF.',
  },
};

function extension(name: string) {
  return extname(name).toLocaleLowerCase();
}

export function attachmentDownloadUrl(id: string) {
  return `/api/v1/attachments/${encodeURIComponent(id)}/download`;
}

export function publicAttachment(attachment: any): PublicAttachmentMetadata {
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    uploadedAt: new Date(attachment.uploadedAt).toISOString(),
    status: 'active',
    downloadUrl: attachmentDownloadUrl(attachment.id),
  };
}

export async function cleanupStoredAttachments(attachments: Pick<AttachmentMetadata, 'storageKey'>[], storage: AttachmentStorage = createAttachmentStorage()) {
  await Promise.all(attachments.map((attachment) => storage.delete(attachment.storageKey)));
}

export async function storeUploadedAttachments(kind: AttachmentKind, files: Express.Multer.File[] | undefined, storage: AttachmentStorage = createAttachmentStorage()): Promise<AttachmentMetadata[]> {
  const uploads = files ?? [];
  const rules = RULES[kind];
  if (uploads.length > MAX_ATTACHMENTS) throw new AuthError(400, 'ATTACHMENT_LIMIT_EXCEEDED', 'Você pode anexar no máximo 5 arquivos.');
  const stored: AttachmentMetadata[] = [];
  try {
    for (const file of uploads) {
      const allowedExtensions = rules.allowed[file.mimetype];
      if (!allowedExtensions || !allowedExtensions.includes(extension(file.originalname))) {
        throw new AuthError(400, 'INVALID_ATTACHMENT_TYPE', rules.message);
      }
      if (file.size > rules.maxBytes) {
        throw new AuthError(400, 'ATTACHMENT_TOO_LARGE', `Cada anexo deve ter no máximo ${rules.maxLabel}.`);
      }
      const storedFile = await storage.store({ buffer: file.buffer, originalName: file.originalname });
      stored.push({
        id: randomUUID(),
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        status: 'active',
        storageKey: storedFile.storageKey,
      });
    }
    return stored;
  } catch (error) {
    await cleanupStoredAttachments(stored, storage);
    throw error;
  }
}
