import { AppError, createLogger } from '@rec/common';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { MockProvider } from '../src/llm/mock-provider.js';

import { AiService } from '../src/services/ai-service.js';
import { redactIdentifiers } from '../src/services/redact.js';

const TOKEN = 'test-service-token-123';
const auth = { 'x-service-token': TOKEN };
const SESSION = '0b5c3e0e-8a3f-4d7e-9c5a-2f4c1d6e7a80';
const VERSION = '059dba6b-044e-4e13-a0da-1046c292d64e';
const CHUNK = '4c2e8a7d-5b1f-4e3a-9d6c-8f0a1b2c3d4e';

const evaluation = {
  sessionId: SESSION,
  evaluatedAt: '2026-11-01T00:00:00.000Z',
  nextQuestions: [],
  results: [
    {
      schemeCode: 'PM-KISAN',
      schemeName: 'PM-KISAN',
      verdict: 'LIKELY',
      reasons: [
        {
          clauseId: 'pmkisan.land',
          kind: 'requirement',
          outcome: 'met',
          description: 'Owns land.',
        },
      ],
      checksLeft: [
        { clauseId: 'pmkisan.income_tax', description: 'Income tax check', missingFacts: [] },
      ],
      missingFacts: [],
      firedRules: ['pmkisan.land'],
      benefits: [],
      supersededBy: null,
      checklist: { status: 'AVAILABLE', items: [] },
      source: { document: 'PM-KISAN Operational Guidelines', section: '2.4', url: null },
      ruleVersion: { id: VERSION, version: 1 },
      verifiedOn: '2026-11-01',
    },
  ],
};

function setup(options = {}) {
  const eligibility = {
    getResults: vi.fn(async () => {
      if (options.eligibilityError) throw options.eligibilityError;
      return evaluation;
    }),
  };
  const schemes = {
    listPublishedRules: vi.fn(async () => []),
    searchSources: vi.fn(async () => {
      if (options.searchFails) throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'down');
      return [
        {
          chunkId: CHUNK,
          documentTitle: 'PM-KISAN Operational Guidelines',
          section: '2.4',
          text: 'x',
          score: 1,
        },
      ];
    }),
  };
  const logger = createLogger('ai-service', 'silent');
  const llm = options.llm ?? new MockProvider();
  const ai = new AiService(llm, eligibility, schemes, logger);
  return { app: createApp({ logger, serviceToken: TOKEN, ai }), schemes, llm };
}

describe('POST /extract', () => {
  it('proposes catalogue facts that still need confirmation', async () => {
    const { app } = setup();
    const res = await request(app).post('/extract').set(auth).send({
      language: 'en',
      text: 'My mother is 67 years old, we are BPL and own a small farm. Nobody pays no income tax. Pension 12,000.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.requiresConfirmation).toBe(true);
    const byKey = Object.fromEntries(res.body.data.facts.map((f) => [f.key, f.value]));
    expect(byKey).toMatchObject({
      'member.age': 67,
      'household.bpl_status': true,
      'household.owns_cultivable_land': true,
      'member.paid_income_tax_last_ay': false,
      'member.monthly_pension': 12000,
    });
  });

  it('handles negatives and Hindi keywords', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/extract')
      .set(auth)
      .send({ language: 'hi', text: 'हम not BPL हैं, landless, पिता 81 साल, they pay income tax' });
    const byKey = Object.fromEntries(res.body.data.facts.map((f) => [f.key, f.value]));
    expect(byKey).toEqual({
      'member.age': 81,
      'household.bpl_status': false,
      'household.owns_cultivable_land': false,
      'member.paid_income_tax_last_ay': true,
    });
  });

  it('never sends identifiers to the LLM and drops facts outside the catalogue', async () => {
    const seen = [];
    const llm = {
      name: 'spy',
      complete: async (prompt, schema) => {
        seen.push(prompt);
        return schema.parse({
          facts: [
            { key: 'member.name', value: 'Asha', memberRef: null, confidence: 1 },
            { key: 'member.age', value: 500, memberRef: 'm1', confidence: 1 },
            { key: 'household.bpl_status', value: true, memberRef: null, confidence: 1 },
          ],
        });
      },
    };
    const { app } = setup({ llm });
    const res = await request(app)
      .post('/extract')
      .set(auth)
      .send({ language: 'en', text: 'call 9876543210, aadhaar 1234 5678 9012, mail a@b.in' });
    expect(seen[0]).not.toMatch(/9876543210|1234 5678 9012|a@b\.in/);
    expect(res.body.data.facts).toEqual([
      { key: 'household.bpl_status', value: true, memberRef: null, confidence: 1 },
    ]);
  });

  it('validates the body and requires the service token', async () => {
    const { app } = setup();
    expect((await request(app).post('/extract').set(auth).send({ language: 'en' })).status).toBe(
      400,
    );
    expect((await request(app).post('/extract').send({ language: 'en', text: 'x' })).status).toBe(
      401,
    );
  });
});

describe('POST /explain', () => {
  it('explains engine verdicts with citations, never changing them', async () => {
    const llm = {
      name: 'rogue',
      complete: async (_prompt, schema) =>
        schema.parse({
          explanations: [
            { schemeCode: 'PM-KISAN', text: 'You are ELIGIBLE!', verdict: 'ELIGIBLE' },
          ],
        }),
    };
    const { app } = setup({ llm });
    const res = await request(app)
      .post('/explain')
      .set(auth)
      .send({ sessionId: SESSION, language: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.data.explanations[0]).toMatchObject({
      schemeCode: 'PM-KISAN',
      verdict: 'LIKELY',
      citations: [{ chunkId: CHUNK, section: '2.4' }],
    });
  });

  it('uses the mock template and survives a search outage', async () => {
    const { app } = setup({ searchFails: true });
    const res = await request(app)
      .post('/explain')
      .set(auth)
      .send({ sessionId: SESSION, language: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.data.explanations[0].text).toContain('You may be eligible.');
    expect(res.body.data.explanations[0].text).toContain('Still to check');
    expect(res.body.data.explanations[0].citations).toEqual([]);
  });

  it('falls back to reason text when the LLM skips a scheme', async () => {
    const llm = {
      name: 'lazy',
      complete: async (_p, schema) => schema.parse({ explanations: [] }),
    };
    const res = await request(setup({ llm }).app)
      .post('/explain')
      .set(auth)
      .send({ sessionId: SESSION, language: 'en' });
    expect(res.body.data.explanations[0].text).toBe('Owns land.');
  });

  it('returns 503 when the LLM fails and passes through upstream 404s', async () => {
    const llm = {
      name: 'down',
      complete: async () => {
        throw new Error('timeout');
      },
    };
    const down = await request(setup({ llm }).app)
      .post('/explain')
      .set(auth)
      .send({ sessionId: SESSION, language: 'en' });
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('AI_UNAVAILABLE');
    const missing = setup({ eligibilityError: new AppError(404, 'NO_EVALUATION', 'none') });
    expect(
      (
        await request(missing.app)
          .post('/explain')
          .set(auth)
          .send({ sessionId: SESSION, language: 'en' })
      ).status,
    ).toBe(404);
  });
});

describe('redactIdentifiers', () => {
  it('removes Aadhaar numbers, phone numbers and e-mails', () => {
    expect(redactIdentifiers('+91 9876543210 / 1234-5678-9012 / x.y@z.org')).toBe(
      '[redacted] / [redacted] / [redacted]',
    );
  });
});
