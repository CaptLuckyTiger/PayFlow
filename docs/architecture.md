# Architecture overview

The project is a modular monolith with two executable processes:

- `apps/api`: HTTP transport layer and business endpoints.
- `apps/worker`: transactional outbox dispatcher and async processing.

The code separates controllers, DTOs, services, persistence, providers, and queue-driven workers. The same PostgreSQL database stores the domain state and outbox events. Redis holds BullMQ queue state and job coordination.

## Core model

- `User` owns accounts and payment requests.
- `Account` represents a user-managed simulated ledger account.
- `Payment` stores the amount and current processing state.
- `LedgerEntry` is append-only and represents the immutable financial record.
- `IdempotencyRecord` guarantees repeated requests with the same key return the same logical result.
- `OutboxEvent` persists events before they are published to BullMQ.
- `WebhookEndpoint` and `WebhookDelivery` provide signed webhook delivery tracking.

## Processing flow

1. API receives a payment request and verifies the idempotency key.
2. A PostgreSQL transaction creates the payment and a corresponding outbox event.
3. Worker poller detects pending outbox rows and dispatches them to BullMQ.
4. Consumer claims each event, calls the shared fake provider, and records the final payment state.
5. Approved payments receive one debit ledger entry in the same transaction as settlement.
6. Active webhook endpoints receive signed `payment.updated` callbacks through the worker queue; each endpoint/event pair is unique and transient delivery errors are retried.

## Security model

- Passwords are hashed with Argon2.
- JWT is used for access and refresh tokens.
- Webhook URLs are validated to reject localhost, private networks, and cloud metadata endpoints.
- Payloads are signed with HMAC-SHA256.
- Rate limiting and CORS are configured at the app layer.
