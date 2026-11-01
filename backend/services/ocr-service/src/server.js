import { createLogger, registerShutdown } from '@rec/common';
import { Redis } from 'ioredis';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createBullmqOcrQueue } from './jobs/bullmq-ocr-queue.js';
import { MockOcrEngine } from './services/ocr-engine.js';
import { OcrService } from './services/ocr-service.js';

const config = loadConfig();
const logger = createLogger('ocr-service', config.LOG_LEVEL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

const services = {};
const queue = createBullmqOcrQueue(
  redis,
  (jobId, field) => {
    if (!services.ocr) throw new Error('ocr service not initialised');
    return services.ocr.process(jobId, field);
  },
  logger,
);
const ocr = new OcrService(new MockOcrEngine(), queue);
services.ocr = ocr;

const app = createApp({
  logger,
  serviceToken: config.SERVICE_TOKEN,
  ocr,
  jsonLimit: config.OCR_MAX_BODY,
  readiness: () => Promise.resolve({ redis: redis.status === 'ready' }),
});

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'ocr-service listening');
});

registerShutdown(
  server,
  [
    { name: 'ocr-queue', close: () => queue.close() },
    { name: 'redis', close: () => redis.quit() },
  ],
  logger,
);
