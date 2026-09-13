import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRunbook() {
  return await readFile(new URL('../../docs/runbook-homologacao-mongodb.md', import.meta.url), 'utf8');
}

describe('homologation runbook', () => {
  it('documents an executable local homologation flow without exposing MongoDB secrets', async () => {
    const runbook = await readRunbook();

    expect(runbook).toContain('npm run ops:homolog:verify');
    expect(runbook).toContain('npm run ops:homolog:bootstrap');
    expect(runbook).toContain('npm run migrate:user-situation -- --dry-run --report');
    expect(runbook).toContain('npm run ops:homolog:bootstrap -- --seed-non-prod');
    expect(runbook).toContain('$env:PORT="3010"');
    expect(runbook).toContain('$env:SESSION_COOKIE_SECURE="false"');
    expect(runbook).toContain('$env:ALLOWED_ORIGINS=');
    expect(runbook).toContain('http://localhost:3010/api/v1/health');
    expect(runbook).toContain('http://localhost:3010/api/v1/readiness');
    expect(runbook).toContain('mongodump --uri="$env:MONGODB_URI"');
    expect(runbook).toContain('mongorestore --uri="$env:MONGODB_URI" --drop');
    expect(runbook).toContain('Nunca imprima, copie ou registre o valor completo de `MONGODB_URI`');
    expect(runbook).not.toMatch(/MONGODB_URI=mongodb:\/\/[^`\s]+/);
  });
});
