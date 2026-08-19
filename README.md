# PulseOps

PulseOps is a **TypeScript incident-management backend** for engineering teams. It provides organization-scoped access control, services owned by responsible teams, deliberately simple on-call rotations, and asynchronous incident escalation through PostgreSQL, Redis, and BullMQ.

It is a **reference modular-monolith implementation**. The API and worker run as separate processes, while the application remains one deployable codebase with one relational database.

## Problem and core workflow

When an incident is created for a service, PulseOps identifies the service's responsible team and the current member of that team's ordered on-call rotation. It stores the incident and its initial notification-delivery record transactionally, then adds immediate notification and delayed escalation work to Redis. The HTTP request never waits for the notification provider.

```mermaid
sequenceDiagram
  participant C as Authorized caller
  participant A as API
  participant P as PostgreSQL
  participant Q as Redis / BullMQ
  participant W as Worker
  participant R as Responder

  C->>A: Create incident for service
  A->>P: Store incident + initial delivery
  A->>Q: Enqueue notification + delayed escalation
  A-->>C: 201 Created
  W->>Q: Claim notification job
  W->>R: Console notification (development provider)
  W->>Q: Run delayed escalation check
  alt Incident acknowledged or resolved
    W->>W: Stop without escalation
  else Still triggered
    W->>P: Advance responder and escalation step transactionally
    W->>Q: Enqueue next notification and delay
  end
```

## Technology choices

| Component       | Choice                                   | Why it is used                                                                                     |
| --------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Runtime and API | Node.js, TypeScript, Express             | A mature HTTP stack with strict compile-time typing.                                               |
| Persistence     | PostgreSQL, Prisma                       | Relational tenant boundaries, constraints, indexed operational queries, and transaction support.   |
| Validation      | Zod                                      | Validates untrusted HTTP and environment inputs at runtime. TypeScript alone is compile-time only. |
| Background work | Redis, BullMQ                            | Delayed jobs, retries, exponential backoff, and a separate worker process.                         |
| Authentication  | JWT, bcrypt                              | Stateless API authentication with password hashing and organization-scoped authorization.          |
| Observability   | Pino                                     | JSON-structured logs with redaction for sensitive fields.                                          |
| Quality         | Vitest, ESLint, Prettier, GitHub Actions | Automated correctness, style, formatting, and CI checks.                                           |

## Architecture

The primary components and request flows are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The essential separation is that the API owns authenticated synchronous command handling, PostgreSQL owns durable state, and the worker owns notification and escalation execution.

## Data model

| Model                                   | Purpose                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `User`                                  | Login identity with a bcrypt password hash.                                       |
| `Organization` and `OrganizationMember` | The tenancy boundary and organization role assignment.                            |
| `Team` and `TeamMember`                 | Operational ownership of services and eligible responders.                        |
| `Service`                               | An engineering service associated with exactly one responsible team.              |
| `OnCallSchedule` and `OnCallMember`     | A deterministic, ordered rotation for a team.                                     |
| `EscalationPolicy`                      | The team's single acknowledgement timeout setting.                                |
| `Incident`                              | The operational lifecycle record, current responder, and current escalation step. |
| `NotificationDelivery`                  | A durable, idempotent record for each responder/step notification.                |

The Prisma schema and committed SQL migrations are in [`prisma/`](prisma/). Deliberate indexes cover organization-scoped incident reads, incident service/status queries, team/status queries, membership lookups, and ordered on-call membership.

## Authentication and RBAC

Register through `POST /auth/register`, log in through `POST /auth/login`, and supply `Authorization: Bearer <token>` on protected routes. JWT configuration is validated on startup and passwords are never returned or logged.

| Organization role | Permitted actions                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `ADMIN`           | Manage organization membership, teams, services, on-call schedules, escalation policy, and incident metadata. |
| `RESPONDER`       | Read organization resources and acknowledge or resolve incidents.                                             |
| `VIEWER`          | Read organization resources only.                                                                             |

Authorization is enforced by organization membership lookups. Resource-specific middleware resolves a team, service, or incident to its organization before checking the caller's role, so a token from another organization cannot access the resource.

## On-call rotation and escalation behavior

A team's on-call schedule is an ordered list. The active index is calculated from `rotationStartAt`, `rotationPeriodMinutes`, and the number of members. This avoids calendar rules, holidays, overrides, time-zone engines, or ambiguous recurring schedules.

An incident captures the responder at step zero using its creation time. Each delayed escalation check only advances from expected step `n` to `n + 1` if the incident is still `TRIGGERED` and still at step `n`. The rotation is not wrapped during a single incident: exhaustion is logged and the incident remains triggered for manual follow-up.

> **Acknowledgement and resolution stop escalation.** A delayed job that runs after either transition becomes a safe no-op because it checks the persisted incident status and expected escalation step inside a serializable transaction.

### Retry and idempotency model

BullMQ retries failed jobs up to five times with exponential backoff. Notification deliveries use a unique `(incidentId, step)` database constraint. A worker atomically claims a pending delivery into a short-lived `PROCESSING` lease before calling the provider; an already sent or currently claimed delivery is ignored. The worker reconciles persisted pending deliveries at startup, protecting against the narrow case where database work succeeds but queue insertion is interrupted.

