import { AppError, createLogger } from '@rec/common';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

import { AuthService } from '../src/services/auth-service.js';
import { hashPassword, verifyPassword } from '../src/services/password.js';
import { ProxyService } from '../src/services/proxy-service.js';

const SECRET = 'test-jwt-secret-that-is-long-enough-123';
const SESSION = '0b5c3e0e-8a3f-4d7e-9c5a-2f4c1d6e7a80';
const VERSION = '059dba6b-044e-4e13-a0da-1046c292d64e';
const ADMIN_ID = '7d1f7c1e-3b0a-4c55-9a43-1f6f1f0a9b11';
const OPERATOR_ID = '8e2f8d2f-4c1b-4d66-8b54-2a7a2a1b0c22';

function fakeClient(upstream, calls, respond) {
  return {
    name: upstream,
    request: async (method, path, options) => {
      const call = { upstream, method, path, options };
      calls.push(call);
      return respond(call);
    },
    getJson: vi.fn(),
    postJson: vi.fn(),
    shutdown: vi.fn(),
  };
}

class MemoryOperators {
  constructor(byEmail) {
    this.byEmail = byEmail;
  }
  async findActiveByEmail(email) {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }
}
class MemoryAudit {
  entries = [];
  async record(entry) {
    this.entries.push(entry);
  }
}

let adminHash = '';
beforeAll(async () => {
  adminHash = await hashPassword('correct-horse-battery');
});

function setup(overrides = {}, respond) {
  const calls = [];
  const reply = respond ?? (() => ({ status: 200, body: { data: { ok: true }, meta: {} } }));
  const upstreamNames = ['session', 'eligibility', 'scheme', 'ai', 'voice', 'ocr'];
  const proxy = new ProxyService(
    Object.fromEntries(upstreamNames.map((u) => [u, fakeClient(u, calls, reply)])),
  );
  const audit = new MemoryAudit();
  const operators = new MemoryOperators(
    new Map([['admin@example.org', { id: ADMIN_ID, passwordHash: adminHash, role: 'admin' }]]),
  );
  const auth = new AuthService(operators, audit, SECRET, 3600);
  const app = createApp({
    logger: createLogger('api-gateway', 'silent'),
    proxy,
    auth,
    audit,
    readiness: async () => ({ mysql: true }),
    corsOrigins: ['http://localhost:5173'],
    ratePerMinute: 1000,
    loginPerMinute: 1000,
    voiceMaxBody: '1mb',
    ocrMaxBody: '2mb',
    ...overrides,
  });
  return { app, calls, audit };
}

const token = (sub, role, secret = SECRET) =>
  `Bearer ${jwt.sign({ role }, secret, { subject: sub, expiresIn: 600 })}`;

