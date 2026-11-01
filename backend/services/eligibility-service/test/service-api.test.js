import { randomUUID } from 'node:crypto';
import { AppError, buildEvent, createLogger, createMemoryEventBus } from '@rec/common';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { registerConsumers } from '../src/events/consumers.js';

import { EligibilityService } from '../src/services/eligibility-service.js';
import { RuleCache } from '../src/services/rule-cache.js';
import { household, SESSION_ID, seededRules } from './fixtures.js';

const TOKEN = 'test-service-token-123';
const auth = { 'x-service-token': TOKEN };
const logger = createLogger('eligibility-service', 'silent');
const rules = seededRules();

class MemoryEvaluationRepository {
  rows = [];
  async replaceForSession(sessionId, results) {
    this.rows = this.rows.filter((r) => r.sessionId !== sessionId);
    const created = results.map((result) => ({
      id: randomUUID(),
      sessionId,
      result,
      createdAt: new Date(),
    }));
    this.rows.push(...created);
    return created;
  }
  async findBySession(sessionId) {
    return this.rows.filter((r) => r.sessionId === sessionId);
  }
  async deleteBySession(sessionId) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.sessionId !== sessionId);
    return before - this.rows.length;
  }
}

function setup(options = {}) {
  let published = options.published ?? [rules['PM-KISAN'], rules.IGNOAPS];
  const schemes = {
    listPublishedRules: vi.fn(async () => {
      if (options.schemeDown)
        throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'scheme-service is unavailable');
      return published;
    }),
    searchSources: vi.fn(async () => []),
  };
  const sessions = {
    getFacts: vi.fn(async () => {
      const facts =
        options.facts ??
        household({ 'household.owns_cultivable_land': true }, [{ 'member.age': 70 }]);
      if (facts instanceof AppError) throw facts;
      return facts;
    }),
  };
  const repo = new MemoryEvaluationRepository();
  const bus = options.bus ?? createMemoryEventBus();
  const cache = new RuleCache(schemes, logger);
  const eligibility = new EligibilityService(cache, sessions, repo, bus, logger);
  registerConsumers(bus, cache, eligibility);
  const app = createApp({
    logger,
    serviceToken: TOKEN,
    eligibility,
    readiness: async () => ({ rules: cache.isLoaded() }),
  });
  return {
    app,
    repo,
    bus,
    cache,
    schemes,
    setPublished: (next) => {
      published = next;
    },
  };
}

describe('eligibility-service API', () => {
  it('evaluates a session, stores verdicts and emits evaluation.created', async () => {
    const { app, repo, bus } = setup();
    const res = await request(app).post(`/sessions/${SESSION_ID}/evaluate`).set(auth);
    expect(res.status).toBe(200);
    const verdicts = Object.fromEntries(
      res.body.data.results.map((r) => [r.schemeCode, r.verdict]),
    );
    expect(verdicts).toEqual({ 'PM-KISAN': 'LIKELY', IGNOAPS: 'NEEDS_VERIFICATION' });
    expect(res.body.data.nextQuestions[0].key).toBeDefined();
    expect(repo.rows).toHaveLength(2);
    const memory = bus;
    expect(memory.published[0]).toMatchObject({
      type: 'evaluation.created',
      payload: { sessionId: SESSION_ID, verdicts },
    });
  });

  it('returns stored results and 404 before any evaluation', async () => {
    const { app } = setup();
    const missing = await request(app).get(`/sessions/${SESSION_ID}/results`).set(auth);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NO_EVALUATION');
    await request(app).post(`/sessions/${SESSION_ID}/evaluate`).set(auth);
    const res = await request(app).get(`/sessions/${SESSION_ID}/results`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(2);
  });

  it('validates ids and the service token', async () => {
    const { app } = setup();
    expect((await request(app).post('/sessions/not-a-uuid/evaluate').set(auth)).status).toBe(400);
    expect((await request(app).post(`/sessions/${SESSION_ID}/evaluate`)).status).toBe(401);
  });

  it('passes through 404 for unknown sessions', async () => {
    const { app } = setup({ facts: new AppError(404, 'NOT_FOUND', 'Session not found') });
    expect((await request(app).post(`/sessions/${SESSION_ID}/evaluate`).set(auth)).status).toBe(
      404,
    );
  });

  it('returns 503 when rules cannot be loaded', async () => {
    const { app } = setup({ schemeDown: true });
    const res = await request(app).post(`/sessions/${SESSION_ID}/evaluate`).set(auth);
    expect(res.status).toBe(503);
    expect((await request(app).get('/ready')).status).toBe(503);
  });

  it('still returns verdicts when the event bus is down', async () => {
    const broken = {
      publish: async () => {
        throw new Error('redis down');
      },
      subscribe: () => undefined,
      start: async () => undefined,
      close: async () => undefined,
    };
    const { app } = setup({ bus: broken });
    expect((await request(app).post(`/sessions/${SESSION_ID}/evaluate`).set(auth)).status).toBe(
      200,
    );
  });
});

describe('eligibility-service events', () => {
  it('rule.published reloads the cache (and replay is harmless)', async () => {
    const { cache, bus, schemes, setPublished } = setup({ published: [rules['PM-KISAN']] });
    await cache.reload();
    expect(cache.list().map((r) => r.schemeCode)).toEqual(['PM-KISAN']);
    setPublished([rules['PM-KISAN'], rules.IGNOAPS]);
    const event = buildEvent('rule.published', {
      schemeCode: 'IGNOAPS',
      versionId: rules.IGNOAPS.versionId,
      version: 1,
    });
    const memory = bus;
    await memory.deliver(event);
    await memory.deliver(event);
    expect(cache.list().map((r) => r.schemeCode)).toEqual(['PM-KISAN', 'IGNOAPS']);
    expect(schemes.listPublishedRules).toHaveBeenCalledTimes(3);
  });

  it('session.deleted removes that session’s evaluations idempotently', async () => {
    const { app, repo, bus } = setup();
    await request(app).post(`/sessions/${SESSION_ID}/evaluate`).set(auth);
    await repo.replaceForSession(randomUUID(), []);
    expect(repo.rows).toHaveLength(2);
    const event = buildEvent('session.deleted', { sessionId: SESSION_ID, reason: 'user_request' });
    const memory = bus;
    await memory.deliver(event);
    await memory.deliver(event);
    expect(repo.rows).toHaveLength(0);
    expect((await request(app).get(`/sessions/${SESSION_ID}/results`).set(auth)).status).toBe(404);
  });
});
