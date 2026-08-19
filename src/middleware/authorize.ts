import type { OrganizationRole } from '@prisma/client';
import type { RequestHandler } from 'express';

import { prisma } from '../config/prisma.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';

export function requireOrganizationRole(
  organizationIdFromRequest: (request: Parameters<RequestHandler>[0]) => string | undefined,
  ...allowedRoles: OrganizationRole[]
): RequestHandler {
  return async (request, _response, next) => {
    try {
      const userId = request.auth?.userId;
      const organizationId = organizationIdFromRequest(request);

      if (!userId) {
        throw new AuthenticationError();
      }
      if (!organizationId) {
        throw new AuthorizationError('Organization context is required.');
      }

      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
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

export const organizationIdFromParams = (
  request: Parameters<RequestHandler>[0],
): string | undefined => {
  const value = request.params.organizationId;
  return typeof value === 'string' ? value : undefined;
};
