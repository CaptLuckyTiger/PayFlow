type JwtSecretConfig = {
  get(key: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string | undefined;
};

export function getRequiredJwtSecret(config: JwtSecretConfig, key: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const secret = config.get(key);
  if (!secret || secret.trim().length < 32) {
    throw new Error(`${key} must be configured with at least 32 characters.`);
  }
  return secret;
}
