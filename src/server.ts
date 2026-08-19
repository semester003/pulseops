import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { logger } from './utils/logger.js';

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'PulseOps API listening');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down API');
  server.close((error) => {
    void prisma.$disconnect().finally(() => process.exit(error ? 1 : 0));
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
