import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AppError,
  createBaseApp,
  createLogger,
  currentRequestId,
  Errors,
  finalizeApp,
  parseOrThrow,
  sendData,
  serviceAuth,
} from '../src/index.js';

const logger = createLogger('test', 'silent');

function buildApp(ready = true) {
  const app = createBaseApp({
    logger,
    corsOrigins: ['https://allowed.example'],
    readiness: async () => {
      if (!ready) throw new Error('db down');
      return { db: true };
    },
  });
  app.get('/boom', () => {
    throw new Error('kaput');
  });
  app.get('/app-error', () => {
    throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'x is down', { dependency: 'x' });
  });
  app.post('/echo', (req, res) => {
    const body = parseOrThrow(z.object({ n: z.number() }), req.body, 'body');
    sendData(res, { n: body.n, requestId: currentRequestId() }, { status: 201 });
  });
  app.get('/internal', serviceAuth('a-very-secret-token'), (_req, res) => {
    sendData(res, { ok: true });
  });
  return finalizeApp(app, logger);
}

describe('createBaseApp', () => {
  it('serves /health with the success envelope and a request id', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });

  it('reports readiness and 503 when a check throws', async () => {
    expect((await request(buildApp()).get('/ready')).status).toBe(200);
    const res = await request(buildApp(false)).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('NOT_READY');
  });

  it('propagates a valid incoming x-request-id', async () => {
    const res = await request(buildApp())
      .post('/echo')
      .set('x-request-id', 'req-12345678')
      .send({ n: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.requestId).toBe('req-12345678');
    expect(res.headers['x-request-id']).toBe('req-12345678');
  });

  it('returns 400 with issue details on invalid bodies', async () => {
    const res = await request(buildApp()).post('/echo').send({ n: 'one' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('n');
  });

  it('returns 400 on malformed JSON and 413 on oversized bodies', async () => {
    const bad = await request(buildApp())
      .post('/echo')
      .set('content-type', 'application/json')
      .send('{');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('MALFORMED_JSON');
    const big = await request(buildApp())
      .post('/echo')
      .send({ n: 1, pad: 'x'.repeat(120_000) });
    expect(big.status).toBe(413);
  });

  it('maps AppError and unknown errors to the error envelope', async () => {
    const app = buildApp();
    const typed = await request(app).get('/app-error');
    expect(typed.status).toBe(503);
    expect(typed.body.error).toEqual({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'x is down',
      details: { dependency: 'x' },
    });
    const unknown = await request(app).get('/boom');
    expect(unknown.status).toBe(500);
    expect(unknown.body.error.code).toBe('INTERNAL_ERROR');
    const missing = await request(app).get('/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('enforces the service token on internal routes', async () => {
    const app = buildApp();
    expect((await request(app).get('/internal')).status).toBe(401);
    expect((await request(app).get('/internal').set('x-service-token', 'wrong')).status).toBe(401);
    const ok = await request(app).get('/internal').set('x-service-token', 'a-very-secret-token');
    expect(ok.status).toBe(200);
  });

  it('only reflects allowlisted CORS origins', async () => {
    const app = buildApp();
    const allowed = await request(app).get('/health').set('origin', 'https://allowed.example');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://allowed.example');
    const denied = await request(app).get('/health').set('origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Errors helpers', () => {
  it('build typed errors with the right statuses', () => {
    expect(Errors.unauthorized().status).toBe(401);
    expect(Errors.forbidden().status).toBe(403);
    expect(Errors.notFound('Session').message).toBe('Session not found');
    expect(Errors.conflict('X', 'y').status).toBe(409);
    expect(Errors.unprocessable('X', 'y').status).toBe(422);
    expect(Errors.unavailable('db').status).toBe(503);
  });
});
