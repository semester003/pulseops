import { OrganizationRole } from '@prisma/client';
import { Router } from 'express';

import { getService, removeService, updateService } from '../controllers/service.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireServiceRole } from '../middleware/resource-authorize.js';
import { asyncHandler, validate } from '../middleware/validate.js';
import { updateServiceSchema } from '../schemas/core.schemas.js';

export const serviceRouter = Router();

serviceRouter.use(authenticate);
const canRead = requireServiceRole(
  OrganizationRole.ADMIN,
  OrganizationRole.RESPONDER,
  OrganizationRole.VIEWER,
);
const isAdmin = requireServiceRole(OrganizationRole.ADMIN);

serviceRouter.get('/:serviceId', canRead, asyncHandler(getService));
serviceRouter.patch('/:serviceId', isAdmin, validate(updateServiceSchema), asyncHandler(updateService));
serviceRouter.delete('/:serviceId', isAdmin, asyncHandler(removeService));
