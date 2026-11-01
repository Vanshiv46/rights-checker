import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { errorHandler, notFoundHandler, requestIdMiddleware, requestLogger } from './middleware.js';
import { sendData, sendError } from './response.js';

async function safeReadiness(check) {
  try {
    return await check();
  } catch {
    return { dependencies: false };
  }
}

/**
 * Express app with the middleware every service shares: request id, logging, helmet, CORS
 * allowlist, compression, a 100kb JSON limit and GET /health + GET /ready.
 */
export function createBaseApp(options) {
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy) app.set('trust proxy', 1);
  app.use(requestIdMiddleware);
  app.use(requestLogger(options.logger));
  app.use(helmet());
  if (options.corsOrigins) {
    const allowlist = new Set(options.corsOrigins);
    app.use(
      cors({
        origin: (origin, callback) => {
          callback(null, origin === undefined || allowlist.has(origin));
        },
        exposedHeaders: ['x-request-id'],
      }),
    );
  }
  app.use(compression());
  for (const route of options.largeBodyRoutes ?? []) {
    app.use(route.path, express.json({ limit: route.limit }));
  }
  app.use(express.json({ limit: options.jsonLimit ?? '100kb' }));

  app.get('/health', (_req, res) => {
    sendData(res, { status: 'ok' });
  });
  app.get('/ready', async (_req, res) => {
    const checks = await safeReadiness(options.readiness);
    if (Object.values(checks).every(Boolean)) {
      sendData(res, { status: 'ready', checks });
      return;
    }
    sendError(res, 503, 'NOT_READY', 'A dependency is not ready', checks);
  });
  return app;
}

/** Adds the 404 and central error handlers; call after all routes are mounted. */
export function finalizeApp(app, logger) {
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
