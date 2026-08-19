import { prisma } from '../config/prisma.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

interface TeamInput {
  name?: string | undefined;
  description?: string | undefined;
}

export class TeamService {
  public async create(organizationId: string, input: TeamInput & { name: string }) {
    return prisma.team.create({
      data: {
        organizationId,
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
      },
    });
  }

  public async list(organizationId: string) {
    return prisma.team.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true, services: true } } },
    });
  }

  public async get(teamId: string) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        _count: { select: { members: true, services: true } },
        onCallSchedule: { select: { id: true } },
        escalationPolicy: { select: { id: true } },
      },
    });
    if (!team) {
      throw new NotFoundError('Team');
    }
    return team;
  }

  public async update(teamId: string, input: TeamInput) {
    return prisma.team.update({
      where: { id: teamId },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
      },
    });
  }

  public async remove(teamId: string) {
    await prisma.team.delete({ where: { id: teamId } });
  }

  public async addMember(teamId: string, userId: string) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { organizationId: true } });
    if (!team) {
      throw new NotFoundError('Team');
    }
    const organizationMember = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: team.organizationId, userId } },
      select: { id: true },
    });
    if (!organizationMember) {
      throw new ConflictError('A user must belong to the organization before joining a team.');
    }

    const existing = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError('This user is already a team member.');
    }

    return prisma.teamMember.create({
      data: { teamId, userId },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
  }

  public async removeMember(teamId: string, userId: string) {
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundError('Team member');
    }
    await prisma.teamMember.delete({ where: { id: member.id } });
  }

  public async listMembers(teamId: string) {
    await this.get(teamId);
    return prisma.teamMember.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }
}
