import { randomUUID } from 'node:crypto';
import CircuitBreaker from 'opossum';

import { currentRequestId } from '../context.js';
import { envelopeSchema, errorEnvelopeSchema } from '../contracts/api.js';
import { AppError, Errors } from '../errors.js';
import { REQUEST_ID_HEADER, SERVICE_TOKEN_HEADER } from '../http/middleware.js';

/**
 * Typed internal REST client: service token, x-request-id, timeout, GET retries, breaker.
 *
 * @typedef {'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} HttpMethod
 * @typedef {{ status: number, body: unknown }} RawResponse
 * @typedef {{ body?: unknown, query?: Record<string, string | number | undefined>,
 *   headers?: Record<string, string> }} RequestOptions
 *
 * @typedef {object} ServiceClient
 * @property {string} name
 * @property {(method: HttpMethod, path: string, options?: RequestOptions) => Promise<RawResponse>} request
 *   Raw call; upstream 4xx/5xx are returned, network failure or an open breaker throws 503.
 * @property {(path: string, schema: import('zod').ZodType, query?: RequestOptions['query']) => Promise<any>} getJson
 *   GET and validate the `{ data }` envelope against `schema`.
 * @property {(path: string, body: unknown, schema: import('zod').ZodType) => Promise<any>} postJson
 * @property {() => void} shutdown Stops the circuit breaker timers.
 */

class UpstreamServerError extends Error {
  constructor(response) {
    super(`upstream responded ${response.status}`);
    this.response = response;
  }
}

async function readBody(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: { code: 'NON_JSON_RESPONSE', message: 'Upstream returned non-JSON' } };
  }
}

function buildUrl(baseUrl, path, query) {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Converts an upstream 4xx/5xx body into an AppError with the same status and code. */
export function upstreamError(raw) {
  const parsed = errorEnvelopeSchema.safeParse(raw.body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new AppError(raw.status, code, message, details);
  }
  return new AppError(raw.status, 'UPSTREAM_ERROR', 'Upstream request failed');
}

/** Creates a resilient JSON client for one internal service. */
export function createServiceClient(options) {
  const timeoutMs = options.timeoutMs ?? 2000;
  const retries = options.retries ?? 2;
  const backoffMs = options.backoffMs ?? 100;
  const fetchImpl = options.fetchImpl ?? fetch;

  const attempt = async (args) => {
    const res = await fetchImpl(args.url, {
      method: args.method,
      headers: args.headers,
      body: args.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = { status: res.status, body: await readBody(res) };
    if (raw.status >= 500) throw new UpstreamServerError(raw);
    return raw;
  };

  const breaker = new CircuitBreaker(attempt, {
    timeout: false,
    errorThresholdPercentage: 50,
    volumeThreshold: 5,
    resetTimeout: options.resetTimeoutMs ?? 10_000,
    name: options.name,
  });

  const request = async (method, path, reqOptions = {}) => {
    const args = {
      method,
      url: buildUrl(options.baseUrl, path, reqOptions.query),
      headers: {
        ...reqOptions.headers,
        'content-type': 'application/json',
        [SERVICE_TOKEN_HEADER]: options.serviceToken,
        [REQUEST_ID_HEADER]: currentRequestId() ?? randomUUID(),
      },
      body: reqOptions.body === undefined ? undefined : JSON.stringify(reqOptions.body),
    };
    const maxAttempts = method === 'GET' ? retries + 1 : 1;
    let lastError;
    for (let i = 0; i < maxAttempts; i += 1) {
      if (i > 0) await sleep(backoffMs * 2 ** (i - 1));
      try {
        return await breaker.fire(args);
      } catch (err) {
        lastError = err;
        if (breaker.opened) break;
      }
    }
    if (lastError instanceof UpstreamServerError) return lastError.response;
    options.logger.warn(
      {
        dependency: options.name,
        reason: lastError instanceof Error ? lastError.message : 'unknown',
      },
      'dependency call failed',
    );
    throw Errors.unavailable(options.name);
  };

  const expectJson = (raw, schema) => {
    if (raw.status >= 400) throw upstreamError(raw);
    const parsed = envelopeSchema(schema).safeParse(raw.body);
    if (!parsed.success) {
      throw new AppError(502, 'BAD_UPSTREAM_RESPONSE', `${options.name} sent an invalid response`);
    }
    return parsed.data.data;
  };

  return {
    name: options.name,
    request,
    async getJson(path, schema, query) {
      return expectJson(await request('GET', path, { query }), schema);
    },
    async postJson(path, body, schema) {
      return expectJson(await request('POST', path, { body }), schema);
    },
    shutdown() {
      breaker.shutdown();
    },
  };
}
