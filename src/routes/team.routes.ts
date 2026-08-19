import { OrganizationRole } from '@prisma/client';
import { Router } from 'express';

import {
  addTeamMember,
  getTeam,
  listTeamMembers,
  removeTeam,
  removeTeamMember,
  updateTeam,
} from '../controllers/team.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTeamRole } from '../middleware/resource-authorize.js';
import { asyncHandler, validate } from '../middleware/validate.js';
import { addTeamMemberSchema, updateTeamSchema } from '../schemas/core.schemas.js';

export const teamRouter = Router();

teamRouter.use(authenticate);
const canRead = requireTeamRole(OrganizationRole.ADMIN, OrganizationRole.RESPONDER, OrganizationRole.VIEWER);
const isAdmin = requireTeamRole(OrganizationRole.ADMIN);

teamRouter.get('/:teamId', canRead, asyncHandler(getTeam));
teamRouter.patch('/:teamId', isAdmin, validate(updateTeamSchema), asyncHandler(updateTeam));
teamRouter.delete('/:teamId', isAdmin, asyncHandler(removeTeam));
teamRouter.get('/:teamId/members', canRead, asyncHandler(listTeamMembers));
teamRouter.post('/:teamId/members', isAdmin, validate(addTeamMemberSchema), asyncHandler(addTeamMember));
teamRouter.delete('/:teamId/members/:userId', isAdmin, asyncHandler(removeTeamMember));
