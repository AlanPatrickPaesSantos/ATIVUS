import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import { createLoginRateLimiter } from './auth/loginRateLimiter.js';
import {
  resolveClock,
  resolveLoginRateLimitOptions,
  resolveOriginProtectionOptions,
  type AuthSecurityOptionsInput,
} from './auth/securityOptions.js';
import { AuthError, createSessionService, type SessionService } from './auth/sessionService.js';
import { env } from './config/env.js';
import { readDatabaseReadiness } from './database/mongoose.js';
import { createRequireSession } from './middlewares/requireSession.js';
import { createCorsMiddleware } from './middlewares/corsMiddleware.js';
import { createRequireTrustedOrigin } from './middlewares/requireTrustedOrigin.js';
import { isAuditPersistenceError } from './repositories/auditRepository.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createDashboardRoutes } from './routes/dashboardRoutes.js';
import { createInventoryRoutes } from './routes/inventoryRoutes.js';
import { createCallsRoutes } from './routes/callsRoutes.js';
import { createMovementRoutes } from './routes/movementRoutes.js';
import { createUnitRoutes } from './routes/unitRoutes.js';
import { createEquipmentTypeRoutes } from './routes/equipmentTypeRoutes.js';
import { createMissionRoutes } from './routes/missionRoutes.js';
import { createAdminUserRoutes } from './routes/adminUserRoutes.js';
import { createAuditRoutes } from './routes/auditRoutes.js';
import { createReportRoutes } from './routes/reportRoutes.js';
import { createAttachmentRoutes } from './routes/attachmentRoutes.js';
import { createMaintenanceRoutes } from './routes/maintenanceRoutes.js';

type ErrorLogger = Pick<Console, 'error'>;
export interface CreateAppOptions {
  authSecurity?: AuthSecurityOptionsInput;
  sessionCookieSecure?: boolean;
  sessionService?: SessionService;
}

function isMalformedJsonError(error: unknown): boolean {
  return error instanceof SyntaxError
    && 'type' in error
    && error.type === 'entity.parse.failed';
}

export function createErrorHandler(logger: ErrorLogger = console) {
  return (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      });
      return;
    }

    if (isAuditPersistenceError(error)) {
      res.status(503).json({
        code: 'AUDIT_UNAVAILABLE',
        message: 'Não foi possível registrar auditoria.',
      });
      return;
    }

    if (isMalformedJsonError(error)) {
      res.status(400).json({
        code: 'INVALID_JSON',
        message: 'Corpo JSON inválido.',
      });
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ code: 'ATTACHMENT_TOO_LARGE', message: 'Arquivo excede o tamanho máximo permitido.' });
        return;
      }
      res.status(400).json({ code: 'ATTACHMENT_LIMIT_EXCEEDED', message: 'Você pode anexar no máximo 5 arquivos.' });
      return;
    }

    logger.error('Unhandled server error', error);

    res.status(500).json({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
  };
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const clock = resolveClock(options.authSecurity?.clock);
  const sessionService = options.sessionService ?? createSessionService({
    clock,
    session: options.authSecurity?.session,
  });
  const loginRateLimiter = createLoginRateLimiter(
    resolveLoginRateLimitOptions(options.authSecurity?.loginRateLimit, clock),
  );
  const requireTrustedOrigin = createRequireTrustedOrigin(
    resolveOriginProtectionOptions(options.authSecurity?.originProtection),
  );
  const corsMiddleware = createCorsMiddleware(
    resolveOriginProtectionOptions(options.authSecurity?.originProtection),
  );
  const requireSession = createRequireSession(sessionService);
  const sessionCookieSecure = options.sessionCookieSecure ?? env.SESSION_COOKIE_SECURE;

  app.use(express.json());
  app.use('/api/v1', corsMiddleware);
  app.use('/api/v1', requireTrustedOrigin);

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/v1/readiness', async (_req, res) => {
    const readiness = await readDatabaseReadiness();

    res.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? 'ok' : 'not_ready',
      checks: {
        mongo: readiness.mongo,
      },
    });
  });

  app.use('/api/v1', createAuthRoutes({
    loginRateLimiter,
    requireSession,
    sessionCookieSecure,
    sessionService,
  }));

  app.use('/api/v1', createDashboardRoutes({
    requireSession,
  }));
  app.use('/api/v1', createInventoryRoutes(requireSession));
  app.use('/api/v1', createCallsRoutes(requireSession));
  app.use('/api/v1', createAttachmentRoutes(requireSession));
  app.use('/api/v1', createMaintenanceRoutes(requireSession));
  app.use('/api/v1', createMovementRoutes(requireSession));
  app.use('/api/v1', createUnitRoutes(requireSession));
  app.use('/api/v1', createReportRoutes(requireSession));
  app.use('/api/v1', createAdminUserRoutes(requireSession));
  app.use('/api/v1', createAuditRoutes(requireSession));
  app.use('/api/v1', createEquipmentTypeRoutes(requireSession));
  app.use('/api/v1', createMissionRoutes(requireSession));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Route not found',
    });
  });

  app.use(createErrorHandler());

  return app;
}
