import type { OrganizationRole } from '@prisma/client';

export interface AuthContext {
  userId: string;
  email: string;
}

export interface OrganizationAccess {
  organizationId: string;
  role: OrganizationRole;
}
