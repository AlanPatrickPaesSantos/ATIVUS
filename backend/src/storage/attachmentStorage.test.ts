import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAttachmentStorage, LocalAttachmentStorage, type AttachmentStorage } from './attachmentStorage.js';

describe('LocalAttachmentStorage', () => {
  let tempRoot: string | null = null;

  async function makeRoots() {
    tempRoot = await mkdtemp(join(tmpdir(), 'sigat-storage-containment-'));
    const storageRoot = join(tempRoot, 'attachments');
    const outsidePath = join(tempRoot, 'outside.txt');
    await writeFile(outsidePath, 'outside');
    return { storageRoot, outsidePath };
  }

  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it('rejects read and delete storage keys that escape the configured root', async () => {
    const { storageRoot, outsidePath } = await makeRoots();
    const storage = new LocalAttachmentStorage(storageRoot);

    await expect(storage.read('../outside.txt')).rejects.toThrow('Invalid attachment storage key');
    await expect(storage.delete('../outside.txt')).rejects.toThrow('Invalid attachment storage key');
    await expect(readFile(outsidePath, 'utf8')).resolves.toBe('outside');
  });
});

describe('createAttachmentStorage', () => {
  const DRIVER = 'ATTACHMENT_STORAGE_DRIVER';
  const DIR = 'ATTACHMENT_STORAGE_DIR';
  const LEGACY_DIR = 'SIGAT_ATTACHMENT_STORAGE_DIR';
  let envBackup: NodeJS.ProcessEnv;

  beforeEach(() => {
    envBackup = { ...process.env };
    delete process.env[DRIVER];
    delete process.env[DIR];
    delete process.env[LEGACY_DIR];
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('returns LocalAttachmentStorage when no driver is configured', () => {
    const storage = createAttachmentStorage();
    expect(storage).toBeInstanceOf(LocalAttachmentStorage);
  });

  it('returns LocalAttachmentStorage when the driver is local', () => {
    process.env[DRIVER] = 'local';
    const storage = createAttachmentStorage();
    expect(storage).toBeInstanceOf(LocalAttachmentStorage);
  });

  it('rejects an unknown driver', () => {
    process.env[DRIVER] = 'ftp';
    expect(() => createAttachmentStorage()).toThrow(/ATTACHMENT_STORAGE_DRIVER|ftp/i);
  });

  it('rejects s3 when it is not implemented yet', () => {
    process.env[DRIVER] = 's3';
    expect(() => createAttachmentStorage()).toThrow(/não implementado|not implemented|s3/i);
  });

  it('respects the configured storage dir through the local provider', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'sigat-storage-dir-'));

    try {
      process.env[DIR] = tempRoot;
      const storage: AttachmentStorage = createAttachmentStorage();
      const stored = await storage.store({ buffer: Buffer.from('conteudo'), originalName: 'anexo.txt' });
      const filesOnDisk = await readdir(tempRoot);
      expect(filesOnDisk).toEqual([stored.storageKey]);
      await expect(storage.read(stored.storageKey)).resolves.toEqual(Buffer.from('conteudo'));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
