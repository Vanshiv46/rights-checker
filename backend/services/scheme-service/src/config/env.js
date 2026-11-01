import { baseEnvShape, dbEnvShape, loadDotEnvIfPresent, loadEnv, redisEnvShape } from '@rec/common';
import { z } from 'zod';

const envSchema = z.object({ ...baseEnvShape, ...dbEnvShape, ...redisEnvShape });

/** Reads and validates configuration; throws on any invalid value (fail fast). */
export function loadConfig() {
  loadDotEnvIfPresent();
  return loadEnv(envSchema);
}
