import { env } from './env';
import type { ApiFailure, ApiSuccess } from './types';

// Generous: AI explanations and a sleeping free-tier backend can take several seconds.
const TIMEOUT_MS = 25_000;
const GET_RETRIES = 2;

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Network failures, timeouts and 5xx are worth retrying; 4xx are not. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseEnvelope<T>(status: number, json: unknown): ApiSuccess<T> {
  if (status >= 200 && status < 300 && isRecord(json) && 'data' in json) {
    return json as unknown as ApiSuccess<T>;
  }
  if (isRecord(json) && isRecord(json.error)) {
    const { code, message, details } = (json as unknown as ApiFailure).error;
    throw new ApiError(code, message, status, details);
  }
  throw new ApiError('BAD_RESPONSE', 'Unexpected response from server', status);
}

async function fetchOnce<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<ApiSuccess<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${env.apiUrl}${path}`, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
    if (response.status === 204) {
      return {
        data: undefined as T,
        meta: { requestId: response.headers.get('x-request-id') ?? '' },
      };
    }
    const json: unknown = await response.json().catch(() => null);
    return parseEnvelope<T>(response.status, json);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const code = controller.signal.aborted ? 'TIMEOUT' : 'NETWORK';
    throw new ApiError(code, 'Could not reach the server', 0);
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Single entry point for every call: typed envelope handling, timeout, GET-only retries. */
export async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<ApiSuccess<T>> {
  if (env.useMock) {
    const { mockRequest } = await import('./mock');
    return mockRequest<T>(method, path, body);
  }
  const attempts = method === 'GET' ? GET_RETRIES + 1 : 1;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetchOnce<T>(method, path, body);
    } catch (error) {
      if (!(error instanceof ApiError) || !error.retryable || attempt >= attempts) throw error;
      await sleep(300 * 2 ** (attempt - 1));
    }
  }
}
