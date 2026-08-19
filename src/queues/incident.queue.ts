import { Queue } from 'bullmq';

import { env } from '../config/env.js';

export const INCIDENT_QUEUE_NAME = 'incident-processing';

type NotificationJob = {
  kind: 'notification';
  deliveryId: string;
};

type EscalationJob = {
  kind: 'escalation';
  incidentId: string;
  expectedStep: number;
};

export type IncidentQueueJob = NotificationJob | EscalationJob;
type IncidentJobName = 'notification' | 'escalation';

export const incidentQueue = new Queue<IncidentQueueJob, void, IncidentJobName>(INCIDENT_QUEUE_NAME, {
  connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { age: 86_400, count: 1_000 },
    removeOnFail: { age: 604_800, count: 5_000 },
  },
});

export async function enqueueNotification(deliveryId: string) {
  return incidentQueue.add(
    'notification',
    { kind: 'notification', deliveryId },
    { jobId: `notification:${deliveryId}` },
  );
}

export async function scheduleEscalation(
  incidentId: string,
  expectedStep: number,
  acknowledgementTimeoutMin: number,
) {
  return incidentQueue.add(
    'escalation',
    { kind: 'escalation', incidentId, expectedStep },
    {
      jobId: `escalation:${incidentId}:${expectedStep}`,
      delay: acknowledgementTimeoutMin * 60_000,
    },
  );
}

export async function closeIncidentQueue() {
  await incidentQueue.close();
}