describe('public routing', () => {
  it.each([
    ['post', '/v1/sessions', 'session', 'POST', '/sessions'],
    ['post', `/v1/sessions/${SESSION}/answers`, 'session', 'POST', `/sessions/${SESSION}/answers`],
    [
      'post',
      `/v1/sessions/${SESSION}/evaluate`,
      'eligibility',
      'POST',
      `/sessions/${SESSION}/evaluate`,
    ],
    [
      'get',
      `/v1/sessions/${SESSION}/results`,
      'eligibility',
      'GET',
      `/sessions/${SESSION}/results`,
    ],
    ['post', `/v1/sessions/${SESSION}/extract`, 'ai', 'POST', '/extract'],
    ['post', '/v1/voice/transcribe', 'voice', 'POST', '/transcribe'],
    ['post', '/v1/voice/speak', 'voice', 'POST', '/speak'],
    ['post', '/v1/ocr/jobs', 'ocr', 'POST', '/jobs'],
    ['get', `/v1/ocr/jobs/${SESSION}`, 'ocr', 'GET', `/jobs/${SESSION}`],
    ['get', '/v1/schemes/PM-KISAN', 'scheme', 'GET', '/schemes/PM-KISAN'],
  ])('%s %s -> %s %s %s', async (verb, url, upstream, method, path) => {
    const { app, calls } = setup();
    const res = await request(app)[verb](url).send({ language: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ upstream, method, path });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('builds the explain call from the path id and body language', async () => {
    const { app, calls } = setup();
    await request(app).post(`/v1/sessions/${SESSION}/explain`).send({ language: 'hi' });
    expect(calls[0]).toMatchObject({
      upstream: 'ai',
      path: '/explain',
      options: { body: { sessionId: SESSION, language: 'hi' } },
    });
  });

  it('validates pagination and forwards it as a query', async () => {
    const { app, calls } = setup();
    await request(app).get('/v1/schemes?limit=5&offset=10');
    expect(calls[0].options).toEqual({ query: { limit: 5, offset: 10 } });
    expect((await request(app).get('/v1/schemes?limit=101')).status).toBe(400);
  });

  it('rejects malformed ids before calling any service', async () => {
    const { app, calls } = setup();
    const res = await request(app).post('/v1/sessions/../../admin/evaluate');
    expect([400, 404]).toContain(res.status);
    expect((await request(app).get('/v1/sessions/not-a-uuid/results')).status).toBe(400);
    expect((await request(app).get('/v1/schemes/bad%20code')).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('relays 204, upstream errors and 503 when a dependency is down', async () => {
    const del = setup({}, () => ({ status: 204, body: null }));
    expect((await request(del.app).delete(`/v1/sessions/${SESSION}`)).status).toBe(204);

    const notFound = setup({}, () => ({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Session not found' } },
    }));
    const res404 = await request(notFound.app).get(`/v1/sessions/${SESSION}/results`);
    expect(res404.status).toBe(404);
    expect(res404.body.error.code).toBe('NOT_FOUND');

    const down = setup({}, () => {
      throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'eligibility-service is unavailable');
    });
    const res503 = await request(down.app).post(`/v1/sessions/${SESSION}/evaluate`);
    expect(res503.status).toBe(503);
    expect(res503.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
  });

  it('enforces the 100kb limit except on voice and OCR routes', async () => {
    const { app } = setup();
    const big = 'x'.repeat(200_000);
    expect((await request(app).post('/v1/sessions').send({ pad: big })).status).toBe(413);
    expect(
      (await request(app).post('/v1/voice/transcribe').send({ audioBase64: big })).status,
    ).toBe(200);
  });

  it('rate limits with 429 in the error envelope', async () => {
    const { app } = setup({ ratePerMinute: 2 });
    await request(app).get('/v1/schemes');
    await request(app).get('/v1/schemes');
    const res = await request(app).get('/v1/schemes');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('applies the CORS allowlist and security headers', async () => {
    const { app } = setup();
    const res = await request(app).get('/health').set('origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect((await request(app).get('/ready')).status).toBe(200);
  });
});

describe('auth and admin routes', () => {
  it('logs in an admin, audits it, and rejects bad credentials', async () => {
    const { app, audit } = setup();
    const ok = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'Admin@example.org', password: 'correct-horse-battery' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.role).toBe('admin');
    expect(jwt.verify(ok.body.data.token, SECRET)).toMatchObject({
      sub: ADMIN_ID,
      role: 'admin',
    });
    expect(audit.entries[0]).toMatchObject({ operatorId: ADMIN_ID, action: 'POST /v1/auth/login' });

    const bad = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'admin@example.org', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    const unknown = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.org', password: 'whatever-123' });
    expect(unknown.status).toBe(401);
    expect((await request(app).post('/v1/auth/login').send({ email: 'x' })).status).toBe(400);
  });

  it('requires a JWT (401) and the right role (403)', async () => {
    const { app, calls } = setup();
    expect((await request(app).get('/v1/admin/verification-queue')).status).toBe(401);
    expect(
      (await request(app).get('/v1/admin/verification-queue').set('authorization', 'Basic abc'))
        .status,
    ).toBe(401);
    const forged = await request(app)
      .get('/v1/admin/verification-queue')
      .set('authorization', token(ADMIN_ID, 'admin', 'another-secret-another-secret-123'));
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe('INVALID_TOKEN');
    const operatorPublish = await request(app)
      .post(`/v1/admin/versions/${VERSION}/publish`)
      .set('authorization', token(OPERATOR_ID, 'operator'));
    expect(operatorPublish.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('lets operators verify (as themselves) and admins publish, with an audit row each', async () => {
    const { app, calls, audit } = setup();
    const verify = await request(app)
      .post(`/v1/admin/versions/${VERSION}/verify`)
      .set('authorization', token(OPERATOR_ID, 'operator'))
      .send({ verifiedBy: 'someone-else' });
    expect(verify.status).toBe(200);
    expect(calls[0]).toMatchObject({
      path: `/versions/${VERSION}/verify`,
      options: { body: { verifiedBy: OPERATOR_ID } },
    });

    await request(app)
      .post(`/v1/admin/versions/${VERSION}/publish`)
      .set('authorization', token(ADMIN_ID, 'admin'));
    await request(app)
      .post('/v1/admin/schemes/PM-KISAN/versions')
      .set('authorization', token(ADMIN_ID, 'admin'))
      .send({ rule: {} });
    await request(app)
      .get('/v1/admin/verification-queue?limit=10')
      .set('authorization', token(OPERATOR_ID, 'operator'));
    expect(calls.map((c) => c.path)).toEqual([
      `/versions/${VERSION}/verify`,
      `/versions/${VERSION}/publish`,
      '/schemes/PM-KISAN/versions',
      '/verification-queue',
    ]);
    expect(audit.entries.map((e) => [e.operatorId, e.resource, e.statusCode])).toEqual([
      [OPERATOR_ID, VERSION, 200],
      [ADMIN_ID, VERSION, 200],
      [ADMIN_ID, 'PM-KISAN', 200],
      [OPERATOR_ID, null, 200],
    ]);
  });

  it('audits refused admin calls too and survives audit write failures', async () => {
    const failing = {
      record: vi.fn(async () => Promise.reject(new Error('db down'))),
    };
    const { app } = setup({ audit: failing });
    expect((await request(app).get('/v1/admin/verification-queue')).status).toBe(401);
    expect(failing.record).toHaveBeenCalledTimes(1);
  });
});

describe('password hashing', () => {
  it('verifies the right password only and rejects malformed hashes', async () => {
    expect(await verifyPassword('correct-horse-battery', adminHash)).toBe(true);
    expect(await verifyPassword('nope', adminHash)).toBe(false);
    expect(await verifyPassword('x', 'md5$abc')).toBe(false);
  });
});

describe('single-service frontend hosting', () => {
  const dist = mkdtempSync(join(tmpdir(), 'dist-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<html><body>citizen app</body></html>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');

  it('serves the app and falls back to index.html for client routes', async () => {
    const { app } = setup({ frontendDist: dist });
    expect((await request(app).get('/')).text).toContain('citizen app');
    expect((await request(app).get('/results')).text).toContain('citizen app');
    expect((await request(app).get('/assets/app.js')).status).toBe(200);
  });

  it('keeps API and health routes out of the fallback', async () => {
    const { app } = setup({ frontendDist: dist });
    expect((await request(app).get('/v1/nope')).status).toBe(404);
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('skips hosting when the folder has no build', async () => {
    const { app } = setup({ frontendDist: join(dist, 'missing') });
    expect((await request(app).get('/')).status).toBe(404);
  });
});
