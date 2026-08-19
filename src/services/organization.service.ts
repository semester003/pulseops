import { OrganizationRole } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

interface CreateOrganizationInput {
  name: string;
}

interface UpdateOrganizationInput {
  name?: string | undefined;
}

export class OrganizationService {
  public async create(userId: string, input: CreateOrganizationInput) {
    return prisma.organization.create({
      data: {
        name: input.name,
        members: { create: { userId, role: OrganizationRole.ADMIN } },
      },
      include: { members: { select: { userId: true, role: true } } },
    });
  }

  public async getById(organizationId: string) {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { _count: { select: { members: true, teams: true, services: true } } },
    });
    if (!organization) {
      throw new NotFoundError('Organization');
    }
    return organization;
  }

  public async update(organizationId: string, input: UpdateOrganizationInput) {
    return prisma.organization.update({
      where: { id: organizationId },
      data: input.name === undefined ? {} : { name: input.name },
    });
  }

  public async listMembers(organizationId: string) {
    return prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  public async addMember(organizationId: string, email: string, role: OrganizationRole) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      throw new NotFoundError('User with the supplied email');
    }

    const existing = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError('This user is already an organization member.');
    }

    return prisma.organizationMember.create({
      data: { organizationId, userId: user.id, role },
      select: {
        id: true,
        role: true,
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  public async updateMemberRole(organizationId: string, memberId: string, role: OrganizationRole) {
    await this.assertAdminCountWillRemain(organizationId, memberId, role);
    return prisma.organizationMember.update({ where: { id: memberId }, data: { role } });
  }

  public async removeMember(organizationId: string, memberId: string) {
    await this.assertAdminCountWillRemain(organizationId, memberId);
    const member = await prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundError('Organization member');
    }
    await prisma.organizationMember.delete({ where: { id: member.id } });
  }

  private async assertAdminCountWillRemain(
    organizationId: string,
    memberId: string,
    nextRole?: OrganizationRole,
  ) {
    const member = await prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      select: { role: true },
    });
    if (!member) {
      throw new NotFoundError('Organization member');
    }
    if (member.role !== OrganizationRole.ADMIN || nextRole === OrganizationRole.ADMIN) {
      return;
    }

    const adminCount = await prisma.organizationMember.count({
      where: { organizationId, role: OrganizationRole.ADMIN },
    });
    if (adminCount <= 1) {
      throw new ConflictError('An organization must retain at least one administrator.');
    }
  }
}
