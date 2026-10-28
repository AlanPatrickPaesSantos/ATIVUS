import { describe, expect, it, vi } from 'vitest';

import { AuthError } from '../auth/sessionService.js';
import { readOperationalMaintenanceWindow } from '../repositories/operationalMaintenanceRepository.js';
import { requireOperationalWritesOpen } from './operationalWriteGate.js';

vi.mock('../repositories/operationalMaintenanceRepository.js', () => ({ readOperationalMaintenanceWindow: vi.fn() }));

describe('operational write gate', () => {
  it('fails closed when the shared state cannot be read', async () => {
    vi.mocked(readOperationalMaintenanceWindow).mockRejectedValue(new Error('database unavailable'));
    const next = vi.fn();

    await requireOperationalWritesOpen({} as never, {} as never, next);

    const error = next.mock.calls[0][0] as AuthError;
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('OPERATIONAL_MAINTENANCE_UNAVAILABLE');
  });

  it('returns 503 while the shared window is active', async () => {
    vi.mocked(readOperationalMaintenanceWindow).mockResolvedValue({ active: true, reason: 'Índices', actorId: 'admin-1', activatedAt: new Date(), deactivatedAt: null, revision: 1 });
    const next = vi.fn();

    await requireOperationalWritesOpen({} as never, {} as never, next);

    const error = next.mock.calls[0][0] as AuthError;
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('OPERATIONAL_MAINTENANCE_ACTIVE');
    expect(error.message).toBe('Operações patrimoniais temporariamente bloqueadas para manutenção.');
  });
});
