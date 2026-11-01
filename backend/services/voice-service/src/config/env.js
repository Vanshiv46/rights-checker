import { baseEnvShape, loadDotEnvIfPresent, loadEnv, urlSchema } from '@rec/common';
import { z } from 'zod';

const optional = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  ...baseEnvShape,
  /** Same key as ai-service; used for Groq's hosted Whisper speech-to-text. */
  GROQ_API_KEY: optional(z.string().min(8)),
  GROQ_STT_MODEL: z.string().min(1).default('whisper-large-v3-turbo'),
  GROQ_BASE_URL: optional(urlSchema),
  VOICE_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(10_000),
  VOICE_MAX_BODY: z
    .string()
    .regex(/^\d+(kb|mb)$/)
    .default('1mb'),
});

/** Reads and validates configuration; GROQ_API_KEY is optional (voice then returns 503). */
export function loadConfig() {
  loadDotEnvIfPresent();
  return loadEnv(envSchema);
}
