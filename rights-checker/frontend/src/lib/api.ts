import { env } from './env';
import { gatewayApi } from './gateway';
import { request } from './http';
import type {
  AnswerRequest,
  AnswerResponse,
  ApiSuccess,
  EvaluationData,
  ExplainData,
  FormDefinition,
  Language,
  LoginData,
  SchemeDetailData,
  SchemeSummary,
  SessionCreated,
  VerificationItem,
} from './types';

export { ApiError, request, setAuthToken, type HttpMethod } from './http';

type Call<T> = Promise<ApiSuccess<T>>;

/** Everything the screens need from the server, in the screens' own shapes. */
export interface Api {
  createSession(language: Language): Call<SessionCreated>;
  submitAnswer(id: string, body: AnswerRequest): Call<AnswerResponse>;
  getForm(): Call<FormDefinition>;
  transcribe(audio: Blob, language: Language): Call<{ text: string }>;
  speak(text: string, language: Language): Call<{ audioBase64: string; mime: string }>;
  evaluate(id: string): Call<EvaluationData>;
  getResults(id: string): Call<EvaluationData>;
  explain(id: string, scheme: string, member?: string, language?: Language): Call<ExplainData>;
  getSchemes(): Call<SchemeSummary[]>;
  getScheme(code: string): Call<SchemeDetailData>;
  deleteSession(id: string): Call<void>;
  login(cscId: string, password: string): Call<LoginData>;
  getVerificationQueue(): Call<VerificationItem[]>;
}

const session = (id: string) => `/v1/sessions/${encodeURIComponent(id)}`;

/** Talks to the built-in mock (VITE_USE_MOCK=true), which already speaks the screens' shapes. */
export const mockApi: Api = {
  createSession: (language) =>
    request<SessionCreated>('POST', '/v1/sessions', { language, consent: true }),
  submitAnswer: (id, body) => request<AnswerResponse>('POST', `${session(id)}/answers`, body),
  getForm: () => request<FormDefinition>('GET', '/v1/form'),
  transcribe: (audio, language) => {
    const form = new FormData();
    form.append('audio', audio, 'speech.webm');
    form.append('language', language);
    return request<{ text: string }>('POST', '/v1/voice/transcribe', form);
  },
  speak: (text, language) =>
    request<{ audioBase64: string; mime: string }>('POST', '/v1/voice/speak', { text, language }),
  evaluate: (id) => request<EvaluationData>('POST', `${session(id)}/evaluate`),
  getResults: (id) => request<EvaluationData>('GET', `${session(id)}/results`),
  explain: (id, scheme, member) =>
    request<ExplainData>('POST', `${session(id)}/explain`, { scheme, member }),
  getSchemes: () => request<SchemeSummary[]>('GET', '/v1/schemes'),
  getScheme: (code) => request<SchemeDetailData>('GET', `/v1/schemes/${encodeURIComponent(code)}`),
  deleteSession: (id) => request<void>('DELETE', session(id)),
  login: (cscId, password) => request<LoginData>('POST', '/v1/auth/login', { cscId, password }),
  getVerificationQueue: () => request<VerificationItem[]>('GET', '/v1/admin/verification-queue'),
};

/** The real api-gateway unless VITE_USE_MOCK=true. */
export const api: Api = env.useMock ? mockApi : gatewayApi;
