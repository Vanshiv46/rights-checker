import { resolve } from 'node:path';
import {
  createLogger,
  createSequelize,
  createServiceClient,
  databaseIsUp,
  registerShutdown,
} from '@rec/common';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { initModels } from './models/index.js';
import {
  SequelizeAuditRepository,
  SequelizeOperatorRepository,
} from './repositories/sequelize-auth-repositories.js';
import { AuthService } from './services/auth-service.js';
import { ProxyService } from './services/proxy-service.js';

const config = loadConfig();
const logger = createLogger('api-gateway', config.LOG_LEVEL);
const sequelize = createSequelize(config, logger);
initModels(sequelize);

const client = (name, baseUrl, timeoutMs) =>
  createServiceClient({
    name,
    baseUrl,
    serviceToken: config.SERVICE_TOKEN,
    logger,
    ...(timeoutMs ? { timeoutMs } : {}),
  });

const upstreams = {
  session: client('session-service', config.SESSION_SERVICE_URL),
  eligibility: client('eligibility-service', config.ELIGIBILITY_SERVICE_URL),
  scheme: client('scheme-service', config.SCHEME_SERVICE_URL),
  ai: client('ai-service', config.AI_SERVICE_URL, config.AI_TIMEOUT_MS),
  // Speech recognition is slower than the 2s internal default.
  voice: client('voice-service', config.VOICE_SERVICE_URL, config.VOICE_TIMEOUT_MS),
  ocr: client('ocr-service', config.OCR_SERVICE_URL),
};

const audit = new SequelizeAuditRepository();
const app = createApp({
  logger,
  proxy: new ProxyService(upstreams),
  auth: new AuthService(
    new SequelizeOperatorRepository(),
    audit,
    config.JWT_SECRET,
    config.JWT_EXPIRES_IN_SECONDS,
  ),
  audit,
  readiness: async () => ({ mysql: await databaseIsUp(sequelize) }),
  corsOrigins: config.CORS_ORIGINS,
  ratePerMinute: config.RATE_LIMIT_PER_MINUTE,
  loginPerMinute: config.LOGIN_RATE_LIMIT_PER_MINUTE,
  voiceMaxBody: config.VOICE_MAX_BODY,
  ocrMaxBody: config.OCR_MAX_BODY,
  frontendDist: config.FRONTEND_DIST ? resolve(config.FRONTEND_DIST) : undefined,
});

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'api-gateway listening');
});

registerShutdown(
  server,
  [
    { name: 'mysql', close: () => sequelize.close() },
    {
      name: 'http-clients',
      close: async () => {
        Object.values(upstreams).forEach((u) => {
          u.shutdown();
        });
        await Promise.resolve();
      },
    },
  ],
  logger,
);
