import { ConfigService } from '@nestjs/config';

export function getRequiredJwtSecret(config: ConfigService, key: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const secret = config.get<string>(key);
  if (!secret || secret.trim().length < 32) {
    throw new Error(`${key} must be configured with at least 32 characters.`);
  }
  return secret;
}
