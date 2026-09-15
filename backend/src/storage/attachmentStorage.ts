import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

export interface StoredAttachment {
  storageKey: string;
}

export interface AttachmentStorage {
  store(input: { buffer: Buffer; originalName: string }): Promise<StoredAttachment>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

function storageRoot() {
  return resolve(
    process.env.ATTACHMENT_STORAGE_DIR
    ?? process.env.SIGAT_ATTACHMENT_STORAGE_DIR
    ?? resolve(process.cwd(), 'var', 'attachments'),
  );
}

function extensionFor(name: string) {
  const extension = extname(name).toLocaleLowerCase();
  return /^[.][a-z0-9]+$/.test(extension) ? extension : '';
}

function safePath(root: string, storageKey: string) {
  if (!storageKey || storageKey.includes('\0')) throw new Error('Invalid attachment storage key');
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, storageKey);
  const relation = relative(resolvedRoot, target);
  if (!relation || relation.startsWith('..') || isAbsolute(relation)) throw new Error('Invalid attachment storage key');
  return target;
}

export class LocalAttachmentStorage implements AttachmentStorage {
  constructor(private readonly root = storageRoot()) {}

  async store(input: { buffer: Buffer; originalName: string }): Promise<StoredAttachment> {
    await mkdir(this.root, { recursive: true });
    const storageKey = `${randomUUID()}${extensionFor(input.originalName)}`;
    await writeFile(safePath(this.root, storageKey), input.buffer, { flag: 'wx' });
    return { storageKey };
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(safePath(this.root, storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await rm(safePath(this.root, storageKey), { force: true });
  }
}

export function createAttachmentStorage(): AttachmentStorage {
  const driver = process.env.ATTACHMENT_STORAGE_DRIVER ?? 'local';
  if (driver === 'local') return new LocalAttachmentStorage();
  if (driver === 's3') {
    throw new Error('ATTACHMENT_STORAGE_DRIVER=s3 ainda não implementado: nenhuma credencial S3 foi fornecida ou conectada.');
  }
  throw new Error(`ATTACHMENT_STORAGE_DRIVER inválido: ${driver}. Use "local" (ou "s3" quando implementado).`);
}
