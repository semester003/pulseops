# PulseOps Implementation Report

## Delivered project

PulseOps is a complete TypeScript modular-monolith incident-management backend. It includes Express HTTP APIs, PostgreSQL/Prisma relational modeling and SQL migrations, Zod validation, JWT/bcrypt authentication, organization-scoped RBAC, deterministic on-call rotations, a one-policy-per-team escalation model, Redis/BullMQ job production, a separate worker, console notifications, Docker Compose, automated tests, linting, formatting configuration, and GitHub Actions CI.

## File tree

```text
.
├── .dockerignore
├── .env.example
├── .github/workflows/ci.yml
├── .gitignore
├── Dockerfile
├── README.md
├── docker-compose.yml
├── docs
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── IMPLEMENTATION.md
│   └── SCALING.md
├── prisma
│   ├── migrations
│   │   ├── 20260819000000_init/migration.sql
│   │   ├── 20260819000100_delivery_leases/migration.sql
│   │   └── migration_lock.toml
│   ├── schema.prisma
│   └── seed.ts
├── src
│   ├── app.ts
│   ├── config
│   │   ├── env.ts
│   │   └── prisma.ts
│   ├── controllers
│   │   ├── auth.controller.ts
│   │   ├── incident.controller.ts
│   │   ├── oncall.controller.ts
│   │   ├── organization.controller.ts
│   │   ├── service.controller.ts
│   │   └── team.controller.ts
│   ├── middleware
│   │   ├── authenticate.ts
│   │   ├── authorize.ts
│   │   ├── error-handler.ts
│   │   ├── resource-authorize.ts
│   │   └── validate.ts
│   ├── providers/notification.provider.ts
│   ├── queues/incident.queue.ts
│   ├── routes
│   │   ├── auth.routes.ts
│   │   ├── incident.routes.ts
│   │   ├── organization.routes.ts
│   │   ├── service.routes.ts
│   │   └── team.routes.ts
│   ├── schemas
│   │   ├── core.schemas.ts
│   │   └── incident.schemas.ts
│   ├── server.ts
│   ├── services
│   │   ├── auth.service.ts
│   │   ├── escalation-policy.service.ts
│   │   ├── incident.service.ts
│   │   ├── oncall.service.ts
│   │   ├── organization.service.ts
│   │   ├── service.service.ts
│   │   └── team.service.ts
│   ├── types
│   │   ├── auth.ts
│   │   └── express.d.ts
│   ├── utils
│   │   ├── errors.ts
│   │   ├── jwt.ts
│   │   └── logger.ts
│   └── workers/worker.ts
├── tests
│   ├── api.integration.test.ts
│   └── oncall-rotation.test.ts
├── package.json
├── package-lock.json
├── tsconfig.json
└── vitest.config.ts
```

## Technology and dependencies

| Area                 | Implemented choice                                                                     |
| -------------------- | -------------------------------------------------------------------------------------- |
| Language and runtime | TypeScript, Node.js 22, strict compiler settings.                                      |
| HTTP application     | Express 5, Helmet, CORS, Pino request logging.                                         |
| Data and migrations  | PostgreSQL, Prisma ORM, committed SQL migrations, Prisma client generation.            |
| Authentication       | bcrypt password hashing, JWT bearer tokens, validated environment secret.              |
| Validation           | Zod for bodies, selected route parameters, query strings, and environment values.      |
| Async processing     | Redis-backed BullMQ queue, delayed jobs, exponential retries, separate worker process. |
| Tests                | Vitest and Supertest integration coverage.                                             |
| Quality              | ESLint, Prettier configuration, strict type checking, GitHub Actions CI.               |
| Runtime packaging    | Dockerfile and Docker Compose.                                                         |

## Database models

| Model group           | Models                                                |
| --------------------- | ----------------------------------------------------- |
| Tenant and identity   | `User`, `Organization`, `OrganizationMember`.         |
| Operational ownership | `Team`, `TeamMember`, `Service`.                      |
| Response routing      | `OnCallSchedule`, `OnCallMember`, `EscalationPolicy`. |
| Incident processing   | `Incident`, `NotificationDelivery`.                   |

The organization is the tenant boundary. Teams and services are constrained to their organization. A user cannot become a team member without organization membership. A service cannot reference a team outside its organization. Notification deliveries have a unique `(incidentId, step)` constraint, and on-call positions are unique per schedule.

## Implemented endpoint groups

| Domain            | Routes delivered                                                                 |
| ----------------- | -------------------------------------------------------------------------------- |
| Authentication    | Register, login, and current authenticated profile.                              |
| Organization      | Create, retrieve, update, member listing, member add/update/remove.              |
| Teams             | Create/list under organization, read/update/delete, and team member management.  |
| Services          | Create/list under organization, read/update/delete.                              |
| On-call           | Create/retrieve schedule, manage ordered members, current responder query.       |
| Escalation policy | Read and upsert team acknowledgement timeout.                                    |
| Incidents         | Create, organization-scoped list/filter, retrieve, update, acknowledge, resolve. |

