import {
  createEligibilityClient,
  createLogger,
  createSchemeClient,
  createServiceClient,
  registerShutdown,
} from '@rec/common';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { GroqProvider, withFallback } from './llm/groq-provider.js';
import { MockProvider } from './llm/mock-provider.js';
import { AiService } from './services/ai-service.js';

const config = loadConfig();
const logger = createLogger('ai-service', config.LOG_LEVEL);

const eligibilityHttp = createServiceClient({
  name: 'eligibility-service',
  baseUrl: config.ELIGIBILITY_SERVICE_URL,
  serviceToken: config.SERVICE_TOKEN,
  logger,
});
const schemeHttp = createServiceClient({
  name: 'scheme-service',
  baseUrl: config.SCHEME_SERVICE_URL,
  serviceToken: config.SERVICE_TOKEN,
  logger,
});

const llm =
  config.LLM_PROVIDER === 'groq'
    ? withFallback(
        new GroqProvider({
          apiKey: config.GROQ_API_KEY,
          model: config.GROQ_MODEL,
          baseUrl: config.GROQ_BASE_URL,
          timeoutMs: config.LLM_TIMEOUT_MS,
        }),
        new MockProvider(),
        logger,
      )
    : new MockProvider();
if (config.LLM_PROVIDER === 'mock') {
  logger.warn('GROQ_API_KEY not set: explanations use the built-in template (no AI)');
}

const ai = new AiService(
  llm,
  createEligibilityClient(eligibilityHttp),
  createSchemeClient(schemeHttp),
  logger,
);
const app = createApp({ logger, serviceToken: config.SERVICE_TOKEN, ai });

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, provider: llm.name }, 'ai-service listening');
});

registerShutdown(
  server,
  [
    {
      name: 'http-clients',
      close: async () => {
        eligibilityHttp.shutdown();
        schemeHttp.shutdown();
        await Promise.resolve();
      },
    },
  ],
  logger,
);
