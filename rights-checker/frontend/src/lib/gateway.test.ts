import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { gatewayApi } from './gateway';
import { ApiError, setAuthToken } from './http';

const SID = '0b5c3e0e-8a3f-4d7e-9c5a-2f4c1d6e7a80';

interface Call {
  method: string;
  url: string;
  body: unknown;
  auth: string | null;
}

function stubGateway(reply: (call: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      const call = {
        method: init.method ?? 'GET',
        url,
        body: init.body ? JSON.parse(init.body as string) : undefined,
        auth: headers.Authorization ?? null,
      };
      calls.push(call);
      const { status, body } = reply(call);
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const ok = (data: unknown) => ({ status: 200, body: { data, meta: { requestId: 'r1' } } });

beforeEach(async () => {
  await db.kv.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAuthToken(null);
});

describe('gatewayApi', () => {
  it('creates a session with consent and returns its id', async () => {
    const calls = stubGateway(() => ({
      status: 201,
      body: { data: { id: SID, language: 'hi', consentAt: 'x', expiresAt: 'y' }, meta: {} },
    }));
    const res = await gatewayApi.createSession('hi');
    expect(res.data).toEqual({ sessionId: SID });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: '/v1/sessions',
      body: { language: 'hi', consent: true },
    });
  });

  it('saves members, then answers using the backend member ids, and tracks progress', async () => {
    const calls = stubGateway((call) => {
      const body = call.body as { members?: { ref: string }[] };
      return ok({
        sessionId: SID,
        members: (body.members ?? []).map((m, i) => ({
          id: `be-${i}`,
          ref: m.ref,
          relation: 'self',
        })),
        saved: 1,
      });
    });
    const members = [{ id: 'm1', relation: 'self' as const, age: 61, sex: 'male' as const }];
    const first = await gatewayApi.submitAnswer(SID, { members });
    expect(first.data).toMatchObject({ answered: 0, nextQuestion: { id: 'land' } });

    const tax = await gatewayApi.submitAnswer(SID, { answer: { questionId: 'tax', value: false } });
    expect(calls[1]?.body).toEqual({
      answers: [{ key: 'member.paid_income_tax_last_ay', memberId: 'be-0', value: false }],
    });
    expect(tax.data).toMatchObject({ answered: 1, nextQuestion: { id: 'pension' } });

    const unknown = await gatewayApi.submitAnswer(SID, {
      answer: { questionId: 'pension', value: null },
    });
    expect(calls).toHaveLength(2); // "I don't know" stores nothing
    expect(unknown.data).toMatchObject({ answered: 2, nextQuestion: { id: 'bpl' } });
  });

  it('maps evaluation results and keeps evaluatedAt', async () => {
    stubGateway(() =>
      ok({
        sessionId: SID,
        evaluatedAt: '2026-11-01T10:00:00.000Z',
        nextQuestions: [],
        results: [
          {
            schemeCode: 'IGNOAPS',
            schemeName: 'IGNOAPS',
            verdict: 'NEEDS_VERIFICATION',
            reasons: [],
            checksLeft: [],
            missingFacts: [{ key: 'household.bpl_status', memberId: null }],
            benefits: [],
            supersededBy: null,
            checklist: { status: 'PENDING_STATE_VERIFICATION', items: [] },
            source: { document: 'NSAP', section: null, url: null },
            ruleVersion: { id: 'v', version: 1 },
            verifiedOn: null,
          },
        ],
      }),
    );
    const res = await gatewayApi.evaluate(SID);
    expect(res.meta.evaluatedAt).toBe('2026-11-01T10:00:00.000Z');
    expect(res.data.results[0]).toMatchObject({
      scheme: 'IGNOAPS',
      missingFacts: ['household.bpl_status'],
      checklistStatus: 'PENDING_STATE_VERIFICATION',
    });
  });

  it('surfaces 404 for sessions that were never evaluated', async () => {
    stubGateway(() => ({
      status: 404,
      body: { error: { code: 'NO_EVALUATION', message: 'not yet' } },
    }));
    await expect(gatewayApi.getResults(SID)).rejects.toMatchObject({ status: 404 });
  });

  it('picks the explanation for one scheme, in the chosen language', async () => {
    const calls = stubGateway(() =>
      ok({
        sessionId: SID,
        explanations: [
          {
            schemeCode: 'PM-KISAN',
            verdict: 'LIKELY',
            text: 'You may be eligible.',
            citations: [{ chunkId: 'c', documentTitle: 'Guidelines', section: '2.4' }],
          },
        ],
      }),
    );
    const res = await gatewayApi.explain(SID, 'PM-KISAN', undefined, 'hi');
    expect(calls[0]?.body).toEqual({ language: 'hi' });
    expect(res.data).toEqual({ text: 'You may be eligible.', citation: 'Guidelines, section 2.4' });
    await expect(gatewayApi.explain(SID, 'NFBS')).rejects.toBeInstanceOf(ApiError);
  });

  it('logs staff in with e-mail and sends the token on admin calls', async () => {
    const calls = stubGateway((call) =>
      call.url.endsWith('/auth/login')
        ? ok({ token: 'jwt', role: 'admin', expiresIn: 3600 })
        : ok([
            {
              id: 'v',
              schemeCode: 'PMMVY',
              version: 1,
              status: 'draft',
              verifiedOn: null,
              verifiedBy: null,
              notes: 'TODO',
            },
          ]),
    );
    const login = await gatewayApi.login(' admin@example.org ', 'secret-password');
    expect(calls[0]?.body).toEqual({ email: 'admin@example.org', password: 'secret-password' });
    setAuthToken(login.data.token);
    const queue = await gatewayApi.getVerificationQueue();
    expect(calls[1]).toMatchObject({
      url: '/v1/admin/verification-queue?limit=100',
      auth: 'Bearer jwt',
    });
    expect(queue.data[0]?.scheme).toBe('PMMVY');
  });

  it('sends recorded audio as base64 JSON and maps the TTS mime type', async () => {
    const calls = stubGateway((call) =>
      call.url.endsWith('/transcribe')
        ? ok({ text: 'haan', language: 'hi' })
        : ok({ audioBase64: 'QQ==', mimeType: 'audio/wav' }),
    );
    const heard = await gatewayApi.transcribe(new Blob(['hi']), 'hi');
    expect(calls[0]?.body).toEqual({ audioBase64: 'aGk=', language: 'hi' });
    expect(heard.data.text).toBe('haan');
    const spoken = await gatewayApi.speak('नमस्ते', 'hi');
    expect(spoken.data).toEqual({ audioBase64: 'QQ==', mime: 'audio/wav' });
  });

  it('lists schemes and erases a session (204) with its local links', async () => {
    stubGateway((call) =>
      call.method === 'DELETE'
        ? { status: 204 }
        : ok([{ code: 'NFBS', name: 'NFBS', description: 'd', publishedVersion: null }]),
    );
    expect((await gatewayApi.getSchemes()).data[0]).toMatchObject({
      code: 'NFBS',
      status: 'draft',
    });
    await db.kv.put({ key: `gateway:${SID}`, value: { members: {}, answered: [] } });
    await gatewayApi.deleteSession(SID);
    expect(await db.kv.get(`gateway:${SID}`)).toBeUndefined();
  });
});
