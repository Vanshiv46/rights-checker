import { createBaseApp, finalizeApp } from '@rec/common';

import { createOcrController } from './controllers/ocr-controller.js';
import { createRouter } from './routes/index.js';

/** Builds the ocr-service Express app (no database). */
export function createApp(deps) {
  const app = createBaseApp({
    logger: deps.logger,
    jsonLimit: deps.jsonLimit,
    readiness: deps.readiness,
  });
  app.use(createRouter(createOcrController(deps.ocr), deps.serviceToken));
  return finalizeApp(app, deps.logger);
}
