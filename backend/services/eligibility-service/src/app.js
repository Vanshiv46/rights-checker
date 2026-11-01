import { createBaseApp, finalizeApp } from '@rec/common';

import { createEligibilityController } from './controllers/eligibility-controller.js';
import { createRouter } from './routes/index.js';

/** Builds the eligibility-service Express app. */
export function createApp(deps) {
  const app = createBaseApp({ logger: deps.logger, readiness: deps.readiness });
  app.use(createRouter(createEligibilityController(deps.eligibility), deps.serviceToken));
  return finalizeApp(app, deps.logger);
}
