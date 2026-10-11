import { createHmac } from 'node:crypto';

export interface SignedWebhook {
  body: string;
  timestamp: number;
  signature: string;
}

export function signWebhookPayload(
  secret: string,
  eventId: string,
  payload: Record<string, unknown>,
  timestamp = Date.now(),
): SignedWebhook {
  const body = JSON.stringify({ eventId, timestamp, payload });
  const digest = createHmac('sha256', secret).update(body).digest('hex');

  return {
    body,
    timestamp,
    signature: `sha256=${digest}`,
  };
}
