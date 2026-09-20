import { pathToFileURL } from 'node:url';

import { env } from './config/env.js';
import { connectToDatabase } from './database/mongoose.js';
import { createApp } from './app.js';

type StartupLogger = Pick<Console, 'log' | 'error'>;

export interface StartServerOptions {
  app?: Pick<ReturnType<typeof createApp>, 'listen'>;
  connectionString?: string;
  logger?: StartupLogger;
  port?: number;
}

export async function startServer(options: StartServerOptions = {}) {
  const logger = options.logger ?? console;
  const port = options.port ?? env.PORT;
  const connectionString = options.connectionString ?? process.env.MONGODB_URI;

  await connectToDatabase(connectionString);

  const app = options.app ?? createApp();
  const server = app.listen(port, () => {
    logger.log(`ATIVUS backend listening on port ${port}`);
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error('Failed to start ATIVUS backend', error);
    process.exitCode = 1;
  });
}
