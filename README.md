# PayFlow

PayFlow is a NestJS + Prisma + PostgreSQL + Redis payment simulation backend that demonstrates an idempotent payment workflow, transactional outbox, queued processing, and webhook support.

## Stack

- Node.js 20 LTS
- TypeScript strict mode
- NestJS 10
- PostgreSQL 16
- Prisma 5
- Redis 7
- BullMQ
- JWT + Argon2
- Swagger / OpenAPI
- Jest + Supertest

## Quick start

1. Install dependencies:
   npm install
2. Copy `.env.example` to `.env` and adjust values.
3. Start infrastructure:
   docker compose up -d postgres redis
4. Run Prisma migrations:
   npm run db:generate
   npm run db:migrate
5. Start API:
   npm run dev:api
6. Start worker:
   npm run dev:worker

The Compose PostgreSQL service is exposed at `127.0.0.1:5433` to avoid conflicting with a PostgreSQL server already using host port `5432`. Redis is exposed at `127.0.0.1:6379`.

## Validate locally

With Docker Desktop running and `.env` configured, run:

```sh
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
```

The integration suite requires PostgreSQL. The E2E suite also starts the API and outbox worker in-process and requires both PostgreSQL and Redis.

## Required endpoints

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `GET /v1/auth/me`
- `POST /v1/accounts`
- `GET /v1/accounts`
- `GET /v1/accounts/:id`
- `GET /v1/accounts/:id/ledger`
- `POST /v1/payments`
- `GET /v1/payments`
- `GET /v1/payments/:id`
- `POST /v1/payments/:id/cancel`
- `POST /v1/webhooks/endpoints`
- `GET /v1/webhooks/endpoints`
- `DELETE /v1/webhooks/endpoints/:id`
- `GET /v1/webhooks/deliveries`

## Notes

- Money is stored as integer minor units to prevent float precision issues.
- Payment idempotency is enforced with a unique `(userId, key)` index and a request hash.
- The outbox persists events before publication and worker recovery replays them.
- Webhook payloads are signed with HMAC-SHA256 and include event metadata.
- PostgreSQL is published on host port `5433` to avoid conflicts with a local PostgreSQL service on `5432`.
- PostgreSQL enforces positive payment and ledger amounts through a custom SQL migration; Prisma 5 does not express these check constraints in its schema language.
