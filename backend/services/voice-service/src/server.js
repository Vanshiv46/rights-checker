import { createLogger, registerShutdown } from '@rec/common';
import { createApp } from './app.js';
import { createGroqSpeechClient } from './clients/groq-client.js';
import { loadConfig } from './config/env.js';
import { VoiceService } from './services/voice-service.js';

const config = loadConfig();
const logger = createLogger('voice-service', config.LOG_LEVEL);

const speech = createGroqSpeechClient({
  apiKey: config.GROQ_API_KEY,
  model: config.GROQ_STT_MODEL,
  baseUrl: config.GROQ_BASE_URL,
  timeoutMs: config.VOICE_TIMEOUT_MS,
  logger,
});
if (!config.GROQ_API_KEY) {
  logger.warn('GROQ_API_KEY is not set; voice endpoints will answer 503 VOICE_UNAVAILABLE');
}

const app = createApp({
  logger,
  serviceToken: config.SERVICE_TOKEN,
  voice: new VoiceService(speech),
  jsonLimit: config.VOICE_MAX_BODY,
});

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'voice-service listening');
});

registerShutdown(
  server,
  [
    {
      name: 'groq-stt',
      close: async () => {
        speech.shutdown();
        await Promise.resolve();
      },
    },
  ],
  logger,
);
