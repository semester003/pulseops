import { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { z } from 'zod';

export const incidentIdParamsSchema = z.object({ incidentId: z.string().cuid() });

export const createIncidentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).optional(),
  severity: z.nativeEnum(IncidentSeverity),
});

export const updateIncidentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    severity: z.nativeEnum(IncidentSeverity).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one incident field must be provided.',
  });

export const listIncidentsQuerySchema = z.object({
  status: z.nativeEnum(IncidentStatus).optional(),
  severity: z.nativeEnum(IncidentSeverity).optional(),
  serviceId: z.string().cuid().optional(),
});

export const createOnCallScheduleSchema = z.object({
  rotationStartAt: z.coerce.date().optional(),
  rotationPeriodMinutes: z.coerce.number().int().min(1).max(10_080).default(1_440),
});

export const addOnCallMemberSchema = z.object({ userId: z.string().cuid() });

export const escalationPolicySchema = z.object({
  acknowledgementTimeoutMin: z.coerce.number().int().min(1).max(1_440),
});
