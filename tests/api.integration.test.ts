import { OrganizationRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { closeIncidentQueue, incidentQueue } from '../src/queues/incident.queue.js';

const integrationEnabled = process.env.RUN_INTEGRATION_TESTS === 'true';
const integration = describe.runIf(integrationEnabled);
const app = createApp();

async function clearDatabase() {
  await prisma.notificationDelivery.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.onCallMember.deleteMany();
  await prisma.onCallSchedule.deleteMany();
  await prisma.escalationPolicy.deleteMany();
  await prisma.service.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

integration('PulseOps HTTP integration', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await closeIncidentQueue();
    await prisma.$disconnect();
  });

  it('registers, logs in, and rejects invalid credentials', async () => {
    const registration = await request(app)
      .post('/auth/register')
      .send({
        email: 'admin@example.com',
        password: 'correct-horse-battery-staple',
        displayName: 'Admin',
      })
      .expect(201);
    expect(registration.body.token).toEqual(expect.any(String));

    await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'correct-horse-battery-staple' })
      .expect(200);

    await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'incorrect-password' })
      .expect(401);
  });

  it('enforces administrator changes and rejects cross-organization access', async () => {
    const admin = await request(app).post('/auth/register').send({
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
      displayName: 'Admin',
    });
    const viewer = await request(app).post('/auth/register').send({
      email: 'viewer@example.com',
      password: 'correct-horse-battery-staple',
      displayName: 'Viewer',
    });
    const otherAdmin = await request(app).post('/auth/register').send({
      email: 'other@example.com',
      password: 'correct-horse-battery-staple',
      displayName: 'Other',
    });

    const organization = await request(app)
      .post('/organizations')
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ name: 'Primary' })
      .expect(201);
    const organizationId = organization.body.organization.id as string;

    await request(app)
      .post(`/organizations/${organizationId}/members`)
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ email: 'viewer@example.com', role: OrganizationRole.VIEWER })
      .expect(201);

    await request(app)
      .post(`/organizations/${organizationId}/teams`)
      .set('authorization', `Bearer ${viewer.body.token}`)
      .send({ name: 'Unauthorized change' })
      .expect(403);

    const otherOrganization = await request(app)
      .post('/organizations')
      .set('authorization', `Bearer ${otherAdmin.body.token}`)
      .send({ name: 'Other tenant' })
      .expect(201);
    expect(otherOrganization.body.organization.id).not.toBe(organizationId);

    await request(app)
      .get(`/organizations/${organizationId}`)
      .set('authorization', `Bearer ${otherAdmin.body.token}`)
      .expect(403);
  });

  it('creates, acknowledges, resolves, and protects an incident state transition', async () => {
    const admin = await request(app).post('/auth/register').send({
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
      displayName: 'Admin',
    });
    const responder = await request(app).post('/auth/register').send({
      email: 'responder@example.com',
      password: 'correct-horse-battery-staple',
      displayName: 'Responder',
    });

    const organization = await request(app)
      .post('/organizations')
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ name: 'Operations' });
    const organizationId = organization.body.organization.id as string;

    await request(app)
      .post(`/organizations/${organizationId}/members`)
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ email: 'responder@example.com', role: OrganizationRole.RESPONDER })
      .expect(201);

    const team = await request(app)
      .post(`/organizations/${organizationId}/teams`)
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ name: 'Payments' });
    const teamId = team.body.team.id as string;

    await request(app)
      .post(`/teams/${teamId}/members`)
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ userId: responder.body.user.id })
      .expect(201);
    await request(app)
      .post(`/teams/${teamId}/on-call-schedule`)
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ rotationPeriodMinutes: 60 })
      .expect(201);
    await request(app)
      .post(`/teams/${teamId}/on-call-schedule/members`)
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ userId: responder.body.user.id })
      .expect(201);
    await request(app)
      .put(`/teams/${teamId}/escalation-policy`)
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ acknowledgementTimeoutMin: 5 })
      .expect(200);

    const service = await request(app)
      .post(`/organizations/${organizationId}/services`)
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ name: 'Payments API', teamId });

    const incident = await request(app)
      .post(`/services/${service.body.service.id}/incidents`)
      .set('authorization', `Bearer ${admin.body.token}`)
      .send({ title: 'Checkout errors', severity: 'CRITICAL' })
      .expect(201);
    const incidentId = incident.body.incident.id as string;
    expect(incident.body.incident.status).toBe('TRIGGERED');
    expect(incident.body.incident.currentResponder.id).toBe(responder.body.user.id);
    const deliveryId = incident.body.incident.deliveries[0].id as string;
    const notificationJob = await incidentQueue.getJob(`notification-${deliveryId}`);
    const escalationJob = await incidentQueue.getJob(`escalation-${incidentId}-0`);
    expect(notificationJob?.data).toEqual({ kind: 'notification', deliveryId });
    expect(escalationJob?.data).toEqual({ kind: 'escalation', incidentId, expectedStep: 0 });

    await request(app)
      .post(`/incidents/${incidentId}/acknowledge`)
      .set('authorization', `Bearer ${responder.body.token}`)
      .expect(200);
    await request(app)
      .post(`/incidents/${incidentId}/resolve`)
      .set('authorization', `Bearer ${responder.body.token}`)
      .expect(200);
    await request(app)
      .post(`/incidents/${incidentId}/acknowledge`)
      .set('authorization', `Bearer ${responder.body.token}`)
      .expect(409);
  });
});
