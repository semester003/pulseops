import { OrganizationRole } from '@prisma/client';
import { Router } from 'express';

import { listIncidents } from '../controllers/incident.controller.js';
import {
  addOrganizationMember,
  createOrganization,
  getOrganization,
  listOrganizationMembers,
  removeOrganizationMember,
  updateOrganization,
  updateOrganizationMember,
} from '../controllers/organization.controller.js';
import { createService, listServices } from '../controllers/service.controller.js';
import { createTeam, listTeams } from '../controllers/team.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { organizationIdFromParams, requireOrganizationRole } from '../middleware/authorize.js';
import { asyncHandler, validate } from '../middleware/validate.js';
import {
  addOrganizationMemberSchema,
  createOrganizationSchema,
  createServiceSchema,
  createTeamSchema,
  updateOrganizationMemberSchema,
  updateOrganizationSchema,
} from '../schemas/core.schemas.js';

export const organizationRouter = Router();

organizationRouter.use(authenticate);
organizationRouter.post('/', validate(createOrganizationSchema), asyncHandler(createOrganization));

const canRead = requireOrganizationRole(
  organizationIdFromParams,
  OrganizationRole.ADMIN,
  OrganizationRole.RESPONDER,
  OrganizationRole.VIEWER,
);
const isAdmin = requireOrganizationRole(organizationIdFromParams, OrganizationRole.ADMIN);

organizationRouter.get('/:organizationId', canRead, asyncHandler(getOrganization));
organizationRouter.patch('/:organizationId', isAdmin, validate(updateOrganizationSchema), asyncHandler(updateOrganization));
organizationRouter.get('/:organizationId/members', canRead, asyncHandler(listOrganizationMembers));
organizationRouter.get('/:organizationId/teams', canRead, asyncHandler(listTeams));
organizationRouter.post('/:organizationId/teams', isAdmin, validate(createTeamSchema), asyncHandler(createTeam));
organizationRouter.get('/:organizationId/services', canRead, asyncHandler(listServices));
organizationRouter.get('/:organizationId/incidents', canRead, asyncHandler(listIncidents));
organizationRouter.post(
  '/:organizationId/services',
  isAdmin,
  validate(createServiceSchema),
  asyncHandler(createService),
);
organizationRouter.post(
  '/:organizationId/members',
  isAdmin,
  validate(addOrganizationMemberSchema),
  asyncHandler(addOrganizationMember),
);
organizationRouter.patch(
  '/:organizationId/members/:memberId',
  isAdmin,
  validate(updateOrganizationMemberSchema),
  asyncHandler(updateOrganizationMember),
);
organizationRouter.delete('/:organizationId/members/:memberId', isAdmin, asyncHandler(removeOrganizationMember));
