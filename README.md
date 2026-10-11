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

1. Install locked dependencies:
   ```sh
   npm ci
   ```
2. Copy `.env.example` to `.env`. Set different random values of at least 32 characters for `JWT_SECRET` and `JWT_REFRESH_SECRET` (for example, generate each with `openssl rand -base64 48`).
3. Start infrastructure:
   ```sh
   docker compose up -d postgres redis
   ```
4. Generate Prisma Client and apply the checked-in migrations:
   ```sh
   npm run db:generate
   npm run db:deploy
   ```
5. Start API and worker in separate terminals:
   ```sh
   npm run dev:api
   npm run dev:worker
   ```

The Compose PostgreSQL service is exposed at `127.0.0.1:5433` to avoid conflicting with a PostgreSQL server already using host port `5432`. Redis is exposed at `127.0.0.1:6379`.
The API exits during startup if either JWT secret is absent, shorter than 32 characters, or identical to the other.

## Validate locally

With Docker Desktop running and `.env` configured, run:

```sh
npm run build
npm run lint
npm run format:check
npm run test:unit
npm run test:integration
npm run test:e2e
```

The integration suite requires PostgreSQL. The E2E suite also starts the API and outbox worker in-process and requires both PostgreSQL and Redis.

## Webhook delivery policy

- Webhook endpoints must use HTTPS on the default port, without URL credentials or fragments.
- `ALLOWED_WEBHOOK_HOSTS` is an optional comma-separated list of exact hostnames. When set, only those hosts can be registered or delivered to; wildcards and suffix matches are not supported. Leave it empty to allow arbitrary hostnames that pass the public-address checks.
- At delivery time the worker resolves the hostname for each new connection and rejects the destination if any resolved address is non-public, including private, loopback, link-local, reserved, or IPv4-mapped private addresses. The resolved public address is pinned to that connection to prevent DNS rebinding between validation and connect.
- Redirects are not followed. A redirect response is treated as a failed delivery and may be retried.
- Endpoint secrets are returned when the endpoint is created so the owner can configure signature verification. They are not returned by list APIs. The current database stores endpoint secrets in plaintext; use only trusted local data until encryption-at-rest and production secret management are implemented.

## Payment and worker guarantees

- A payment may be cancelled only while `PENDING`. Cancellation is a conditional database update, so it cannot override a concurrent worker transition. Cancelling an approved payment is not supported because no refund/ledger reversal flow exists.
- Outbox claims have a five-minute lease and a heartbeat while payment processing is active. A later poll reclaims claims left stale by a worker crash. Ledger writes are idempotent by payment and entry type.
- The payment provider is a simulator. If a real provider is added, provider requests must use the payment ID as an idempotency key; the current worker lease alone cannot guarantee exactly-once effects at an external provider.

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
- PostgreSQL enforces that each payment's account belongs to the same user through a composite foreign key.
- Refresh tokens are persisted and rotated atomically; a token can only be used once before expiry.
