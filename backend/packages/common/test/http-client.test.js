import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AppError,
  createEligibilityClient,
  createLogger,
  createSchemeClient,
  createServiceClient,
  createSessionClient,
  runWithRequestId,
} from '../src/index.js';

const logger = createLogger('test', 'silent');
const json = (status, body) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

function client(fetchImpl, extra = {}) {
  return createServiceClient({
    name: 'upstream',
    baseUrl: 'http://upstream.local',
    serviceToken: 'service-token-123456',
    logger,
    backoffMs: 1,
    fetchImpl,
    ...extra,
  });
}

describe('createServiceClient', () => {
  it('sends the service token and propagates x-request-id', async () => {
    const fetchImpl = vi.fn(async () => json(200, { data: { ok: true } }));
    const http = client(fetchImpl);
    const data = await runWithRequestId('req-abcdefgh', () =>
      http.getJson('/things', z.object({ ok: z.boolean() }), { limit: 5, skip: undefined }),
    );
    expect(data).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://upstream.local/things?limit=5');
    const headers = init?.headers;
    expect(headers['x-service-token']).toBe('service-token-123456');
    expect(headers['x-request-id']).toBe('req-abcdefgh');
  });

  it('retries GET twice with backoff, then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(json(502, { error: { code: 'BAD', message: 'bad' } }))
      .mockResolvedValueOnce(json(200, { data: 1 }));
    expect(await client(fetchImpl).getJson('/x', z.number())).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry POST and maps network failure to 503', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const error = await client(fetchImpl)
      .postJson('/x', { a: 1 }, z.number())
      .catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('passes through upstream 5xx responses after retries', async () => {
    const fetchImpl = vi.fn(async () => json(503, { error: { code: 'NOT_READY', message: 'no' } }));
    const raw = await client(fetchImpl).request('GET', '/x');
    expect(raw.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('turns upstream 4xx error envelopes into matching AppErrors', async () => {
    const fetchImpl = vi.fn(async () =>
      json(404, { error: { code: 'NOT_FOUND', message: 'Session not found' } }),
    );
    const error = await client(fetchImpl)
      .getJson('/x', z.number())
      .catch((e) => e);
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    const odd = vi.fn(async () => new Response('teapot', { status: 418 }));
    const oddError = await client(odd)
      .getJson('/x', z.number())
      .catch((e) => e);
    expect(oddError.code).toBe('NON_JSON_RESPONSE');
  });

  it('rejects responses that break the contract with 502', async () => {
    const fetchImpl = vi.fn(async () => json(200, { data: 'not-a-number' }));
    const error = await client(fetchImpl)
      .getJson('/x', z.number())
      .catch((e) => e);
    expect(error.status).toBe(502);
  });

  it('opens the circuit after repeated failures and fails fast', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));
    const http = client(fetchImpl, { retries: 0 });
    for (let i = 0; i < 6; i += 1) await http.request('POST', '/x').catch(() => undefined);
    const calls = fetchImpl.mock.calls.length;
    await expect(http.request('POST', '/x')).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl.mock.calls.length).toBe(calls);
    http.shutdown();
  });

  it('handles 204 No Content', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await client(fetchImpl).request('DELETE', '/x')).toEqual({ status: 204, body: null });
  });
});

/* ---------- contract tests: typed clients against the shared zod contracts ---------- */

const versionId = '7d1f7c1e-3b0a-4c55-9a43-1f6f1f0a9b11';
const sessionId = '0b5c3e0e-8a3f-4d7e-9c5a-2f4c1d6e7a80';

const publishedRule = {
  schemeCode: 'PM-KISAN',
  schemeName: 'PM-KISAN',
  versionId,
  version: 1,
  verifiedOn: '2026-01-01',
  checklist: { status: 'AVAILABLE', items: [{ id: 'aadhaar', label: 'Aadhaar' }] },
  rule: {
    requirements: [
      {
        id: 'land',
        description: 'Owns land',
        condition: { fact: 'household.owns_cultivable_land', op: 'eq', value: true },
      },
    ],
    exclusions: [],
    supersededBy: null,
    benefits: [],
    source: { document: 'Guidelines', section: '2.4', url: null },
    notes: [],
  },
};

const facts = {
  sessionId,
  language: 'en',
  household: { 'household.bpl_status': true },
  members: [{ id: versionId, relation: 'self', facts: { 'member.age': 70 } }],
  unconfirmed: [],
};

const evaluation = {
  sessionId,
  evaluatedAt: '2026-01-01T00:00:00.000Z',
  nextQuestions: [],
  results: [
    {
      schemeCode: 'PM-KISAN',
      schemeName: 'PM-KISAN',
      verdict: 'LIKELY',
      reasons: [],
      checksLeft: [],
      missingFacts: [],
      firedRules: [],
      benefits: [],
      supersededBy: null,
      checklist: publishedRule.checklist,
      source: publishedRule.rule.source,
      ruleVersion: { id: versionId, version: 1 },
      verifiedOn: null,
    },
  ],
};

function fixedFetch(body) {
  return vi.fn(async () => json(200, { data: body, meta: {} }));
}

describe('typed clients match the shared contracts', () => {
  it('scheme client parses published rules and search results', async () => {
    const scheme = createSchemeClient(client(fixedFetch([publishedRule])));
    expect(await scheme.listPublishedRules()).toEqual([publishedRule]);
    const hits = [{ chunkId: versionId, documentTitle: 'G', section: '2.4', text: 't', score: 1 }];
    const search = createSchemeClient(client(fixedFetch(hits)));
    expect(await search.searchSources({ schemeVersionId: versionId, query: 'land' })).toEqual(hits);
  });

  it('session client parses engine facts', async () => {
    expect(await createSessionClient(client(fixedFetch(facts))).getFacts(sessionId)).toEqual(facts);
  });

  it('eligibility client parses evaluation responses', async () => {
    const eligibility = createEligibilityClient(client(fixedFetch(evaluation)));
    expect(await eligibility.getResults(sessionId)).toEqual(evaluation);
  });

  it('clients reject payloads that drift from the contract', async () => {
    const broken = { ...publishedRule, rule: { ...publishedRule.rule, requirements: 'none' } };
    const scheme = createSchemeClient(client(fixedFetch([broken])));
    await expect(scheme.listPublishedRules()).rejects.toMatchObject({ status: 502 });
  });
});
