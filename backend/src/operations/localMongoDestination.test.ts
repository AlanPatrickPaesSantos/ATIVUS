import { describe, expect, it } from 'vitest';

import { validateLocalMongoDestination } from './localMongoDestination.js';

describe('local homologation Mongo destination', () => {
  it('accepts only ativus_homolog on 127.0.0.1:27018 with the requested connection mode', () => {
    const exactUri = 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0';
    expect(validateLocalMongoDestination(exactUri, { requireReplicaSet: 'rs0', requireDirectConnection: true }).valid).toBe(true);
  });

  it('rejects another database, host, port, protocol or missing required query option', () => {
    const invalid = [
      'mongodb://127.0.0.1:27018/ativus?directConnection=true',
      'mongodb://localhost:27018/ativus_homolog?directConnection=true',
      'mongodb://127.0.0.1:27017/ativus_homolog?directConnection=true',
      'mongodb+srv://cluster.example/ativus_homolog?directConnection=true',
      'mongodb://127.0.0.1:27018/ativus_homolog',
      'mongodb://127.0.0.1:27018/ativus_homolog?replicaSet=rs0',
    ];

    for (const uri of invalid) {
      expect(validateLocalMongoDestination(uri, { requireDirectConnection: true }).valid).toBe(false);
    }
    expect(validateLocalMongoDestination('mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0', { requireDirectConnection: true }).valid).toBe(false);
    expect(validateLocalMongoDestination('mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0', { requireReplicaSet: 'rs0' }).valid).toBe(false);
  });
});
