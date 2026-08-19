import {
  DeliveryStatus,
  IncidentSeverity,
  IncidentStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { notificationProvider } from '../providers/notification.provider.js';
import { enqueueNotification, scheduleEscalation } from '../queues/incident.queue.js';
import {
  ConflictError,
  NotFoundError,
  StateTransitionError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

import { currentRotationIndex, type RotationMember } from './oncall.service.js';

interface CreateIncidentInput {
  title: string;
  description?: string | undefined;
  severity: IncidentSeverity;
}

interface UpdateIncidentInput {
  title?: string | undefined;
  description?: string | null | undefined;
  severity?: IncidentSeverity | undefined;
}

interface IncidentFilters {
  status?: IncidentStatus | undefined;
  severity?: IncidentSeverity | undefined;
  serviceId?: string | undefined;
}

type IncidentTransaction = Prisma.TransactionClient;

const deliveryLeaseMilliseconds = 15_000;
const maxSerializableAttempts = 3;

const responseInclude = {
  service: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  currentResponder: { select: { id: true, email: true, displayName: true } },
  acknowledgedBy: { select: { id: true, email: true, displayName: true } },
  resolvedBy: { select: { id: true, email: true, displayName: true } },
} as const;

type EscalationResult =
  | { kind: 'ignored' }
  | { kind: 'exhausted'; incidentId: string }
  | {
      kind: 'advanced';
      incidentId: string;
      deliveryId: string;
      acknowledgementTimeoutMin: number;
      step: number;
    };

export class IncidentService {
  public async create(serviceId: string, input: CreateIncidentInput) {
    const created = await this.withSerializableRetry(async (transaction) => {
      const service = await transaction.service.findUnique({
        where: { id: serviceId },
        include: {
          team: {
            include: {
              escalationPolicy: true,
              onCallSchedule: {
                include: {
                  members: {
                    orderBy: { position: 'asc' },
                    include: { user: { select: { id: true, email: true, displayName: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (!service) throw new NotFoundError('Service');
      if (!service.team.escalationPolicy) {
        throw new ConflictError('The responsible team requires an escalation policy before incidents can be created.');
      }
      if (!service.team.onCallSchedule) {
        throw new ConflictError('The responsible team requires an on-call schedule before incidents can be created.');
      }

      const now = new Date();
      const initialResponder = this.selectResponder(service.team.onCallSchedule, 0, now);
      const incident = await transaction.incident.create({
        data: {
          organizationId: service.organizationId,
          serviceId: service.id,
          teamId: service.teamId,
          title: input.title,
          ...(input.description === undefined ? {} : { description: input.description }),
          severity: input.severity,
          currentResponderId: initialResponder.user.id,
          deliveries: {
            create: { recipientId: initialResponder.user.id, step: 0 },
          },
        },
        include: {
          ...responseInclude,
          deliveries: { where: { step: 0 }, select: { id: true } },
        },
      });

      const delivery = incident.deliveries[0];
      if (!delivery) throw new ConflictError('Initial incident notification could not be prepared.');
      return {
        incident,
        deliveryId: delivery.id,
        acknowledgementTimeoutMin: service.team.escalationPolicy.acknowledgementTimeoutMin,
      };
    });

    await this.enqueueInitialWork(
      created.incident.id,
      created.deliveryId,
      created.acknowledgementTimeoutMin,
    );
    return created.incident;
  }

  public async list(organizationId: string, filters: IncidentFilters) {
    return prisma.incident.findMany({
      where: {
        organizationId,
        ...(filters.status === undefined ? {} : { status: filters.status }),
        ...(filters.severity === undefined ? {} : { severity: filters.severity }),
        ...(filters.serviceId === undefined ? {} : { serviceId: filters.serviceId }),
      },
      orderBy: { createdAt: 'desc' },
      include: responseInclude,
    });
  }

  public async get(incidentId: string) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { ...responseInclude, deliveries: { orderBy: { step: 'asc' } } },
    });
    if (!incident) throw new NotFoundError('Incident');
    return incident;
  }

  public async update(incidentId: string, input: UpdateIncidentInput) {
    const incident = await this.get(incidentId);
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new StateTransitionError('Resolved incidents cannot be updated.');
    }
    return prisma.incident.update({
      where: { id: incidentId },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.severity === undefined ? {} : { severity: input.severity }),
      },
      include: responseInclude,
    });
  }

  public async acknowledge(incidentId: string, userId: string) {
    const result = await prisma.incident.updateMany({
      where: { id: incidentId, status: IncidentStatus.TRIGGERED },
      data: {
        status: IncidentStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedById: userId,
      },
    });
    if (result.count !== 1) {
      const incident = await this.get(incidentId);
      if (incident.status === IncidentStatus.RESOLVED) {
        throw new StateTransitionError('Resolved incidents cannot be acknowledged.');
      }
      throw new StateTransitionError('Only triggered incidents can be acknowledged.');
    }
    logger.info({ incidentId, userId }, 'Incident acknowledged; future escalation will stop');
    return this.get(incidentId);
  }

  public async resolve(incidentId: string, userId: string) {
    const result = await prisma.incident.updateMany({
      where: { id: incidentId, status: { in: [IncidentStatus.TRIGGERED, IncidentStatus.ACKNOWLEDGED] } },
      data: { status: IncidentStatus.RESOLVED, resolvedAt: new Date(), resolvedById: userId },
    });
    if (result.count !== 1) {
      const incident = await this.get(incidentId);
      if (incident.status === IncidentStatus.RESOLVED) {
        throw new StateTransitionError('An incident cannot be resolved more than once.');
      }
      throw new StateTransitionError('This incident cannot be resolved from its current state.');
    }
    logger.info({ incidentId, userId }, 'Incident resolved; future escalation will stop');
    return this.get(incidentId);
  }

  public async processNotification(deliveryId: string) {
    const leaseExpiresBefore = new Date(Date.now() - deliveryLeaseMilliseconds);
    const claimed = await prisma.notificationDelivery.updateMany({
      where: {
        id: deliveryId,
        OR: [
          { status: DeliveryStatus.PENDING },
          { status: DeliveryStatus.PROCESSING, processingStartedAt: { lt: leaseExpiresBefore } },
        ],
      },
      data: {
        status: DeliveryStatus.PROCESSING,
        processingStartedAt: new Date(),
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });
    if (claimed.count === 0) {
      return { delivered: false, reason: 'already-claimed-or-sent' };
    }

    try {
      const delivery = await prisma.notificationDelivery.findUnique({
        where: { id: deliveryId },
        include: {
          recipient: { select: { id: true, email: true, displayName: true } },
          incident: { select: { id: true, title: true, severity: true } },
        },
      });
      if (!delivery) throw new NotFoundError('Notification delivery');

      await notificationProvider.send({
        incidentId: delivery.incident.id,
        incidentTitle: delivery.incident.title,
        severity: delivery.incident.severity,
        recipient: delivery.recipient,
        escalationStep: delivery.step,
      });

      await prisma.notificationDelivery.updateMany({
        where: { id: deliveryId, status: DeliveryStatus.PROCESSING },
        data: { status: DeliveryStatus.SENT, sentAt: new Date(), processingStartedAt: null },
      });
      logger.info({ deliveryId, incidentId: delivery.incident.id }, 'Notification job completed');
      return { delivered: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown notification provider error';
      await prisma.notificationDelivery.updateMany({
        where: { id: deliveryId, status: DeliveryStatus.PROCESSING },
        data: { status: DeliveryStatus.PENDING, processingStartedAt: null, lastError: message },
      });
      throw error;
    }
  }

  public async markDeliveryFailed(deliveryId: string, error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown worker error';
    await prisma.notificationDelivery.updateMany({
      where: { id: deliveryId, status: { not: DeliveryStatus.SENT } },
      data: { status: DeliveryStatus.FAILED, processingStartedAt: null, lastError: message },
    });
  }

  public async processEscalation(incidentId: string, expectedStep: number): Promise<EscalationResult> {
    const result = await this.withSerializableRetry(async (transaction) => {
      const incident = await transaction.incident.findUnique({
        where: { id: incidentId },
        include: {
          team: {
            include: {
              escalationPolicy: true,
              onCallSchedule: {
                include: {
                  members: {
                    orderBy: { position: 'asc' },
                    include: { user: { select: { id: true, email: true, displayName: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (!incident || incident.status !== IncidentStatus.TRIGGERED || incident.escalationStep !== expectedStep) {
        return { kind: 'ignored' } as const;
      }
      if (!incident.team.escalationPolicy || !incident.team.onCallSchedule) {
        return { kind: 'exhausted', incidentId } as const;
      }

      const nextStep = expectedStep + 1;
      const schedule = incident.team.onCallSchedule;
      const baseIndex = currentRotationIndex(
        schedule.rotationStartAt,
        schedule.rotationPeriodMinutes,
        schedule.members.length,
        incident.createdAt,
      );
      const nextMember = schedule.members[baseIndex + nextStep];
      if (!nextMember) {
        return { kind: 'exhausted', incidentId } as const;
      }

      const updated = await transaction.incident.updateMany({
        where: { id: incidentId, status: IncidentStatus.TRIGGERED, escalationStep: expectedStep },
        data: { currentResponderId: nextMember.user.id, escalationStep: nextStep },
      });
      if (updated.count !== 1) return { kind: 'ignored' } as const;

      const delivery = await transaction.notificationDelivery.create({
        data: { incidentId, recipientId: nextMember.user.id, step: nextStep },
        select: { id: true },
      });
      return {
        kind: 'advanced',
        incidentId,
        deliveryId: delivery.id,
        acknowledgementTimeoutMin: incident.team.escalationPolicy.acknowledgementTimeoutMin,
        step: nextStep,
      } as const;
    });

    if (result.kind === 'advanced') {
      await this.enqueueEscalationWork(
        result.incidentId,
        result.deliveryId,
        result.step,
        result.acknowledgementTimeoutMin,
      );
      logger.info({ incidentId, step: result.step }, 'Incident escalated to next responder');
    } else if (result.kind === 'exhausted') {
      logger.warn({ incidentId, expectedStep }, 'Incident escalation stopped because rotation is exhausted');
    }
    return result;
  }

  public async reconcilePendingNotifications(limit = 100) {
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { status: DeliveryStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    await Promise.all(deliveries.map((delivery) => enqueueNotification(delivery.id)));
    return deliveries.length;
  }

  private async enqueueInitialWork(
    incidentId: string,
    deliveryId: string,
    acknowledgementTimeoutMin: number,
  ) {
    try {
      await Promise.all([
        enqueueNotification(deliveryId),
        scheduleEscalation(incidentId, 0, acknowledgementTimeoutMin),
      ]);
    } catch (error) {
      logger.error({ err: error, incidentId, deliveryId }, 'Queue enqueue failed; pending delivery will be reconciled by worker');
    }
  }

  private async enqueueEscalationWork(
    incidentId: string,
    deliveryId: string,
    step: number,
    acknowledgementTimeoutMin: number,
  ) {
    try {
      await Promise.all([
        enqueueNotification(deliveryId),
        scheduleEscalation(incidentId, step, acknowledgementTimeoutMin),
      ]);
    } catch (error) {
      logger.error({ err: error, incidentId, deliveryId, step }, 'Escalation queue enqueue failed; pending delivery will be reconciled by worker');
    }
  }

  private selectResponder(
    schedule: {
      rotationStartAt: Date;
      rotationPeriodMinutes: number;
      members: RotationMember[];
    },
    step: number,
    referenceTime: Date,
  ) {
    const baseIndex = currentRotationIndex(
      schedule.rotationStartAt,
      schedule.rotationPeriodMinutes,
      schedule.members.length,
      referenceTime,
    );
    const member = schedule.members[baseIndex + step];
    if (!member) throw new ConflictError('The on-call rotation is exhausted without acknowledgement.');
    return member;
  }

  private async withSerializableRetry<T>(work: (transaction: IncidentTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= maxSerializableAttempts; attempt += 1) {
      try {
        return await prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const isSerializationFailure =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!isSerializationFailure || attempt === maxSerializableAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 25));
      }
    }
    throw new Error('Transaction retry loop exited unexpectedly.');
  }
}
