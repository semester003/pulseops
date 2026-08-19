import type { RequestHandler } from 'express';
import type { z } from 'zod';

import {
  addOrganizationMemberSchema,
  createOrganizationSchema,
  memberIdParamsSchema,
  organizationIdParamsSchema,
  updateOrganizationMemberSchema,
  updateOrganizationSchema,
} from '../schemas/core.schemas.js';
import { OrganizationService } from '../services/organization.service.js';
import { AuthenticationError } from '../utils/errors.js';

const organizationService = new OrganizationService();

export const createOrganization: RequestHandler = async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) throw new AuthenticationError();
  const organization = await organizationService.create(
    userId,
    request.body as z.infer<typeof createOrganizationSchema>,
  );
  response.status(201).json({ organization });
};

export const getOrganization: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  response.status(200).json({ organization: await organizationService.getById(organizationId) });
};

export const updateOrganization: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  const organization = await organizationService.update(
    organizationId,
    request.body as z.infer<typeof updateOrganizationSchema>,
  );
  response.status(200).json({ organization });
};

export const listOrganizationMembers: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  response.status(200).json({ members: await organizationService.listMembers(organizationId) });
};

export const addOrganizationMember: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  const input = request.body as z.infer<typeof addOrganizationMemberSchema>;
  const member = await organizationService.addMember(organizationId, input.email, input.role);
  response.status(201).json({ member });
};

export const updateOrganizationMember: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  const { memberId } = memberIdParamsSchema.parse(request.params);
  const { role } = request.body as z.infer<typeof updateOrganizationMemberSchema>;
  response
    .status(200)
    .json({ member: await organizationService.updateMemberRole(organizationId, memberId, role) });
};

export const removeOrganizationMember: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  const { memberId } = memberIdParamsSchema.parse(request.params);
  await organizationService.removeMember(organizationId, memberId);
  response.status(204).send();
};
