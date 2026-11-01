import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createBaseApp, finalizeApp } from '@rec/common';
import express from 'express';

import { createGatewayController } from './controllers/gateway-controller.js';

import { createV1Router } from './routes/index.js';

/** Single public entry point: security middleware, rate limits, auth, and routing to services. */
export function createApp(deps) {
  const app = createBaseApp({
    logger: deps.logger,
    readiness: deps.readiness,
    corsOrigins: deps.corsOrigins,
    trustProxy: true,
    largeBodyRoutes: [
      { path: '/v1/voice', limit: deps.voiceMaxBody },
      { path: '/v1/ocr', limit: deps.ocrMaxBody },
    ],
  });
  app.use(
    '/v1',
    createV1Router({
      controller: createGatewayController(deps.proxy, deps.auth),
      auth: deps.auth,
      audit: deps.audit,
      logger: deps.logger,
      ratePerMinute: deps.ratePerMinute,
      loginPerMinute: deps.loginPerMinute,
    }),
  );
  if (deps.frontendDist) serveFrontend(app, deps.frontendDist, deps.logger);
  return finalizeApp(app, deps.logger);
}

/**
 * Optional single-service deploy: serves the built React app from the same origin as the API, so
 * no CORS setup is needed. Unknown non-API paths get index.html so client-side routes survive a
 * reload. Does nothing (and warns) when the folder has no build.
 */
function serveFrontend(app, dist, logger) {
  const index = join(dist, 'index.html');
  if (!existsSync(index)) {
    logger.warn({ dist }, 'FRONTEND_DIST has no index.html; run "npm run build" in frontend/');
    return;
  }
  const noCache = (res) => res.setHeader('cache-control', 'no-cache');
  app.use(
    express.static(dist, {
      index: false,
      maxAge: '1h',
      setHeaders: (res, path) => {
        if (/(^|[\\/])(sw\.js|index\.html|manifest\.webmanifest|registerSW\.js)$/.test(path)) {
          noCache(res);
        }
      },
    }),
  );
  app.get(/^\/(?!v1(?:\/|$)|health|ready).*/, (_req, res) => {
    noCache(res);
    res.sendFile(index);
  });
}
