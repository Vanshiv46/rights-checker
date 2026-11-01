import { createBaseApp, finalizeApp } from '@rec/common';

import { createVoiceController } from './controllers/voice-controller.js';
import { createRouter } from './routes/index.js';

/** Builds the voice-service Express app (no database). */
export function createApp(deps) {
  const app = createBaseApp({
    logger: deps.logger,
    jsonLimit: deps.jsonLimit,
    readiness: () => Promise.resolve({ process: true }),
  });
  app.use(createRouter(createVoiceController(deps.voice), deps.serviceToken));
  return finalizeApp(app, deps.logger);
}
