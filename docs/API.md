# PulseOps API Reference

PulseOps exposes a JSON HTTP API. Protected requests require an `Authorization: Bearer <JWT>` header. All identifiers are CUID strings. Request input is validated at runtime with Zod; invalid input produces a consistent `400` response.

> This repository intentionally provides a human-readable reference instead of OpenAPI or Swagger, which are out of scope for the reference implementation.

## Response and error convention

Successful responses use a resource envelope such as `{ "organization": { ... } }` or `{ "incidents": [ ... ] }`. A no-content deletion returns `204`.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": {}
  }
}
```

| Status | Meaning                                                                |
| ------ | ---------------------------------------------------------------------- |
| `400`  | Invalid request body, route parameters, or query string.               |
| `401`  | Missing, invalid, or expired access token.                             |
| `403`  | Authenticated caller lacks an eligible organization role.              |
| `404`  | A requested resource or route does not exist.                          |
| `409`  | Conflict, invalid lifecycle transition, or violated domain constraint. |
| `500`  | Unexpected error; stack traces and database internals are not exposed. |

## Authentication

| Method and path       | Authentication         | Body                                              | Result                                            |
| --------------------- | ---------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `POST /auth/register` | No                     | `email`, `password` (12–128 chars), `displayName` | `201` user and JWT.                               |
| `POST /auth/login`    | No                     | `email`, `password`                               | `200` user and JWT, or `401` invalid credentials. |
| `GET /auth/me`        | Any authenticated user | None                                              | `200` user and organization memberships.          |

```json
POST /auth/register
{
  "email": "alice@example.com",
  "password": "correct-horse-battery-staple",
  "displayName": "Alice"
}
```

## Organizations and membership

All organization resource access is scoped through `OrganizationMember`.

| Method and path                                           | Minimum role       | Body            | Result                                          |
| --------------------------------------------------------- | ------------------ | --------------- | ----------------------------------------------- |
| `POST /organizations`                                     | Authenticated user | `name`          | Creates organization and caller as `ADMIN`.     |
| `GET /organizations/:organizationId`                      | Viewer             | None            | Organization with summary counts.               |
| `PATCH /organizations/:organizationId`                    | Admin              | `name`          | Updates organization.                           |
| `GET /organizations/:organizationId/members`              | Viewer             | None            | Organization members.                           |
| `POST /organizations/:organizationId/members`             | Admin              | `email`, `role` | Adds an existing registered user.               |
| `PATCH /organizations/:organizationId/members/:memberId`  | Admin              | `role`          | Changes a role; last admin cannot be demoted.   |
| `DELETE /organizations/:organizationId/members/:memberId` | Admin              | None            | Removes a member; last admin cannot be removed. |

Roles are `ADMIN`, `RESPONDER`, and `VIEWER`.

## Teams

| Method and path                             | Minimum role | Body                           | Result                                              |
| ------------------------------------------- | ------------ | ------------------------------ | --------------------------------------------------- |
| `POST /organizations/:organizationId/teams` | Admin        | `name`, optional `description` | Creates a team.                                     |
| `GET /organizations/:organizationId/teams`  | Viewer       | None                           | Lists teams.                                        |
| `GET /teams/:teamId`                        | Viewer       | None                           | Retrieves team and configuration summary.           |
| `PATCH /teams/:teamId`                      | Admin        | Optional `name`, `description` | Updates a team.                                     |
| `DELETE /teams/:teamId`                     | Admin        | None                           | Deletes a team if relational constraints permit it. |
| `GET /teams/:teamId/members`                | Viewer       | None                           | Lists team members.                                 |
| `POST /teams/:teamId/members`               | Admin        | `userId`                       | Adds an organization member to the team.            |
| `DELETE /teams/:teamId/members/:userId`     | Admin        | None                           | Removes a team member.                              |

## Services

A service belongs to exactly one organization and one responsible team in the same organization.

| Method and path                                | Minimum role | Body                                     | Result                                         |
| ---------------------------------------------- | ------------ | ---------------------------------------- | ---------------------------------------------- |
| `POST /organizations/:organizationId/services` | Admin        | `name`, optional `description`, `teamId` | Creates a service.                             |
| `GET /organizations/:organizationId/services`  | Viewer       | None                                     | Lists services.                                |
| `GET /services/:serviceId`                     | Viewer       | None                                     | Retrieves a service.                           |
| `PATCH /services/:serviceId`                   | Admin        | Optional `name`, `description`, `teamId` | Updates service metadata or responsible team.  |
| `DELETE /services/:serviceId`                  | Admin        | None                                     | Deletes a service only if it has no incidents. |

## On-call schedules and escalation policy

There is one simple ordered on-call schedule and one escalation policy per team. A member must first be a member of the team before entering its on-call rotation.

| Method and path                                          | Minimum role | Body                                                | Result                                            |
| -------------------------------------------------------- | ------------ | --------------------------------------------------- | ------------------------------------------------- |
| `POST /teams/:teamId/on-call-schedule`                   | Admin        | Optional `rotationStartAt`, `rotationPeriodMinutes` | Creates the team schedule.                        |
| `GET /teams/:teamId/on-call-schedule`                    | Viewer       | None                                                | Retrieves schedule and ordered members.           |
| `POST /teams/:teamId/on-call-schedule/members`           | Admin        | `userId`                                            | Appends an eligible team member to the rotation.  |
| `DELETE /teams/:teamId/on-call-schedule/members/:userId` | Admin        | None                                                | Removes and compacts the ordered rotation.        |
| `GET /teams/:teamId/on-call-schedule/current-responder`  | Viewer       | None                                                | Computes the current responder deterministically. |
| `GET /teams/:teamId/escalation-policy`                   | Viewer       | None                                                | Retrieves the team timeout policy.                |
| `PUT /teams/:teamId/escalation-policy`                   | Admin        | `acknowledgementTimeoutMin`                         | Creates or updates the team's policy.             |

## Incidents

An administrator may create an incident only once the service's responsible team has an on-call schedule with a member and an escalation policy. A responder or administrator can acknowledge or resolve it. Viewers cannot mutate incidents.

| Method and path                                | Minimum role | Body or query                                            | Result                                                   |
| ---------------------------------------------- | ------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| `POST /services/:serviceId/incidents`          | Admin        | `title`, optional `description`, `severity`              | Creates a triggered incident and queues its work.        |
| `GET /organizations/:organizationId/incidents` | Viewer       | Optional `status`, `severity`, `serviceId` query filters | Lists scoped incidents.                                  |
| `GET /incidents/:incidentId`                   | Viewer       | None                                                     | Gets incident and delivery history.                      |
| `PATCH /incidents/:incidentId`                 | Admin        | Optional `title`, nullable `description`, `severity`     | Updates metadata only while not resolved.                |
| `POST /incidents/:incidentId/acknowledge`      | Responder    | None                                                     | Transitions `TRIGGERED` to `ACKNOWLEDGED`.               |
| `POST /incidents/:incidentId/resolve`          | Responder    | None                                                     | Transitions `TRIGGERED` or `ACKNOWLEDGED` to `RESOLVED`. |

Severity values are `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL`. Status values are `TRIGGERED`, `ACKNOWLEDGED`, and `RESOLVED`.

## Representative incident creation

```bash
curl -X POST http://localhost:3000/services/$SERVICE_ID/incidents \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Checkout requests failing",
    "description": "5xx error rate crossed the critical threshold.",
    "severity": "CRITICAL"
  }'
```

The response returns the persisted incident immediately. Delivery and escalation occur in the separate worker process.
