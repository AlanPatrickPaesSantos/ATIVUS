import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';

import { AuthError } from '../auth/sessionService.js';

type AttachmentUploadOptions = {
  maxFileSizeBytes: number;
  maxFileSizeLabel: string;
  maxFiles?: number;
  maxParts: number;
  fieldSizeBytes?: number;
};

const DEFAULT_MAX_FILES = 5;
const DEFAULT_FIELD_SIZE_BYTES = 64 * 1024;

export function createAttachmentUpload(options: AttachmentUploadOptions): RequestHandler {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: options.maxFileSizeBytes,
      files: maxFiles,
      parts: options.maxParts,
      fieldSize: options.fieldSizeBytes ?? DEFAULT_FIELD_SIZE_BYTES,
    },
  }).array('attachments', maxFiles);

  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(new AuthError(400, 'ATTACHMENT_TOO_LARGE', `Cada anexo deve ter no máximo ${options.maxFileSizeLabel}.`));
          return;
        }
        if (['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE', 'LIMIT_PART_COUNT'].includes(error.code)) {
          next(new AuthError(400, 'ATTACHMENT_LIMIT_EXCEEDED', `Você pode anexar no máximo ${maxFiles} arquivos.`));
          return;
        }
        if (error.code === 'LIMIT_FIELD_VALUE') {
          next(new AuthError(400, 'INVALID_ATTACHMENT_UPLOAD', 'Campo multipart excede o tamanho permitido.'));
          return;
        }
      }
      next(error);
    });
  };
}
