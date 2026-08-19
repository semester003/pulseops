import { prisma } from '../config/prisma.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

interface ServiceInput {
  name?: string | undefined;
  description?: string | undefined;
  teamId?: string | undefined;
}

export class ServiceService {
  public async create(
    organizationId: string,
    input: ServiceInput & { name: string; teamId: string },
  ) {
    await this.assertTeamInOrganization(input.teamId, organizationId);
    return prisma.service.create({
      data: {
        organizationId,
        teamId: input.teamId,
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
      },
      include: { team: { select: { id: true, name: true } } },
    });
  }

  public async list(organizationId: string) {
    return prisma.service.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: { team: { select: { id: true, name: true } } },
    });
  }

  public async get(serviceId: string) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { team: { select: { id: true, name: true } } },
    });
    if (!service) {
      throw new NotFoundError('Service');
    }
    return service;
  }

  public async update(serviceId: string, input: ServiceInput) {
    const current = await this.get(serviceId);
    if (input.teamId) {
      await this.assertTeamInOrganization(input.teamId, current.organizationId);
    }
    return prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.teamId === undefined ? {} : { teamId: input.teamId }),
      },
      include: { team: { select: { id: true, name: true } } },
    });
  }

  public async remove(serviceId: string) {
    const incidentCount = await prisma.incident.count({ where: { serviceId } });
    if (incidentCount > 0) {
      throw new ConflictError('A service with incidents cannot be deleted.');
    }
    await prisma.service.delete({ where: { id: serviceId } });
  }

  private async assertTeamInOrganization(teamId: string, organizationId: string) {
    const team = await prisma.team.findFirst({ where: { id: teamId, organizationId }, select: { id: true } });
    if (!team) {
      throw new ConflictError('The selected team does not belong to this organization.');
    }
  }
}
