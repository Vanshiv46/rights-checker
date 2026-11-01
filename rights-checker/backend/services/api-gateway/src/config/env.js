import { baseEnvShape, dbEnvShape, loadDotEnvIfPresent, loadEnv, urlSchema } from '@rec/common';
import { z } from 'zod';

const bodyLimit = z.string().regex(/^\d+(kb|mb)$/);

const envSchema = z.object({
  ...baseEnvShape,
  ...dbEnvShape,
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(z.array(urlSchema).min(1)),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  VOICE_MAX_BODY: bodyLimit.default('1mb'),
  OCR_MAX_BODY: bodyLimit.default('2mb'),
  VOICE_TIMEOUT_MS: z.coerce.number().int().min(500).default(10_000),
  /** LLM explanations take a few seconds; the 2s internal default is too short. */
  AI_TIMEOUT_MS: z.coerce.number().int().min(500).default(20_000),
  /** Folder with the built frontend (frontend/dist); when set, the gateway serves the app too. */
  FRONTEND_DIST: z.string().min(1).optional(),
  SESSION_SERVICE_URL: urlSchema,
  ELIGIBILITY_SERVICE_URL: urlSchema,
  SCHEME_SERVICE_URL: urlSchema,
  AI_SERVICE_URL: urlSchema,
  VOICE_SERVICE_URL: urlSchema,
  OCR_SERVICE_URL: urlSchema,
});

/** Reads and validates configuration; throws on any invalid value (fail fast). */
export function loadConfig() {
  loadDotEnvIfPresent();
  return loadEnv(envSchema);
}
