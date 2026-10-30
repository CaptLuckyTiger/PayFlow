import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`payflow:webhook-secret:${secret}`).digest();
}

export function encryptWebhookSecret(secret: string, keySecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(keySecret), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptWebhookSecret(storedSecret: string, keySecret: string): string {
  if (!storedSecret.startsWith(`${VERSION}:`)) {
    return storedSecret;
  }

  const [, encodedIv, encodedTag, encodedValue] = storedSecret.split(':');
  if (!encodedIv || !encodedTag || !encodedValue) {
    throw new Error('Stored webhook secret has an invalid format.');
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(keySecret), Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encodedValue, 'base64url')), decipher.final()]).toString('utf8');
}
