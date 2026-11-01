import { existsSync } from 'node:fs';
import { z } from 'zod';

export const logLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

/** Env vars every service needs. */
export const baseEnvShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: logLevelSchema.default('info'),
  PORT: z.coerce.number().int().min(1).max(65535),
  SERVICE_TOKEN: z.string().min(16, 'SERVICE_TOKEN must be at least 16 characters'),
};

export const dbEnvShape = {
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  /** Cloud MySQL (Aiven, etc.) needs TLS: DB_SSL=true, optionally DB_SSL_CA with the CA PEM. */
  DB_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DB_SSL_CA: z.string().optional(),
};

export const redisEnvShape = {
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'REDIS_URL must start with redis://'),
};

export const urlSchema = z.url({ protocol: /^https?$/ });

/** Parses env with a zod schema and throws (fail fast) with every problem listed. */
export function loadEnv(schema, source = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration: ${problems.join('; ')}`);
  }
  return result.data;
}

/** Loads `.env` from the working directory when present (real env vars win). */
export function loadDotEnvIfPresent(path = '.env') {
  if (existsSync(path)) process.loadEnvFile(path);
}
