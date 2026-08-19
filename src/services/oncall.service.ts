import { Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

interface ScheduleInput {
  rotationStartAt?: Date | undefined;
  rotationPeriodMinutes: number;
}

export interface RotationMember {
  position: number;
  user: { id: string; email: string; displayName: string };
}

export function currentRotationIndex(
  rotationStartAt: Date,
  rotationPeriodMinutes: number,
  memberCount: number,
  now: Date,
): number {
  if (memberCount < 1) throw new ConflictError('The on-call rotation has no members.');
  const elapsedMilliseconds = Math.max(0, now.getTime() - rotationStartAt.getTime());
  const elapsedPeriods = Math.floor(elapsedMilliseconds / (rotationPeriodMinutes * 60_000));
  return elapsedPeriods % memberCount;
}

export class OnCallService {
  public async createSchedule(teamId: string, input: ScheduleInput) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) throw new NotFoundError('Team');

    const existing = await prisma.onCallSchedule.findUnique({ where: { teamId }, select: { id: true } });
    if (existing) throw new ConflictError('This team already has an on-call schedule.');

    return prisma.onCallSchedule.create({
      data: {
        teamId,
        rotationPeriodMinutes: input.rotationPeriodMinutes,
        ...(input.rotationStartAt === undefined ? {} : { rotationStartAt: input.rotationStartAt }),
      },
      include: { members: { include: { user: { select: { id: true, email: true, displayName: true } } } } },
    });
  }

  public async getSchedule(teamId: string) {
    const schedule = await prisma.onCallSchedule.findUnique({
      where: { teamId },
      include: {
        members: {
          orderBy: { position: 'asc' },
          include: { user: { select: { id: true, email: true, displayName: true } } },
        },
      },
    });
    if (!schedule) throw new NotFoundError('On-call schedule');
    return schedule;
  }

  public async addMember(teamId: string, userId: string) {
    return prisma.$transaction(
      async (transaction) => {
        const schedule = await transaction.onCallSchedule.findUnique({
          where: { teamId },
          select: { id: true },
        });
        if (!schedule) throw new NotFoundError('On-call schedule');

        const isTeamMember = await transaction.teamMember.findUnique({
          where: { teamId_userId: { teamId, userId } },
          select: { id: true },
        });
        if (!isTeamMember) {
          throw new ConflictError('Only a member of the team can join its on-call rotation.');
        }

        const existing = await transaction.onCallMember.findUnique({
          where: { scheduleId_userId: { scheduleId: schedule.id, userId } },
          select: { id: true },
        });
        if (existing) throw new ConflictError('This user is already in the on-call rotation.');

        const last = await transaction.onCallMember.findFirst({
          where: { scheduleId: schedule.id },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        return transaction.onCallMember.create({
          data: { scheduleId: schedule.id, userId, position: (last?.position ?? -1) + 1 },
          include: { user: { select: { id: true, email: true, displayName: true } } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async removeMember(teamId: string, userId: string) {
    await prisma.$transaction(
      async (transaction) => {
        const schedule = await transaction.onCallSchedule.findUnique({ where: { teamId }, select: { id: true } });
        if (!schedule) throw new NotFoundError('On-call schedule');

        const member = await transaction.onCallMember.findUnique({
          where: { scheduleId_userId: { scheduleId: schedule.id, userId } },
          select: { id: true, position: true },
        });
        if (!member) throw new NotFoundError('On-call member');

        await transaction.onCallMember.delete({ where: { id: member.id } });
        const laterMembers = await transaction.onCallMember.findMany({
          where: { scheduleId: schedule.id, position: { gt: member.position } },
          orderBy: { position: 'asc' },
          select: { id: true, position: true },
        });
        for (const laterMember of laterMembers) {
          await transaction.onCallMember.update({
            where: { id: laterMember.id },
            data: { position: laterMember.position - 1 },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async getCurrentResponder(teamId: string, now = new Date()) {
    const schedule = await this.getSchedule(teamId);
    const member = rotationMemberForStep(schedule, 0, now);
    return { scheduleId: schedule.id, rotationIndex: member.position, responder: member.user };
  }

  public async getResponderForEscalationStep(teamId: string, createdAt: Date, step: number) {
    const schedule = await this.getSchedule(teamId);
    return rotationMemberForStep(schedule, step, createdAt);
  }
}

export function rotationMemberForStep(
  schedule: { rotationStartAt: Date; rotationPeriodMinutes: number; members: RotationMember[] },
  step: number,
  referenceTime: Date,
): RotationMember {
  const baseIndex = currentRotationIndex(
    schedule.rotationStartAt,
    schedule.rotationPeriodMinutes,
    schedule.members.length,
    referenceTime,
  );
  const index = baseIndex + step;
  if (index >= schedule.members.length) {
    throw new ConflictError('The on-call rotation is exhausted without acknowledgement.');
  }
  const member = schedule.members[index];
  if (!member) throw new ConflictError('The on-call rotation has no members.');
  return member;
}
