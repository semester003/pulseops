import { OrganizationRole } from '@prisma/client';
import { Router } from 'express';

import {
  addOnCallMember,
  createOnCallSchedule,
  getCurrentResponder,
  getEscalationPolicy,
  getOnCallSchedule,
  removeOnCallMember,
  upsertEscalationPolicy,
} from '../controllers/oncall.controller.js';
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
import {
  addOnCallMemberSchema,
  createOnCallScheduleSchema,
  escalationPolicySchema,
} from '../schemas/incident.schemas.js';

export const teamRouter = Router();

teamRouter.use(authenticate);
const canRead = requireTeamRole(
  OrganizationRole.ADMIN,
  OrganizationRole.RESPONDER,
  OrganizationRole.VIEWER,
);
const isAdmin = requireTeamRole(OrganizationRole.ADMIN);

teamRouter.get('/:teamId', canRead, asyncHandler(getTeam));
teamRouter.patch('/:teamId', isAdmin, validate(updateTeamSchema), asyncHandler(updateTeam));
teamRouter.delete('/:teamId', isAdmin, asyncHandler(removeTeam));
teamRouter.get('/:teamId/members', canRead, asyncHandler(listTeamMembers));
teamRouter.post(
  '/:teamId/members',
  isAdmin,
  validate(addTeamMemberSchema),
  asyncHandler(addTeamMember),
);
teamRouter.delete('/:teamId/members/:userId', isAdmin, asyncHandler(removeTeamMember));

teamRouter.get('/:teamId/on-call-schedule', canRead, asyncHandler(getOnCallSchedule));
teamRouter.post(
  '/:teamId/on-call-schedule',
  isAdmin,
  validate(createOnCallScheduleSchema),
  asyncHandler(createOnCallSchedule),
);
teamRouter.post(
  '/:teamId/on-call-schedule/members',
  isAdmin,
  validate(addOnCallMemberSchema),
  asyncHandler(addOnCallMember),
);
teamRouter.delete(
  '/:teamId/on-call-schedule/members/:userId',
  isAdmin,
  asyncHandler(removeOnCallMember),
);
teamRouter.get(
  '/:teamId/on-call-schedule/current-responder',
  canRead,
  asyncHandler(getCurrentResponder),
);

teamRouter.get('/:teamId/escalation-policy', canRead, asyncHandler(getEscalationPolicy));
teamRouter.put(
  '/:teamId/escalation-policy',
  isAdmin,
  validate(escalationPolicySchema),
  asyncHandler(upsertEscalationPolicy),
);
