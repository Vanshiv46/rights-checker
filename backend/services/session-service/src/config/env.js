import { baseEnvShape, dbEnvShape, loadDotEnvIfPresent, loadEnv, redisEnvShape } from '@rec/common';
import { z } from 'zod';

const envSchema = z.object({
  ...baseEnvShape,
  ...dbEnvShape,
  ...redisEnvShape,
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  EXPIRY_JOB_EVERY_MS: z.coerce.number().int().min(10_000).default(900_000),
});

/** Reads and validates configuration; throws on any invalid value (fail fast). */
export function loadConfig() {
  loadDotEnvIfPresent();
  return loadEnv(envSchema);
}
