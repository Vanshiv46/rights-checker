import { createBaseApp, finalizeApp } from '@rec/common';

import { createSessionController } from './controllers/session-controller.js';
import { createRouter } from './routes/index.js';

/** Builds the session-service Express app. */
export function createApp(deps) {
  const app = createBaseApp({ logger: deps.logger, readiness: deps.readiness });
  app.use(createRouter(createSessionController(deps.sessions), deps.serviceToken));
  return finalizeApp(app, deps.logger);
}
