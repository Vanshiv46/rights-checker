import { AppError } from '@rec/common';
import CircuitBreaker from 'opossum';
import { z } from 'zod';

/**
 * Speech adapter; every failure surfaces as 503 VOICE_UNAVAILABLE so clients fall back to text.
 * @typedef {object} SpeechClient
 * @property {(audioBase64: string, language: string) => Promise<string>} transcribe
 * @property {(text: string, language: string, gender: 'female' | 'male') => Promise<string>} speak
 * @property {() => void} shutdown
 */

export const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
export const DEFAULT_STT_MODEL = 'whisper-large-v3-turbo';

/** Languages Whisper knows; others (e.g. Odia) are sent without a hint so Whisper auto-detects. */
const WHISPER_LANGUAGES = new Set([
  'en',
  'hi',
  'bn',
  'ta',
  'te',
  'mr',
  'gu',
  'kn',
  'ml',
  'pa',
  'as',
  'ur',
]);

const transcriptionSchema = z.object({ text: z.string() });

export const voiceUnavailable = () =>
  new AppError(503, 'VOICE_UNAVAILABLE', 'Voice is unavailable right now; please type your answer');

/**
 * Speech-to-text through Groq's hosted Whisper (same GROQ_API_KEY as the explanations).
 * Text-to-speech is not offered here: `speak` always answers 503 and the website reads text aloud
 * with the browser's own speech synthesis instead. Timeout and circuit breaker on every call.
 * @param {{ apiKey?: string, model?: string, baseUrl?: string, timeoutMs: number,
 *   fetchImpl?: typeof fetch, logger: import('pino').Logger }} config
 * @returns {SpeechClient}
 */
export function createGroqSpeechClient(config) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');

  const post = async (form) => {
    const res = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!res.ok) throw new Error(`Groq responded ${res.status}`);
    return res.json();
  };
  const breaker = new CircuitBreaker(post, {
    timeout: false,
    errorThresholdPercentage: 50,
    volumeThreshold: 5,
    resetTimeout: 30_000,
    name: 'groq-stt',
  });

  return {
    async transcribe(audioBase64, language) {
      try {
        if (!config.apiKey) throw new Error('GROQ_API_KEY is not configured');
        const form = new FormData();
        form.append(
          'file',
          new Blob([Buffer.from(audioBase64, 'base64')], { type: 'audio/wav' }),
          'speech.wav',
        );
        form.append('model', config.model ?? DEFAULT_STT_MODEL);
        form.append('response_format', 'json');
        form.append('temperature', '0');
        if (WHISPER_LANGUAGES.has(language)) form.append('language', language);
        return transcriptionSchema.parse(await breaker.fire(form)).text;
      } catch (err) {
        config.logger.warn(
          { reason: err instanceof Error ? err.message : 'unknown' },
          'groq transcription failed',
        );
        throw voiceUnavailable();
      }
    },
    speak() {
      return Promise.reject(voiceUnavailable());
    },
    shutdown() {
      breaker.shutdown();
    },
  };
}
