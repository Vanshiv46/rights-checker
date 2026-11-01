import { baseEnvShape, loadDotEnvIfPresent, loadEnv, redisEnvShape } from '@rec/common';
import { z } from 'zod';

const envSchema = z.object({
  ...baseEnvShape,
  ...redisEnvShape,
  OCR_MAX_BODY: z
    .string()
    .regex(/^\d+(kb|mb)$/)
    .default('2mb'),
});

/** Reads and validates configuration; throws on any invalid value (fail fast). */
export function loadConfig() {
  loadDotEnvIfPresent();
  return loadEnv(envSchema);
}
