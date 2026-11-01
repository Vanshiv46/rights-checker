import { hostname } from 'node:os';
import {
  createLogger,
  createRedisEventBus,
  createSequelize,
  databaseIsUp,
  registerShutdown,
} from '@rec/common';
import { Redis } from 'ioredis';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { startExpiryJob } from './jobs/bullmq-expiry.js';
import { initModels } from './models/index.js';
import { SequelizeSessionRepository } from './repositories/sequelize-session-repository.js';
import { SessionService } from './services/session-service.js';

const config = loadConfig();
const logger = createLogger('session-service', config.LOG_LEVEL);
const sequelize = createSequelize(config, logger);
initModels(sequelize);

const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const bus = createRedisEventBus({
  redis,
  subscriber: new Redis(config.REDIS_URL, { lazyConnect: true }),
  group: 'session-service',
  consumer: hostname(),
  logger,
});

const sessions = new SessionService(
  new SequelizeSessionRepository(sequelize),
  bus,
  logger,
  config.SESSION_TTL_HOURS,
);
const app = createApp({
  logger,
  serviceToken: config.SERVICE_TOKEN,
  sessions,
  readiness: async () => ({
    mysql: await databaseIsUp(sequelize),
    redis: redis.status === 'ready',
  }),
});

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'session-service listening');
});

const expiryJob = await startExpiryJob(redis, sessions, config.EXPIRY_JOB_EVERY_MS, logger);

registerShutdown(
  server,
  [
    { name: 'expiry-job', close: () => expiryJob.close() },
    { name: 'event-bus', close: () => bus.close() },
    { name: 'redis', close: () => redis.quit() },
    { name: 'mysql', close: () => sequelize.close() },
  ],
  logger,
);
