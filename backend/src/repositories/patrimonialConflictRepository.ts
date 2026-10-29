import type { ClientSession } from 'mongoose';

import { AC_RETURN_ACTIVE_STATUSES, AcReturnModel } from '../models/AcReturn.js';
import { MovementModel, MOVEMENT_ACTIVE_STATUSES } from '../models/Movement.js';
import { PatrimonialOperationLockModel, type PatrimonialOperationKind } from '../models/PatrimonialOperationLock.js';

export class PatrimonialConflictError extends Error {
  constructor(message = 'O equipamento já possui uma movimentação patrimonial pendente.') {
    super(message);
    this.name = 'PatrimonialConflictError';
  }
}

export async function assertNoPendingPatrimonialOperation(equipmentId: string, session?: ClientSession) {
  const movementQuery = MovementModel.exists({ equipmentId, status: { $in: MOVEMENT_ACTIVE_STATUSES } });
  const returnQuery = AcReturnModel.exists({ equipmentId, status: { $in: AC_RETURN_ACTIVE_STATUSES } });
  if (session) {
    movementQuery.session(session);
    returnQuery.session(session);
  }
  const [movement, acReturn] = await Promise.all([movementQuery, returnQuery]);
  if (movement || acReturn) throw new PatrimonialConflictError();
}

export async function acquirePatrimonialOperationLock(equipmentId: string, operationId: string, kind: PatrimonialOperationKind, session: ClientSession) {
  try {
    await PatrimonialOperationLockModel.create([{ equipmentId, operationId, kind }], { session });
  } catch (error: any) {
    if (error?.code === 11000) throw new PatrimonialConflictError();
    throw error;
  }
}

export async function releasePatrimonialOperationLock(operationId: string, session: ClientSession) {
  await PatrimonialOperationLockModel.deleteOne({ operationId }, { session }).exec();
}
