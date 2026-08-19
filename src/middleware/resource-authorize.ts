import type { OrganizationRole } from '@prisma/client';
import type { RequestHandler } from 'express';

import { prisma } from '../config/prisma.js';
import { AuthenticationError, AuthorizationError, NotFoundError } from '../utils/errors.js';

type ResourceType = 'team' | 'service' | 'incident';

function requireResourceRole(
  resource: ResourceType,
  idParameter: string,
  allowedRoles: OrganizationRole[],
): RequestHandler {
  return async (request, _response, next) => {
    try {
      const userId = request.auth?.userId;
      const candidateId = request.params[idParameter];
      const resourceId = typeof candidateId === 'string' ? candidateId : undefined;
      if (!userId) {
        throw new AuthenticationError();
      }
      if (!resourceId) {
        throw new NotFoundError(resource);
      }

      const record =
        resource === 'team'
          ? await prisma.team.findUnique({
              where: { id: resourceId },
              select: { organizationId: true },
            })
          : resource === 'service'
            ? await prisma.service.findUnique({
                where: { id: resourceId },
                select: { organizationId: true },
              })
            : await prisma.incident.findUnique({
                where: { id: resourceId },
                select: { organizationId: true },
              });

      if (!record) {
        const resourceName =
          resource === 'team' ? 'Team' : resource === 'service' ? 'Service' : 'Incident';
        throw new NotFoundError(resourceName);
      }

      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: record.organizationId, userId } },
        select: { role: true },
      });
      if (!membership || !allowedRoles.includes(membership.role)) {
        throw new AuthorizationError();
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireTeamRole = (...roles: OrganizationRole[]) =>
  requireResourceRole('team', 'teamId', roles);

export const requireServiceRole = (...roles: OrganizationRole[]) =>
  requireResourceRole('service', 'serviceId', roles);

export const requireIncidentRole = (...roles: OrganizationRole[]) =>
  requireResourceRole('incident', 'incidentId', roles);
