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
import { initModels } from './models/index.js';
import { SequelizeSchemeRepository } from './repositories/sequelize-scheme-repository.js';
import { SchemeCatalogService } from './services/scheme-catalog-service.js';

const config = loadConfig();
const logger = createLogger('scheme-service', config.LOG_LEVEL);
const sequelize = createSequelize(config, logger);
initModels(sequelize);

const redis = new Redis(config.REDIS_URL);
const bus = createRedisEventBus({
  redis,
  subscriber: new Redis(config.REDIS_URL, { lazyConnect: true }),
  group: 'scheme-service',
  consumer: hostname(),
  logger,
});

const catalog = new SchemeCatalogService(new SequelizeSchemeRepository(sequelize), bus, logger);
const app = createApp({
  logger,
  serviceToken: config.SERVICE_TOKEN,
  catalog,
  readiness: async () => ({
    mysql: await databaseIsUp(sequelize),
    redis: redis.status === 'ready',
  }),
});

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'scheme-service listening');
});

registerShutdown(
  server,
  [
    { name: 'event-bus', close: () => bus.close() },
    { name: 'redis', close: () => redis.quit() },
    { name: 'mysql', close: () => sequelize.close() },
  ],
  logger,
);
