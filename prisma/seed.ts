import { OrganizationRole, PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function ensureUser(email: string, displayName: string) {
  const passwordHash = await bcrypt.hash('change-me-in-local-development', 12);
  return prisma.user.upsert({
    where: { email },
    create: { email, displayName, passwordHash },
    update: { displayName },
  });
}

async function main() {
  const admin = await ensureUser('admin@pulseops.local', 'Demo Administrator');
  const alice = await ensureUser('alice@pulseops.local', 'Alice Responder');
  const bob = await ensureUser('bob@pulseops.local', 'Bob Responder');

  const organization =
    (await prisma.organization.findFirst({ where: { name: 'PulseOps Demo Organization' } })) ??
    (await prisma.organization.create({ data: { name: 'PulseOps Demo Organization' } }));

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: admin.id } },
    create: { organizationId: organization.id, userId: admin.id, role: OrganizationRole.ADMIN },
    update: { role: OrganizationRole.ADMIN },
  });
  for (const responder of [alice, bob]) {
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: responder.id } },
      create: {
        organizationId: organization.id,
        userId: responder.id,
        role: OrganizationRole.RESPONDER,
      },
      update: { role: OrganizationRole.RESPONDER },
    });
  }

  const team = await prisma.team.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Payments' } },
    create: {
      organizationId: organization.id,
      name: 'Payments',
      description: 'Owns checkout and payment processing.',
    },
    update: { description: 'Owns checkout and payment processing.' },
  });
  for (const responder of [alice, bob]) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: responder.id } },
      create: { teamId: team.id, userId: responder.id },
      update: {},
    });
  }

  const schedule = await prisma.onCallSchedule.upsert({
    where: { teamId: team.id },
    create: { teamId: team.id, rotationPeriodMinutes: 1_440 },
    update: { rotationPeriodMinutes: 1_440 },
  });
  await prisma.onCallMember.upsert({
    where: { scheduleId_userId: { scheduleId: schedule.id, userId: alice.id } },
    create: { scheduleId: schedule.id, userId: alice.id, position: 0 },
    update: { position: 0 },
  });
  await prisma.onCallMember.upsert({
    where: { scheduleId_userId: { scheduleId: schedule.id, userId: bob.id } },
    create: { scheduleId: schedule.id, userId: bob.id, position: 1 },
    update: { position: 1 },
  });

  await prisma.escalationPolicy.upsert({
    where: { teamId: team.id },
    create: { teamId: team.id, acknowledgementTimeoutMin: 5 },
    update: { acknowledgementTimeoutMin: 5 },
  });

  await prisma.service.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Payments API' } },
    create: {
      organizationId: organization.id,
      teamId: team.id,
      name: 'Payments API',
      description: 'Reference service protected by the demo on-call rotation.',
    },
    update: {
      teamId: team.id,
      description: 'Reference service protected by the demo on-call rotation.',
    },
  });

  console.log('Seed complete. Demo login: admin@pulseops.local / change-me-in-local-development');
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
