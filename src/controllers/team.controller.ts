import type { RequestHandler } from 'express';
import type { z } from 'zod';

import {
  addTeamMemberSchema,
  createTeamSchema,
  organizationIdParamsSchema,
  teamIdParamsSchema,
  updateTeamSchema,
  userIdParamsSchema,
} from '../schemas/core.schemas.js';
import { TeamService } from '../services/team.service.js';

const teamService = new TeamService();

export const createTeam: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  const team = await teamService.create(organizationId, request.body as z.infer<typeof createTeamSchema>);
  response.status(201).json({ team });
};

export const listTeams: RequestHandler = async (request, response) => {
  const { organizationId } = organizationIdParamsSchema.parse(request.params);
  response.status(200).json({ teams: await teamService.list(organizationId) });
};

export const getTeam: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  response.status(200).json({ team: await teamService.get(teamId) });
};

export const updateTeam: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  const team = await teamService.update(teamId, request.body as z.infer<typeof updateTeamSchema>);
  response.status(200).json({ team });
};

export const removeTeam: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  await teamService.remove(teamId);
  response.status(204).send();
};

export const addTeamMember: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  const { userId } = request.body as z.infer<typeof addTeamMemberSchema>;
  response.status(201).json({ member: await teamService.addMember(teamId, userId) });
};

export const removeTeamMember: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  const { userId } = userIdParamsSchema.parse(request.params);
  await teamService.removeMember(teamId, userId);
  response.status(204).send();
};

export const listTeamMembers: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  response.status(200).json({ members: await teamService.listMembers(teamId) });
};
