# PulseOps Scaling Notes

This document distinguishes **what the repository implements today** from design directions that would be appropriate as load, operational criticality, or tenancy scale grows. It does not claim that the future architecture is already deployed.

## Current implementation

| Area          | Current implementation                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| API           | One stateless Express process. It can be restarted without losing durable domain state.                             |
| Database      | One PostgreSQL database accessed through Prisma. Organization predicates and selected indexes support scoped reads. |
| Queue         | One Redis-backed BullMQ queue. Jobs retry with exponential backoff.                                                 |
| Worker        | One separately started worker process with concurrency 10.                                                          |
| Notifications | Console provider only; no externally delivered email, SMS, or voice claims.                                         |
| Consistency   | PostgreSQL serializable transactions for incident creation/escalation and conditional state updates.                |
| Idempotency   | Unique delivery step and conditional worker claim prevent duplicate escalation effects.                             |
| Caching       | No application cache. Redis is used only as the BullMQ backend.                                                     |
| Deployment    | Docker Compose provides API, worker, PostgreSQL, and Redis for a small deployment.                                  |

## Scaling path

| Concern                   | Future scaling design                                                                                         | Why it is not asserted today                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| API throughput            | Run several stateless API replicas behind a load balancer.                                                    | This project does not configure a load balancer, service discovery, or multi-instance deployment. |
| Database connections      | Put a managed PostgreSQL connection pooler in front of the database and tune Prisma connection settings.      | Compose uses direct local connections only.                                                       |
| Read load                 | Add read replicas for suitable non-critical reads, with explicit consistency rules.                           | All current reads use the primary database.                                                       |
| Query performance         | Measure slow organization and incident queries, then refine indexes from real workloads.                      | Current indexes are selected from known access paths, not production measurements.                |
| Redis pressure            | Use managed Redis sizing, persistence, eviction policy, and queue observability.                              | The local Redis service has no high-availability configuration.                                   |
| Worker throughput         | Increase worker replica count and control per-worker concurrency; keep database claim guards.                 | The current worker is a single process and makes no throughput guarantee.                         |
| Backpressure              | Limit enqueue rate, cap active jobs, monitor queue wait age, and create a policy for noisy services.          | No global traffic shaping or queue admission policy is implemented.                               |
| Notification delivery     | Implement provider adapters with idempotency keys, rate limits, dead-letter procedures, and delivery metrics. | Console logging does not expose external provider failure modes.                                  |
| Database-to-queue handoff | Introduce a transactional outbox table and relay process.                                                     | Startup reconciliation only repairs pending notification deliveries; it is not a full outbox.     |
| Observability             | Add metrics, traces, alerting, job dashboards, and audit events.                                              | Current observability is structured application logging only.                                     |
| Availability              | Add backups, restore testing, health checks, multi-zone database/Redis services, and DR runbooks.             | Docker Compose is not an HA deployment.                                                           |

## Database considerations

The most important tenant-safety rule remains keeping organization predicates on all scoped access paths. Indexes exist for membership lookup, organization incident listing, incidents by service/status, incidents by team/status, and rotation ordering. At scale, index changes should follow real query plans rather than be added blindly.

A connection pooler becomes important before simply adding API replicas. It protects PostgreSQL from a rapid increase in idle or bursty connections. Read replicas should be considered only after defining which endpoints tolerate replication lag; incident acknowledgement and escalation state must continue to use the primary because they make coordination decisions.

## Queue and backpressure considerations

BullMQ allows worker replicas to share a Redis queue. The current database conditions are still necessary when worker count increases because queue systems normally provide at-least-once processing. Useful operational signals include queue depth, delayed-job age, retries, final failures, delivery claim lease expiry, and time from incident creation to first notification.

Backpressure should be explicit. Possible future measures are per-organization rate limits, service-level incident deduplication, severity-aware worker pools, and a manual incident creation fallback. None is enabled in the current scope because each introduces operational and product semantics that should be decided deliberately.

## Eventual consistency and idempotency

The synchronous API transaction makes the incident and its delivery record durable. Queue insertion and provider delivery are asynchronous, so callers receive a created incident before delivery happens. That is intentional eventual consistency.

The implementation's key idempotency boundaries are database-enforced delivery steps, conditional delivery claims, and expected escalation-step checks. A real external provider should receive an idempotency key derived from the delivery ID. A transactional outbox is the next design step when guaranteed publication from PostgreSQL to Redis becomes more important than the simpler startup reconciliation strategy.

## Rate limiting and security evolution

PulseOps currently relies on JWT, role checks, input validation, safe errors, and security headers. At higher exposure, add an edge rate limiter and optionally a Redis-backed per-account or per-IP limiter, while preserving exceptions for operational responders. Security event logging, secret rotation procedures, and audit trails are future work rather than implemented claims.
