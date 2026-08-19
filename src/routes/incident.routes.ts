import { OrganizationRole } from '@prisma/client';
import { Router } from 'express';

import {
  acknowledgeIncident,
  getIncident,
  resolveIncident,
  updateIncident,
} from '../controllers/incident.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireIncidentRole } from '../middleware/resource-authorize.js';
import { asyncHandler, validate } from '../middleware/validate.js';
import { updateIncidentSchema } from '../schemas/incident.schemas.js';

export const incidentRouter = Router();

incidentRouter.use(authenticate);
const canRead = requireIncidentRole(
  OrganizationRole.ADMIN,
  OrganizationRole.RESPONDER,
  OrganizationRole.VIEWER,
);
const isAdmin = requireIncidentRole(OrganizationRole.ADMIN);
const canRespond = requireIncidentRole(OrganizationRole.ADMIN, OrganizationRole.RESPONDER);

incidentRouter.get('/:incidentId', canRead, asyncHandler(getIncident));
incidentRouter.patch('/:incidentId', isAdmin, validate(updateIncidentSchema), asyncHandler(updateIncident));
incidentRouter.post('/:incidentId/acknowledge', canRespond, asyncHandler(acknowledgeIncident));
incidentRouter.post('/:incidentId/resolve', canRespond, asyncHandler(resolveIncident));
