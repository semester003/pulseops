import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { incidentRouter } from './routes/incident.routes.js';
import { organizationRouter } from './routes/organization.routes.js';
import { serviceRouter } from './routes/service.routes.js';
import { teamRouter } from './routes/team.routes.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (request) => request.url === '/health' } }));

  app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));
  app.use('/auth', authRouter);
  app.use('/organizations', organizationRouter);
  app.use('/teams', teamRouter);
  app.use('/services', serviceRouter);
  app.use('/incidents', incidentRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
