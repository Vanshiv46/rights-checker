import { baseEnvShape, loadDotEnvIfPresent, loadEnv, urlSchema } from '@rec/common';
import { z } from 'zod';

const optional = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z
  .object({
    ...baseEnvShape,
    ELIGIBILITY_SERVICE_URL: urlSchema,
    SCHEME_SERVICE_URL: urlSchema,
    /** "groq" uses Groq (falls back to the built-in mock on errors); "mock" is offline only. */
    LLM_PROVIDER: optional(z.enum(['mock', 'groq'])),
    GROQ_API_KEY: optional(z.string().min(10)),
    GROQ_MODEL: z.string().min(1).default('llama-3.3-70b-versatile'),
    GROQ_BASE_URL: urlSchema.default('https://api.groq.com/openai/v1'),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
  })
  .transform((env) => ({
    ...env,
    LLM_PROVIDER: env.LLM_PROVIDER ?? (env.GROQ_API_KEY ? 'groq' : 'mock'),
  }))
  .refine((env) => env.LLM_PROVIDER !== 'groq' || env.GROQ_API_KEY, {
    message: 'GROQ_API_KEY is required when LLM_PROVIDER=groq',
    path: ['GROQ_API_KEY'],
  });

/** Reads and validates configuration; throws on any invalid value (fail fast). */
export function loadConfig() {
  loadDotEnvIfPresent();
  return loadEnv(envSchema);
}
