import type { RequestHandler } from 'express';
import type { z } from 'zod';

import { organizationIdParamsSchema, serviceIdParamsSchema } from '../schemas/core.schemas.js';
import {
  createIncidentSchema,
  incidentIdParamsSchema,
  listIncidentsQuerySchema,
  updateIncidentSchema,
} from '../schemas/incident.schemas.js';
import { IncidentService } from '../services/incident.service.js';
import { AuthenticationError } from '../utils/errors.js';

const incidentService = new IncidentService();

export const createIncident: RequestHandler = async (request, response) => {
  const { serviceId } = serviceIdParamsSchema.parse(request.params);
  const incident = await incidentService.create(serviceId, request.body as z.infer<typeof createIncidentSchema>);
  response.status(201).json({ incident });
};

export const listIncidents: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  const filters = listIncidentsQuerySchema.parse(request.query);
  response.status(200).json({ incidents: await incidentService.list(organizationId, filters) });
};

export const getIncident: RequestHandler = async (request, response) => {
  const { incidentId } = incidentIdParamsSchema.parse(request.params);
  response.status(200).json({ incident: await incidentService.get(incidentId) });
};

export const updateIncident: RequestHandler = async (request, response) => {
  const { incidentId } = incidentIdParamsSchema.parse(request.params);
  const incident = await incidentService.update(
    incidentId,
    request.body as z.infer<typeof updateIncidentSchema>,
  );
  response.status(200).json({ incident });
};

export const acknowledgeIncident: RequestHandler = async (request, response) => {
  const { incidentId } = incidentIdParamsSchema.parse(request.params);
  const userId = request.auth?.userId;
  if (!userId) throw new AuthenticationError();
  response.status(200).json({ incident: await incidentService.acknowledge(incidentId, userId) });
};

export const resolveIncident: RequestHandler = async (request, response) => {
  const { incidentId } = incidentIdParamsSchema.parse(request.params);
  const userId = request.auth?.userId;
  if (!userId) throw new AuthenticationError();
  response.status(200).json({ incident: await incidentService.resolve(incidentId, userId) });
};
