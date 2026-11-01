// End-to-end smoke test through the public gateway only.
// Usage: BASE_URL=http://localhost:4000 ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smoke-test.mjs
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://localhost:4000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.org';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'change-me-admin-password';

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text ? JSON.parse(text) : null,
    requestId: res.headers.get('x-request-id'),
  };
}

const steps = [];
async function step(name, fn) {
  await fn();
  steps.push(name);
  process.stdout.write(`ok  ${name}\n`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let sessionId;

await step('GET /health', async () => {
  const res = await call('GET', '/health');
  assert.equal(res.status, 200);
  assert.ok(res.requestId);
});

await step('POST /v1/sessions -> 201', async () => {
  const res = await call('POST', '/v1/sessions', { language: 'en', consent: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  sessionId = res.body.data.id;
});

await step('POST /v1/sessions/:id/answers', async () => {
  const res = await call('POST', `/v1/sessions/${sessionId}/answers`, {
    members: [{ ref: 'me', relation: 'self' }],
    answers: [
      { key: 'household.owns_cultivable_land', value: true },
      { key: 'household.bpl_status', value: true },
      { key: 'member.age', memberRef: 'me', value: 67 },
      { key: 'member.paid_income_tax_last_ay', memberRef: 'me', value: false },
      { key: 'member.monthly_pension', memberRef: 'me', value: 0 },
    ],
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.saved, 5);
});

await step('POST /v1/sessions/:id/evaluate -> PM-KISAN LIKELY, IGNOAPS LIKELY', async () => {
  const res = await call('POST', `/v1/sessions/${sessionId}/evaluate`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const verdicts = Object.fromEntries(res.body.data.results.map((r) => [r.schemeCode, r.verdict]));
  assert.deepEqual(verdicts, { 'PM-KISAN': 'LIKELY', IGNOAPS: 'LIKELY' });
});

await step('GET /v1/sessions/:id/results', async () => {
  const res = await call('GET', `/v1/sessions/${sessionId}/results`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.results.length, 2);
});

await step('POST /v1/sessions/:id/explain (with citations)', async () => {
  const res = await call('POST', `/v1/sessions/${sessionId}/explain`, { language: 'en' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const pm = res.body.data.explanations.find((e) => e.schemeCode === 'PM-KISAN');
  assert.equal(pm.verdict, 'LIKELY');
  assert.ok(pm.citations.length >= 1, 'expected a FULLTEXT citation');
});

await step('GET /v1/schemes and /v1/schemes/PM-KISAN', async () => {
  const list = await call('GET', '/v1/schemes?limit=10');
  assert.equal(list.status, 200);
  assert.equal(list.body.meta.total, 6);
  const one = await call('GET', '/v1/schemes/PM-KISAN');
  assert.equal(one.body.data.rule.source.section, '2.4');
});

await step('voice falls back with 503 when no GROQ_API_KEY is set', async () => {
  const res = await call('POST', '/v1/voice/transcribe', { audioBase64: 'AAAA', language: 'hi' });
  assert.ok([200, 503].includes(res.status));
});

await step('admin login + GET /v1/admin/verification-queue', async () => {
  const login = await call('POST', '/v1/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const auth = { authorization: `Bearer ${login.body.data.token}` };
  const queue = await call('GET', '/v1/admin/verification-queue', undefined, auth);
  assert.equal(queue.status, 200);
  assert.equal(queue.body.meta.total, 4);
  assert.equal((await call('GET', '/v1/admin/verification-queue')).status, 401);
});

await step('DELETE /v1/sessions/:id -> 204, evaluations erased via session.deleted', async () => {
  const res = await call('DELETE', `/v1/sessions/${sessionId}`);
  assert.equal(res.status, 204);
  for (let i = 0; i < 50; i += 1) {
    if ((await call('GET', `/v1/sessions/${sessionId}/results`)).status === 404) return;
    await sleep(200);
  }
  assert.fail('evaluations were not erased after session.deleted');
});

process.stdout.write(`\nSmoke test passed: ${steps.length} steps\n`);
