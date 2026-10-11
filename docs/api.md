# PayFlow API contract

The API is served under the `/v1` prefix and requires a bearer JWT token for protected routes.

## Authentication

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `GET /v1/auth/me`

## Accounts

- `POST /v1/accounts`
- `GET /v1/accounts`
- `GET /v1/accounts/:id`
- `GET /v1/accounts/:id/ledger`

## Payments

- `POST /v1/payments`
- `GET /v1/payments`
- `GET /v1/payments/:id`
- `POST /v1/payments/:id/cancel`

## Webhooks

- `POST /v1/webhooks/endpoints`
- `GET /v1/webhooks/endpoints`
- `DELETE /v1/webhooks/endpoints/:id`
- `GET /v1/webhooks/deliveries`

## Error semantics

- `400`: invalid payload or invalid resource state.
- `401`: missing or invalid JWT.
- `403`: authenticated but not authorized for a resource.
- `404`: resource not found.
- `409`: idempotency key reused with different payload.
- `500`: unexpected server-side failure.
