import { createBaseApp, finalizeApp } from '@rec/common';

import { createSchemeController } from './controllers/scheme-controller.js';
import { createRouter } from './routes/index.js';

/** Builds the scheme-service Express app from its dependencies (easy to test). */
export function createApp(deps) {
  const app = createBaseApp({ logger: deps.logger, readiness: deps.readiness });
  app.use(createRouter(createSchemeController(deps.catalog), deps.serviceToken));
  return finalizeApp(app, deps.logger);
}
