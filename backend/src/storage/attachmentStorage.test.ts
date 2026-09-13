import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalAttachmentStorage } from './attachmentStorage.js';

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