The exact contracts, role requirements, body fields, error structure, and curl example are in [API.md](API.md).

## Authentication and authorization design

A login returns a signed, expiring JWT. Authentication middleware verifies it and attaches a typed `{ userId, email }` context. Authorization middleware checks `OrganizationMember` for the owning organization of the route resource.

| Role        | Enforced capability                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `ADMIN`     | Configuration and operational resource management, plus incident creation and metadata updates. |
| `RESPONDER` | Organization-scoped reads plus acknowledgement and resolution.                                  |
| `VIEWER`    | Organization-scoped reads only.                                                                 |

Cross-organization resource access is rejected because resource authorization derives the resource's organization before role lookup.

## Queue, worker, retry, and idempotency design

Incident creation uses a serializable PostgreSQL transaction to select the initial responder, persist the `TRIGGERED` incident, and create delivery step zero. Only after persistence does the API add an immediate notification job and a delayed escalation check; HTTP returns without waiting for the worker.

The worker retries jobs through BullMQ up to five attempts using exponential backoff. A `NotificationDelivery` is claimed atomically into `PROCESSING` with a short lease before the provider call. Sent or concurrently claimed deliveries are safe no-ops. The worker marks final failed notification attempts as `FAILED` and reconciles persisted `PENDING` deliveries when starting.

Escalation performs an expected-step conditional update inside a serializable transaction. It only advances when the incident is still `TRIGGERED` at the delayed job's expected step. Acknowledged and resolved incidents cause delayed jobs to stop with no further responder notification. Duplicate jobs or retries cannot create a second delivery record for the same incident step.

## Tests delivered

| Test level                            | Coverage                                                                                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                                  | Deterministic rotation indexing, step progression, and exhaustion behavior.                                                                                                                                |
| Opt-in database and Redis integration | Registration, login, invalid credentials, admin permissions, viewer rejection, cross-organization rejection, incident creation, acknowledgement, resolution, and invalid acknowledgement after resolution. |
| Manual runtime path                   | Docker Compose creates PostgreSQL, Redis, API, and worker; its documented workflow exercises real queue processing.                                                                                        |

The integration suite is intentionally opt-in with `RUN_INTEGRATION_TESTS=true` because it must run against actual PostgreSQL and Redis. It is not falsely presented as having run in an environment without container support.

## Docker and CI

`docker-compose.yml` starts PostgreSQL, Redis, the API, and the separate worker. Both application processes apply committed migrations before starting. `Dockerfile` compiles TypeScript and packages production dependencies and generated Prisma client artifacts.

The GitHub Actions workflow runs installation, Prisma generation, strict type checking, ESLint, the default test suite, and the production build on push and pull request. It does not claim deployment automation.

## Verification performed in this environment

| Command               | Result                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm install`         | Passed.                                                                                                       |
| `npx prisma generate` | Passed.                                                                                                       |
| `npm run typecheck`   | Passed after full implementation.                                                                             |
| `npm run lint`        | Passed with zero warnings.                                                                                    |
| `npm test`            | Passed: three unit tests; three integration tests intentionally skipped without `RUN_INTEGRATION_TESTS=true`. |
| `npm run build`       | Passed.                                                                                                       |
| `docker --version`    | Not available in this sandbox, so Compose/API/worker integration could not be started here.                   |

## Deliberately out of scope

The implementation does not include audit logs, webhooks, API keys, incident comments or timeline, OpenAPI/Swagger, dashboards, complex scheduling, schedule overrides, OAuth, refresh tokens, SMS/voice delivery, arbitrary workflow configuration, microservices, Kafka, Kubernetes, multi-region deployment, load balancing, or multi-instance deployment.

## Known limitations and future development

The console notification provider is a development-safe implementation. A production provider should accept a delivery ID as an idempotency key. The application uses startup reconciliation for `PENDING` deliveries, not a full transactional outbox for every database-to-queue handoff. A rotation exhausted without acknowledgement is logged and requires manual follow-up. Delayed jobs are not removed on acknowledgement; they safely evaluate durable incident state and become no-ops.

Future evolution, including API replicas, connection pooling, read replicas, Redis capacity, worker scaling, backpressure, a transactional outbox, real provider idempotency, monitoring, rate limiting, and availability engineering, is explained in [SCALING.md](SCALING.md). Architecture diagrams, request flows, and concurrency tradeoffs are documented in [ARCHITECTURE.md](ARCHITECTURE.md).
