const SYSTEM_PROMPT =
  'You help Indian citizens understand government schemes. Follow the INSTRUCTIONS, use only ' +
  'the data in CONTEXT_JSON, and answer with one JSON object exactly in the shape the ' +
  'instructions describe. Never decide or change eligibility verdicts, never invent ' +
  'documents, amounts, dates or URLs, and never ask for or repeat personal identifiers.';

/**
 * Groq chat-completions provider (OpenAI-compatible API, JSON mode).
 * Output is always validated with the caller's zod schema before it is used.
 * @implements {import('./provider.js').LlmProvider}
 */
export class GroqProvider {
  /**
   * @param {{ apiKey: string, model: string, baseUrl: string, timeoutMs: number,
   *   fetchImpl?: typeof fetch }} options
   */
  constructor(options) {
    this.name = `groq:${options.model}`;
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Sends the prompt and returns the parsed, schema-validated JSON answer. */
  async complete(prompt, schema) {
    const { apiKey, model, baseUrl, timeoutMs } = this.options;
    const res = await this.fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Groq responded ${res.status}`);
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Groq returned no message content');
    return schema.parse(JSON.parse(content));
  }
}

/**
 * Uses `primary` and, if it fails (no network, rate limit, bad JSON), answers with `fallback`
 * so explanations keep working during a demo. Failures are logged, never hidden from logs.
 * @param {import('./provider.js').LlmProvider} primary
 * @param {import('./provider.js').LlmProvider} fallback
 */
export function withFallback(primary, fallback, logger) {
  return {
    name: `${primary.name}+${fallback.name}`,
    async complete(prompt, schema) {
      try {
        return await primary.complete(prompt, schema);
      } catch (err) {
        logger.warn(
          { provider: primary.name, reason: err instanceof Error ? err.message : 'unknown' },
          'llm call failed; using fallback provider',
        );
        return fallback.complete(prompt, schema);
      }
    },
  };
}
