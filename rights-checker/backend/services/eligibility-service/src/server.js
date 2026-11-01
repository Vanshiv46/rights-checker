import { hostname } from 'node:os';
import {
  createLogger,
  createRedisEventBus,
  createSchemeClient,
  createSequelize,
  createServiceClient,
  createSessionClient,
  databaseIsUp,
  registerShutdown,
} from '@rec/common';
import { Redis } from 'ioredis';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { registerConsumers } from './events/consumers.js';
import { initModels } from './models/index.js';
import { SequelizeEvaluationRepository } from './repositories/sequelize-evaluation-repository.js';
import { EligibilityService } from './services/eligibility-service.js';
import { RuleCache } from './services/rule-cache.js';

const config = loadConfig();
const logger = createLogger('eligibility-service', config.LOG_LEVEL);
const sequelize = createSequelize(config, logger);
initModels(sequelize);

const redis = new Redis(config.REDIS_URL);
const bus = createRedisEventBus({
  redis,
  subscriber: new Redis(config.REDIS_URL),
  group: 'eligibility-service',
  consumer: hostname(),
  logger,
});

const schemeHttp = createServiceClient({
  name: 'scheme-service',
  baseUrl: config.SCHEME_SERVICE_URL,
  serviceToken: config.SERVICE_TOKEN,
  logger,
});
const sessionHttp = createServiceClient({
  name: 'session-service',
  baseUrl: config.SESSION_SERVICE_URL,
  serviceToken: config.SERVICE_TOKEN,
  logger,
});

const cache = new RuleCache(createSchemeClient(schemeHttp), logger);
const eligibility = new EligibilityService(
  cache,
  createSessionClient(sessionHttp),
  new SequelizeEvaluationRepository(sequelize),
  bus,
  logger,
);
registerConsumers(bus, cache, eligibility);

const app = createApp({
  logger,
  serviceToken: config.SERVICE_TOKEN,
  eligibility,
  readiness: async () => ({
    mysql: await databaseIsUp(sequelize),
    redis: redis.status === 'ready',
    rules: cache.isLoaded(),
  }),
});

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'eligibility-service listening');
});

/** Keeps trying to fill the rule cache until scheme-service answers. */
const retryTimer = setInterval(() => {
  if (cache.isLoaded()) {
    clearInterval(retryTimer);
    return;
  }
  cache.reload().catch(() => {
    logger.warn('rule cache not loaded yet; scheme-service unavailable');
  });
}, config.RULE_RELOAD_RETRY_MS);
retryTimer.unref();

void cache.reload().catch(() => {
  logger.warn('initial rule load failed; will retry');
});
void bus.start();

registerShutdown(
  server,
  [
    { name: 'event-bus', close: () => bus.close() },
    { name: 'redis', close: () => redis.quit() },
    { name: 'mysql', close: () => sequelize.close() },
    {
      name: 'http-clients',
      close: async () => {
        schemeHttp.shutdown();
        sessionHttp.shutdown();
        await Promise.resolve();
      },
    },
  ],
  logger,
);