Escalation progression is protected by a transaction and a conditional update on `(id, status = TRIGGERED, escalationStep = expectedStep)`. Duplicate delayed jobs, retries, and concurrent attempts cannot create a second escalation step or a second delivery record.

The console provider is intentionally development-safe. Because an external provider can fail after accepting a request but before returning a response, a future real provider should also accept an idempotency key; delivery is otherwise correctly treated as **at-least-once** at the provider boundary.

## Local setup

### Prerequisites

Use Node.js 22 or newer, PostgreSQL, and Redis. Docker Compose is the simplest way to run the dependencies and the two application processes.

```bash
git clone https://github.com/semester003/pulseops.git
cd pulseops
cp .env.example .env
npm install
npx prisma generate
npm run db:migrate
npm run dev
```

Run the worker in a second terminal:

```bash
npm run worker
```

The API listens on `http://localhost:3000` by default. See [docs/API.md](docs/API.md) for the full human-readable endpoint reference.

### Docker Compose

```bash
docker compose up --build
```

This starts PostgreSQL, Redis, the API on port `3000`, and the worker. Each application process runs `prisma migrate deploy` before it starts. Stop and remove local data with:

```bash
docker compose down -v
```

## Environment variables

| Variable         | Required | Purpose                                                          |
| ---------------- | -------- | ---------------------------------------------------------------- |
| `DATABASE_URL`   | Yes      | PostgreSQL connection URL.                                       |
| `REDIS_URL`      | Yes      | Redis connection URL used by BullMQ.                             |
| `JWT_SECRET`     | Yes      | At least 32 characters; used to sign and verify access tokens.   |
| `JWT_EXPIRES_IN` | Yes      | JWT lifetime, such as `8h`.                                      |
| `PORT`           | No       | HTTP port; defaults to `3000`.                                   |
| `NODE_ENV`       | No       | `development`, `test`, or `production`; defaults to development. |
| `LOG_LEVEL`      | No       | Pino log level; defaults to `info`.                              |

Never commit a real `.env` file or production secrets.

## Commands

| Command                | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Start the API with TypeScript watch mode.              |
| `npm run worker`       | Start the separate worker with TypeScript execution.   |
| `npm run build`        | Compile API and worker output to `dist/`.              |
| `npm run start`        | Start compiled API output.                             |
| `npm run typecheck`    | Perform strict TypeScript checking.                    |
| `npm run lint`         | Enforce ESLint rules with zero warnings.               |
| `npm run format:check` | Verify repository formatting without modifying files.  |
| `npm test`             | Run fast unit tests and skip opt-in integration tests. |

| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run db:migrate` | Create and apply development migrations. |
| `npm run db:migrate:deploy` | Apply committed migrations safely. |
| `npm run db:seed` | Run the optional seed command when added for a local scenario. |

## Testing

The default test suite includes deterministic rotation behavior. The HTTP integration suite covers registration, login failure, administrator and viewer permissions, cross-organization isolation, incident creation, acknowledgement, resolution, and invalid lifecycle transitions. It is opt-in because it intentionally uses real PostgreSQL and Redis.

```bash
# Start infrastructure first
docker compose up -d postgres redis

# Use a separate test database URL in a real environment.
export RUN_INTEGRATION_TESTS=true
export DATABASE_URL='postgresql://pulseops:pulseops@localhost:5432/pulseops?schema=public'
export REDIS_URL='redis://localhost:6379'
export JWT_SECRET='local-test-secret-that-is-longer-than-thirty-two-characters'
npx prisma migrate deploy
npm test
```

The queue worker behavior is implemented against the real BullMQ API. Its delivery claims, queue retries, delayed jobs, and conditional database transitions are covered by the design and can be exercised through Docker Compose; provider delivery remains a console/log side effect by scope.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs dependency installation, Prisma client generation, TypeScript checking, linting, the default test suite, and a production build on every push and pull request. It does not claim deployment automation.

## Known limitations

This is intentionally not a production-distributed deployment. It has one database, one Redis backend, a simple ordered on-call algorithm, a console notification provider, and no audit trail. It does not cancel delayed BullMQ jobs on acknowledgement; instead, those jobs safely detect persisted state and stop. A worker restart reconciles pending notification records, but it does not manufacture missing escalation jobs after an extended queue outage; operational monitoring should detect such infrastructure failures.

## Out of scope and future development

The following items are deliberately not implemented: audit logs, API keys, webhooks, incident comments and timelines, OpenAPI/Swagger, dashboards, calendar and override scheduling, OAuth, refresh tokens, SMS or voice delivery, a general workflow engine, microservices, Kubernetes, Kafka, load balancers, multi-region deployment, and multi-instance coordination.

Future additions should preserve the tenancy and idempotency boundaries. Examples include a provider interface implementation for email/SMS with idempotency keys, audit events, an OpenAPI document generated from an explicit API contract, calendar-aware schedules in a separate scheduling module, a queue outbox relay for stronger database-to-queue delivery guarantees, metrics and tracing, and multi-worker observability. [docs/SCALING.md](docs/SCALING.md) separates these future designs from what the repository implements today.
