import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, SERVICE_TOKEN } from './fakes.js';

const PMKISAN_V1 = '059dba6b-044e-4e13-a0da-1046c292d64e';
const PMMVY_DRAFT = 'ba35224c-70a0-489b-9282-a447d83100b3';
const MISSING = '11111111-2222-4333-8444-555555555555';

const auth = { 'x-service-token': SERVICE_TOKEN };

const validRule = {
  requirements: [
    {
      id: 'pmkisan.land',
      description: 'The household owns cultivable land.',
      condition: { fact: 'household.owns_cultivable_land', op: 'eq', value: true },
    },
  ],
  exclusions: [],
  supersededBy: null,
  benefits: [],
  source: { document: 'PM-KISAN Operational Guidelines', section: '2.4', url: null },
  notes: [],
};
const checklist = { status: 'AVAILABLE', items: [{ id: 'aadhaar', label: 'Aadhaar card' }] };

describe('scheme-service API', () => {
  it('rejects calls without the service token', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/schemes');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('exposes health and readiness', async () => {
    expect((await request(buildTestApp().app).get('/health')).status).toBe(200);
    expect((await request(buildTestApp(false).app).get('/ready')).status).toBe(503);
  });

  it('lists schemes with pagination meta', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/schemes?limit=2&offset=0').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ limit: 2, offset: 0, total: 6 });
    const tooMany = await request(app).get('/schemes?limit=500').set(auth);
    expect(tooMany.status).toBe(400);
  });

  it('returns a scheme with its published rule, 404 for unknown codes, 400 for bad codes', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/schemes/PM-KISAN').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.publishedVersion.version).toBe(1);
    expect(res.body.data.checklist.items).toHaveLength(3);
    const draftOnly = await request(app).get('/schemes/PMMVY').set(auth);
    expect(draftOnly.body.data.rule).toBeNull();
    expect((await request(app).get('/schemes/NOPE').set(auth)).status).toBe(404);
    expect((await request(app).get('/schemes/bad%20code').set(auth)).status).toBe(400);
  });

  it('serves only published rules to eligibility-service', async () => {
    const res = await request(buildTestApp().app).get('/rules/published').set(auth);
    expect(res.body.data.map((r) => r.schemeCode).sort()).toEqual(['IGNOAPS', 'PM-KISAN']);
  });

  it('runs the draft -> verify -> publish workflow and emits rule.published', async () => {
    const { app, bus } = buildTestApp();
    const created = await request(app)
      .post('/schemes/PM-KISAN/versions')
      .set(auth)
      .send({ rule: validRule, checklist, notes: 'v2' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ version: 2, status: 'draft' });
    const id = created.body.data.id;

    const early = await request(app).post(`/versions/${id}/publish`).set(auth);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('VERSION_NOT_VERIFIED');

    const verified = await request(app)
      .post(`/versions/${id}/verify`)
      .set(auth)
      .send({ verifiedBy: 'reviewer-1' });
    expect(verified.body.data.verifiedBy).toBe('reviewer-1');

    const published = await request(app).post(`/versions/${id}/publish`).set(auth);
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe('published');
    expect(bus.published[0]).toMatchObject({
      type: 'rule.published',
      payload: { schemeCode: 'PM-KISAN', versionId: id, version: 2 },
    });

    const rules = await request(app).get('/rules/published').set(auth);
    const pm = rules.body.data.find((r) => r.schemeCode === 'PM-KISAN');
    expect(pm.version).toBe(2);

    const again = await request(app).post(`/versions/${id}/publish`).set(auth);
    expect(again.status).toBe(409);
    const reverify = await request(app)
      .post(`/versions/${id}/verify`)
      .set(auth)
      .send({ verifiedBy: 'x1' });
    expect(reverify.status).toBe(409);
  });

  it('refuses to publish a TODO draft with no requirements', async () => {
    const { app } = buildTestApp();
    await request(app)
      .post(`/versions/${PMMVY_DRAFT}/verify`)
      .set(auth)
      .send({ verifiedBy: 'rev' });
    const res = await request(app).post(`/versions/${PMMVY_DRAFT}/publish`).set(auth);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RULE_INCOMPLETE');
  });

  it('validates new versions and rejects unknown facts', async () => {
    const { app } = buildTestApp();
    const badFact = {
      ...validRule,
      requirements: [
        { ...validRule.requirements[0], condition: { fact: 'member.name', op: 'eq', value: 'x' } },
      ],
    };
    const res = await request(app)
      .post('/schemes/PM-KISAN/versions')
      .set(auth)
      .send({ rule: badFact, checklist });
    expect(res.status).toBe(400);
    const unknown = await request(app)
      .post('/schemes/NOPE/versions')
      .set(auth)
      .send({ rule: validRule, checklist });
    expect(unknown.status).toBe(404);
    expect((await request(app).post(`/versions/${MISSING}/publish`).set(auth)).status).toBe(404);
  });

  it('lists the verification queue', async () => {
    const res = await request(buildTestApp().app).get('/verification-queue').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(4);
    expect(res.body.data[0].notes).toContain('TODO');
  });

  it('searches sources of one version', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/sources/search')
      .set(auth)
      .send({ schemeVersionId: PMKISAN_V1, query: 'pension income tax' });
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      documentTitle: 'PM-KISAN Operational Guidelines',
      section: '2.4',
    });
    expect(res.body.data[0].embedding).toBeUndefined();
    const missing = await request(app)
      .post('/sources/search')
      .set(auth)
      .send({ schemeVersionId: MISSING, query: 'land' });
    expect(missing.status).toBe(404);
  });
});
