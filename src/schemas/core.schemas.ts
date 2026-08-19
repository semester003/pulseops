import { OrganizationRole } from '@prisma/client';
import { z } from 'zod';

export const idParamsSchema = z.object({ id: z.string().cuid() });
export const organizationIdParamsSchema = z.object({ organizationId: z.string().cuid() });
export const teamIdParamsSchema = z.object({ teamId: z.string().cuid() });
export const serviceIdParamsSchema = z.object({ serviceId: z.string().cuid() });

export const registerSchema = z.object({
  email: z
    .string()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(100),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

export const addOrganizationMemberSchema = z.object({
  email: z
    .string()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  role: z.nativeEnum(OrganizationRole).default(OrganizationRole.VIEWER),
});

export const updateOrganizationMemberSchema = z.object({
  role: z.nativeEnum(OrganizationRole),
});

export const memberIdParamsSchema = z.object({ memberId: z.string().cuid() });
export const userIdParamsSchema = z.object({ userId: z.string().cuid() });

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
});

export const updateTeamSchema = createTeamSchema.partial();

export const addTeamMemberSchema = z.object({ userId: z.string().cuid() });

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  teamId: z.string().cuid(),
});

export const updateServiceSchema = createServiceSchema.partial();
