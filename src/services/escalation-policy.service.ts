import { prisma } from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

export class EscalationPolicyService {
  public async upsert(teamId: string, acknowledgementTimeoutMin: number) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) throw new NotFoundError('Team');

    return prisma.escalationPolicy.upsert({
      where: { teamId },
      create: { teamId, acknowledgementTimeoutMin },
      update: { acknowledgementTimeoutMin },
    });
  }

  public async get(teamId: string) {
    const policy = await prisma.escalationPolicy.findUnique({ where: { teamId } });
    if (!policy) throw new NotFoundError('Escalation policy');
    return policy;
  }
}
