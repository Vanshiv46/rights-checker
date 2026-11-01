import {
  baseEnvShape,
  dbEnvShape,
  loadDotEnvIfPresent,
  loadEnv,
  redisEnvShape,
  urlSchema,
} from '@rec/common';
import { z } from 'zod';

const envSchema = z.object({
  ...baseEnvShape,
  ...dbEnvShape,
  ...redisEnvShape,
  SCHEME_SERVICE_URL: urlSchema,
  SESSION_SERVICE_URL: urlSchema,
  RULE_RELOAD_RETRY_MS: z.coerce.number().int().min(500).default(5000),
});

/** Reads and validates configuration; throws on any invalid value (fail fast). */
export function loadConfig() {
  loadDotEnvIfPresent();
  return loadEnv(envSchema);
}
