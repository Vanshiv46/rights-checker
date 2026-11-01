import { createLogger } from '@rec/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GroqProvider, withFallback } from '../src/llm/groq-provider.js';
import { MockProvider } from '../src/llm/mock-provider.js';
import { buildPrompt } from '../src/llm/provider.js';

const logger = createLogger('ai-service', 'silent');
const schema = z.object({
  explanations: z.array(z.object({ schemeCode: z.string(), text: z.string() })),
});

const groqReply = (content, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });

function provider(fetchImpl) {
  return new GroqProvider({
    apiKey: 'gsk_test_key_123',
    model: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1/',
    timeoutMs: 1000,
    fetchImpl,
  });
}

describe('GroqProvider', () => {
  it('calls chat completions in JSON mode and validates the answer', async () => {
    const fetchImpl = vi.fn(async () =>
      groqReply(
        JSON.stringify({ explanations: [{ schemeCode: 'PM-KISAN', text: 'You may qualify.' }] }),
      ),
    );
    const out = await provider(fetchImpl).complete('TASK: explain\n…', schema);
    expect(out.explanations[0].text).toBe('You may qualify.');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer gsk_test_key_123');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
    });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toBe('TASK: explain\n…');
  });

  it.each([
    ['HTTP error', () => groqReply('{}', 429)],
    ['no content', () => new Response(JSON.stringify({ choices: [] }), { status: 200 })],
    ['invalid JSON', () => groqReply('not json')],
    ['wrong shape', () => groqReply(JSON.stringify({ explanations: 'x' }))],
  ])('throws on %s', async (_name, reply) => {
    await expect(provider(vi.fn(async () => reply())).complete('p', schema)).rejects.toThrow();
  });
});

describe('withFallback', () => {
  it('uses the primary provider when it works', async () => {
    const primary = { name: 'p', complete: vi.fn(async () => ({ explanations: [] })) };
    const llm = withFallback(primary, new MockProvider(), logger);
    expect(await llm.complete('x', schema)).toEqual({ explanations: [] });
    expect(llm.name).toBe('p+mock');
  });

  it('falls back to the template provider when Groq fails', async () => {
    const failing = { name: 'groq', complete: vi.fn(async () => Promise.reject(new Error('429'))) };
    const llm = withFallback(failing, new MockProvider(), logger);
    const prompt = buildPrompt('explain', 'i', {
      language: 'en',
      items: [
        { schemeCode: 'PM-KISAN', verdict: 'LIKELY', reasons: ['Owns land.'], checksLeft: [] },
      ],
    });
    const out = await llm.complete(prompt, schema);
    expect(out.explanations[0].text).toContain('You may be eligible.');
  });
});
