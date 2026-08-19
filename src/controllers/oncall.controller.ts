import type { RequestHandler } from 'express';
import type { z } from 'zod';

import { teamIdParamsSchema, userIdParamsSchema } from '../schemas/core.schemas.js';
import {
  addOnCallMemberSchema,
  createOnCallScheduleSchema,
  escalationPolicySchema,
} from '../schemas/incident.schemas.js';
import { EscalationPolicyService } from '../services/escalation-policy.service.js';
import { OnCallService } from '../services/oncall.service.js';

const onCallService = new OnCallService();
const escalationPolicyService = new EscalationPolicyService();

export const createOnCallSchedule: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  const schedule = await onCallService.createSchedule(
    teamId,
    request.body as z.infer<typeof createOnCallScheduleSchema>,
  );
  response.status(201).json({ schedule });
};

export const getOnCallSchedule: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  response.status(200).json({ schedule: await onCallService.getSchedule(teamId) });
};

export const addOnCallMember: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  const { userId } = request.body as z.infer<typeof addOnCallMemberSchema>;
  response.status(201).json({ member: await onCallService.addMember(teamId, userId) });
};

export const removeOnCallMember: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  const { userId } = userIdParamsSchema.parse(request.params);
  await onCallService.removeMember(teamId, userId);
  response.status(204).send();
};

export const getCurrentResponder: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  response.status(200).json({ current: await onCallService.getCurrentResponder(teamId) });
};

export const getEscalationPolicy: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  response.status(200).json({ policy: await escalationPolicyService.get(teamId) });
};

export const upsertEscalationPolicy: RequestHandler = async (request, response) => {
  const { teamId } = teamIdParamsSchema.parse(request.params);
  const { acknowledgementTimeoutMin } = request.body as z.infer<typeof escalationPolicySchema>;
  response.status(200).json({
    policy: await escalationPolicyService.upsert(teamId, acknowledgementTimeoutMin),
  });
};
