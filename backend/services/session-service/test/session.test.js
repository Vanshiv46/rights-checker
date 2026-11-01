import { AppError, createLogger, createMemoryEventBus } from '@rec/common';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

import { SessionService } from '../src/services/session-service.js';

const TOKEN = 'test-service-token-123';
const auth = { 'x-service-token': TOKEN };
const MISSING = '11111111-2222-4333-8444-555555555555';

class MemorySessionRepository {
  sessions = new Map();
  async create(session) {
    this.sessions.set(session.id, { ...session, members: [], facts: [] });
  }
  async findAggregate(id) {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }
  async saveAnswers(id, members, facts) {
    const s = this.sessions.get(id);
    s.members.push(...members);
    for (const f of facts) {
      s.facts = s.facts.filter((x) => !(x.key === f.key && x.memberId === f.memberId));
      s.facts.push(f);
    }
  }
  async delete(id) {
    return this.sessions.delete(id);
  }
  async findExpiredIds(now) {
    return [...this.sessions.values()].filter((s) => s.expiresAt < now).map((s) => s.id);
  }
}

function setup(bus = createMemoryEventBus()) {
  const repo = new MemorySessionRepository();
  const logger = createLogger('session-service', 'silent');
  const sessions = new SessionService(repo, bus, logger, 24);
  const app = createApp({
    logger,
    serviceToken: TOKEN,
    sessions,
    readiness: async () => ({ mysql: true }),
  });
  return { app, repo, bus, sessions };
}

async function newSession(app) {
  const res = await request(app)
    .post('/sessions')
    .set(auth)
    .send({ language: 'hi', consent: true });
  return res.body.data.id;
}

describe('sessions', () => {
  it('creates a session with consent and expiry', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/sessions')
      .set(auth)
      .send({ language: 'hi', consent: true });
    expect(res.status).toBe(201);
    expect(res.body.data.language).toBe('hi');
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const get = await request(app).get(`/sessions/${res.body.data.id}`).set(auth);
    expect(get.body.data.members).toEqual([]);
  });

  it('requires consent (422) and a valid body (400)', async () => {
    const { app } = setup();
    const noConsent = await request(app)
      .post('/sessions')
      .set(auth)
      .send({ language: 'en', consent: false });
    expect(noConsent.status).toBe(422);
    expect(noConsent.body.error.code).toBe('CONSENT_REQUIRED');
    const bad = await request(app)
      .post('/sessions')
      .set(auth)
      .send({ language: 'xx', consent: true });
    expect(bad.status).toBe(400);
    expect(
      (await request(app).post('/sessions').send({ language: 'en', consent: true })).status,
    ).toBe(401);
  });

  it('saves members and answers, and exposes only confirmed facts to the engine', async () => {
    const { app } = setup();
    const id = await newSession(app);
    const res = await request(app)
      .post(`/sessions/${id}/answers`)
      .set(auth)
      .send({
        members: [{ ref: 'gran', relation: 'parent' }],
        answers: [
          { key: 'household.bpl_status', value: true },
          { key: 'member.age', memberRef: 'gran', value: 71 },
          { key: 'member.age', memberRef: 'gran', value: 72 },
          { key: 'household.owns_cultivable_land', value: true, origin: 'voice', confidence: 0.6 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.saved).toBe(3);
    const memberId = res.body.data.members[0].id;

    const facts = await request(app).get(`/sessions/${id}/facts`).set(auth);
    expect(facts.body.data).toEqual({
      sessionId: id,
      language: 'hi',
      household: { 'household.bpl_status': true },
      members: [{ id: memberId, relation: 'parent', facts: { 'member.age': 72 } }],
      unconfirmed: [{ key: 'household.owns_cultivable_land', memberId: null }],
    });

    await request(app)
      .post(`/sessions/${id}/answers`)
      .set(auth)
      .send({
        answers: [
          { key: 'household.owns_cultivable_land', value: true, origin: 'voice', confirmed: true },
        ],
      });
    const after = await request(app).get(`/sessions/${id}/facts`).set(auth);
    expect(after.body.data.household['household.owns_cultivable_land']).toBe(true);
    expect(after.body.data.unconfirmed).toEqual([]);
    const byId = await request(app)
      .post(`/sessions/${id}/answers`)
      .set(auth)
      .send({ answers: [{ key: 'member.age', memberId, value: 73 }] });
    expect(byId.status).toBe(200);
  });

  it.each([
    [{ answers: [{ key: 'member.name', value: 'Asha' }] }, 'UNKNOWN_FACT'],
    [
      {
        answers: [{ key: 'member.age', value: 'old', memberRef: 'a' }],
        members: [{ ref: 'a', relation: 'self' }],
      },
      'INVALID_FACT_VALUE',
    ],
    [{ answers: [{ key: 'member.age', value: 40 }] }, 'UNKNOWN_MEMBER'],
    [{ answers: [{ key: 'member.age', value: 40, memberRef: 'zz' }] }, 'UNKNOWN_MEMBER'],
    [
      {
        answers: [{ key: 'household.bpl_status', value: true, memberRef: 'a' }],
        members: [{ ref: 'a', relation: 'self' }],
      },
      'UNEXPECTED_MEMBER',
    ],
    [
      {
        answers: [],
        members: [
          { ref: 'a', relation: 'self' },
          { ref: 'a', relation: 'child' },
        ],
      },
      'DUPLICATE_MEMBER_REF',
    ],
  ])('rejects invalid answers with 422 (%#)', async (body, code) => {
    const { app } = setup();
    const id = await newSession(app);
    const res = await request(app).post(`/sessions/${id}/answers`).set(auth).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(code);
  });

  it('returns 404 for unknown and expired sessions', async () => {
    const { app, repo } = setup();
    expect((await request(app).get(`/sessions/${MISSING}/facts`).set(auth)).status).toBe(404);
    const id = await newSession(app);
    repo.sessions.get(id).expiresAt = new Date(Date.now() - 1000);
    const res = await request(app).get(`/sessions/${id}/facts`).set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('DELETE erases the session and emits session.deleted', async () => {
    const { app, bus, repo } = setup();
    const id = await newSession(app);
    const res = await request(app).delete(`/sessions/${id}`).set(auth);
    expect(res.status).toBe(204);
    expect(repo.sessions.size).toBe(0);
    expect(bus.published[0]).toMatchObject({
      type: 'session.deleted',
      payload: { sessionId: id, reason: 'user_request' },
    });
    expect((await request(app).delete(`/sessions/${id}`).set(auth)).status).toBe(404);
  });

  it('keeps the session when the event cannot be published', async () => {
    const failing = {
      publish: async () => {
        throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'redis is unavailable');
      },
      subscribe: () => undefined,
      start: async () => undefined,
      close: async () => undefined,
    };
    const { app, repo } = setup(failing);
    const id = await newSession(app);
    expect((await request(app).delete(`/sessions/${id}`).set(auth)).status).toBe(503);
    expect(repo.sessions.has(id)).toBe(true);
  });

  it('expires old sessions in the background job', async () => {
    const { app, repo, bus, sessions } = setup();
    const id = await newSession(app);
    await newSession(app);
    repo.sessions.get(id).expiresAt = new Date(Date.now() - 1000);
    expect(await sessions.expireSessions(new Date())).toBe(1);
    expect(bus.published[0]).toMatchObject({ payload: { sessionId: id, reason: 'expired' } });
    expect(await sessions.expireSessions(new Date())).toBe(0);
  });
});
