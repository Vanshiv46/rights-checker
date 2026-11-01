import { createBaseApp, finalizeApp } from '@rec/common';

import { createAiController } from './controllers/ai-controller.js';
import { createRouter } from './routes/index.js';

/** Builds the ai-service Express app (no database; always ready once started). */
export function createApp(deps) {
  const app = createBaseApp({
    logger: deps.logger,
    readiness: () => Promise.resolve({ process: true }),
  });
  app.use(createRouter(createAiController(deps.ai), deps.serviceToken));
  return finalizeApp(app, deps.logger);
}
