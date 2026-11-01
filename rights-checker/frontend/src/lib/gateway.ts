/**
 * Real api-gateway client. Same interface as the mock-shaped client, so screens and hooks do not
 * change; every payload goes through the mappers in ./adapters.
 */
import {
  linkMembers,
  toAnswerBody,
  toCitation,
  toFormBody,
  toMembersBody,
  toSchemeDetail,
  toSchemeResult,
  toSchemeSummary,
  toVerificationItem,
  type BackendAnswersResult,
  type BackendEvaluation,
  type BackendExplanation,
  type BackendSchemeDetail,
  type BackendSchemeSummary,
  type BackendSession,
  type BackendVersion,
  type MemberLinks,
} from './adapters';
import type { Api } from './api';
import { db, getKv, setKv } from './db';
import { ApiError, request } from './http';
import { nextBankQuestion } from './questions';
import { toWav16k } from './wav';
import type { ApiMeta, ApiSuccess, EvaluationData, FormDefinition, Language } from './types';

const sessionPath = (id: string) => `/v1/sessions/${encodeURIComponent(id)}`;

/** Per-session links kept on the device: backend member ids and which questions were answered. */
interface SessionLinks {
  members: MemberLinks;
  answered: string[];
}

const linksKey = (sessionId: string) => `gateway:${sessionId}`;

async function loadLinks(sessionId: string): Promise<SessionLinks> {
  return (await getKv<SessionLinks>(linksKey(sessionId))) ?? { members: {}, answered: [] };
}

function toEvaluation({ data, meta }: ApiSuccess<BackendEvaluation>): ApiSuccess<EvaluationData> {
  return {
    data: { results: data.results.map(toSchemeResult) },
    meta: { ...meta, evaluatedAt: data.evaluatedAt },
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export const gatewayApi: Api = {
  async createSession(language) {
    const { data, meta } = await request<BackendSession>('POST', '/v1/sessions', {
      language,
      consent: true,
    });
    return { data: { sessionId: data.id }, meta };
  },

  async submitAnswer(id, body) {
    const links = await loadLinks(id);
    let meta: ApiMeta = { requestId: '' };
    if (body.members) {
      const res = await request<BackendAnswersResult>(
        'POST',
        `${sessionPath(id)}/answers`,
        toMembersBody(body.members, links.members),
      );
      links.members = linkMembers(body.members, res.data.members, links.members);
      meta = res.meta;
    }
    if (body.form) {
      const res = await request<BackendAnswersResult>(
        'POST',
        `${sessionPath(id)}/answers`,
        toFormBody(body.form, links.members),
      );
      links.members = linkMembers(body.form.members, res.data.members, links.members);
      meta = res.meta;
    }
    if (body.answer) {
      const payload = toAnswerBody(body.answer, links.members);
      if (payload) {
        meta = (await request<BackendAnswersResult>('POST', `${sessionPath(id)}/answers`, payload))
          .meta;
      }
      if (!links.answered.includes(body.answer.questionId)) {
        links.answered.push(body.answer.questionId);
      }
    }
    await setKv(linksKey(id), links);
    return {
      data: {
        nextQuestion: body.form ? null : nextBankQuestion(body.answer?.questionId ?? null),
        answered: links.answered.length,
      },
      meta,
    };
  },

  async getForm() {
    return request<FormDefinition>('GET', '/v1/form');
  },

  async transcribe(audio, language) {
    const { data, meta } = await request<{ text: string }>('POST', '/v1/voice/transcribe', {
      audioBase64: await blobToBase64(await toWav16k(audio)),
      language,
    });
    return { data: { text: data.text }, meta };
  },

  async speak(text, language) {
    const { data, meta } = await request<{ audioBase64: string; mimeType: string }>(
      'POST',
      '/v1/voice/speak',
      { text, language },
    );
    return { data: { audioBase64: data.audioBase64, mime: data.mimeType }, meta };
  },

  async evaluate(id) {
    return toEvaluation(await request<BackendEvaluation>('POST', `${sessionPath(id)}/evaluate`));
  },

  async getResults(id) {
    return toEvaluation(await request<BackendEvaluation>('GET', `${sessionPath(id)}/results`));
  },

  async explain(id, scheme, _member, language: Language = 'en') {
    const { data, meta } = await request<BackendExplanation>('POST', `${sessionPath(id)}/explain`, {
      language,
    });
    const found = data.explanations.find((e) => e.schemeCode === scheme);
    if (!found) throw new ApiError('NOT_FOUND', 'No explanation for this scheme', 404);
    const citation = toCitation(found.citations[0]);
    return { data: { text: found.text, ...(citation ? { citation } : {}) }, meta };
  },

  async getSchemes() {
    const { data, meta } = await request<BackendSchemeSummary[]>('GET', '/v1/schemes?limit=100');
    return { data: data.map(toSchemeSummary), meta };
  },

  async getScheme(code) {
    const { data, meta } = await request<BackendSchemeDetail>(
      'GET',
      `/v1/schemes/${encodeURIComponent(code)}`,
    );
    return { data: toSchemeDetail(data), meta };
  },

  async deleteSession(id) {
    const res = await request<void>('DELETE', sessionPath(id));
    await db.kv.delete(linksKey(id));
    return res;
  },

  /** Staff log in with the e-mail of their operator account (entered in the CSC ID field). */
  async login(cscId, password) {
    const { data, meta } = await request<{ token: string; role: 'operator' | 'admin' }>(
      'POST',
      '/v1/auth/login',
      { email: cscId.trim(), password },
    );
    return { data: { token: data.token, role: data.role, cscId: cscId.trim() }, meta };
  },

  async getVerificationQueue() {
    const { data, meta } = await request<BackendVersion[]>(
      'GET',
      '/v1/admin/verification-queue?limit=100',
    );
    return { data: data.map(toVerificationItem), meta };
  },
};
