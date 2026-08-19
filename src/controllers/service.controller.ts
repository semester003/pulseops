import type { RequestHandler } from 'express';
import type { z } from 'zod';

import {
  createServiceSchema,
  organizationIdParamsSchema,
  serviceIdParamsSchema,
  updateServiceSchema,
} from '../schemas/core.schemas.js';
import { ServiceService } from '../services/service.service.js';

const serviceService = new ServiceService();

export const createService: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  const service = await serviceService.create(
    organizationId,
    request.body as z.infer<typeof createServiceSchema>,
  );
  response.status(201).json({ service });
};

export const listServices: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  response.status(200).json({ services: await serviceService.list(organizationId) });
};

export const getService: RequestHandler = async (request, response) => {
  const { serviceId } = serviceIdParamsSchema.parse(request.params);
  response.status(200).json({ service: await serviceService.get(serviceId) });
};

export const updateService: RequestHandler = async (request, response) => {
  const { serviceId } = serviceIdParamsSchema.parse(request.params);
  const service = await serviceService.update(
    serviceId,
    request.body as z.infer<typeof updateServiceSchema>,
  );
  response.status(200).json({ service });
};

export const removeService: RequestHandler = async (request, response) => {
  const { serviceId } = serviceIdParamsSchema.parse(request.params);
  await serviceService.remove(serviceId);
  response.status(204).send();
};
