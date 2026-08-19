import { Worker } from 'bullmq';

import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { INCIDENT_QUEUE_NAME, type IncidentQueueJob } from '../queues/incident.queue.js';
import { IncidentService } from '../services/incident.service.js';
import { logger } from '../utils/logger.js';

const incidentService = new IncidentService();

const worker = new Worker<IncidentQueueJob, void, 'notification' | 'escalation'>(
  INCIDENT_QUEUE_NAME,
  async (job) => {
    if (job.data.kind === 'notification') {
      await incidentService.processNotification(job.data.deliveryId);
      return;
    }

    await incidentService.processEscalation(job.data.incidentId, job.data.expectedStep);
  },
  {
    connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
    concurrency: 10,
  },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, name: job.name }, 'Incident worker job completed');
});

worker.on('failed', (job, error) => {
  logger.error({ err: error, jobId: job?.id, name: job?.name }, 'Incident worker job failed');
  if (job?.data.kind === 'notification' && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void incidentService.markDeliveryFailed(job.data.deliveryId, error);
  }
});

async function start() {
  const reconciled = await incidentService.reconcilePendingNotifications();
  logger.info({ reconciled }, 'PulseOps worker started');
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down incident worker');
  await worker.close();
  await prisma.$disconnect();
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM').finally(() => process.exit(0));
});
process.once('SIGINT', () => {
  void shutdown('SIGINT').finally(() => process.exit(0));
});

void start().catch(async (error: unknown) => {
  logger.fatal({ err: error }, 'Worker startup failed');
  await worker.close();
  await prisma.$disconnect();
  process.exit(1);
});
