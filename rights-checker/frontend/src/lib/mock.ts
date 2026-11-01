import { ApiError, type HttpMethod } from './http';
import { FALLBACK_FORM } from './form';
import { nextBankQuestion } from './questions';
import type {
  AnswerRequest,
  ApiSuccess,
  EvaluationData,
  SchemeDetailData,
  SchemeResult,
} from './types';

const LATENCY_MS = 80;

interface MockSession {
  answered: number;
  lastQuestionId: string | null;
  evaluatedAt?: string;
}

const sessions = new Map<string, MockSession>();
let requestCounter = 0;

const EXAMPLE_RESULTS: SchemeResult[] = [
  {
    scheme: 'PM-KISAN',
    verdict: 'LIKELY',
    reasons: ['household.owns_cultivable_land = true'],
    checksLeft: ['any_member.paid_income_tax_last_ay', 'any_member.monthly_pension'],
    checklist: [
      { document: 'Aadhaar', kind: 'mandatory' },
      { document: 'Aadhaar-seeded bank account', kind: 'mandatory' },
      { document: 'Land record details', kind: 'mandatory' },
    ],
    source: {
      title: 'PM-KISAN Operational Guidelines',
      section: '2.4',
      url: 'https://pmkisan.gov.in',
    },
    ruleVersion: 'pm-kisan@2026-11-01',
    verifiedOn: '2026-11-01',
    nextStep: {
      label: 'New Farmer Registration',
      url: 'https://pmkisan.gov.in',
      offline: 'Nearest Common Service Centre',
    },
  },
  {
    scheme: 'IGNOAPS',
    member: 'mother',
    verdict: 'NEEDS_VERIFICATION',
    reasons: ['member.age = 66 (>= 60)'],
    missingFacts: ['household.bpl_status'],
    checklist: null,
    checklistStatus: 'PENDING_STATE_VERIFICATION',
  },
];

function scheme(
  code: string,
  name: string,
  status: SchemeDetailData['status'],
  currentVersion: string | null,
  verifiedOn: string | null,
  benefit: string | null,
): SchemeDetailData {
  return {
    code,
    name,
    level: 'central',
    officialUrl: 'https://www.myscheme.gov.in',
    status,
    currentVersion,
    verifiedOn,
    benefit,
  };
}

const SCHEMES: SchemeDetailData[] = [
  scheme(
    'PM-KISAN',
    'PM-KISAN',
    'published',
    'pm-kisan@2026-11-01',
    '2026-11-01',
    'Rs 6,000 per year in three instalments',
  ),
  scheme(
    'IGNOAPS',
    'Indira Gandhi National Old Age Pension Scheme',
    'published',
    'ignoaps@2026-05-01',
    '2026-05-01',
    'Central assistance Rs 200/month (age 60-79), Rs 500/month (age 80+)',
  ),
  scheme('PMMVY', 'Pradhan Mantri Matru Vandana Yojana', 'draft', null, null, null),
  scheme('IGNWPS', 'Indira Gandhi National Widow Pension Scheme', 'draft', null, null, null),
  scheme('IGNDPS', 'Indira Gandhi National Disability Pension Scheme', 'draft', null, null, null),
  scheme('NFBS', 'National Family Benefit Scheme', 'draft', null, null, null),
];

function sessionFor(id: string): MockSession {
  const existing = sessions.get(id);
  if (existing) return existing;
  const created: MockSession = { answered: 0, lastQuestionId: null };
  sessions.set(id, created);
  return created;
}

function handleAnswer(id: string, body: AnswerRequest) {
  const current = sessionFor(id);
  if (body.form) {
    current.lastQuestionId = null;
    return { nextQuestion: null, answered: current.answered };
  }
  if (body.answer) {
    current.answered += 1;
    current.lastQuestionId = body.answer.questionId;
  } else if (body.members) {
    current.lastQuestionId = null;
  }
  return { nextQuestion: nextBankQuestion(current.lastQuestionId), answered: current.answered };
}

function route(method: HttpMethod, path: string, body: unknown): unknown {
  const sessionMatch = /^\/v1\/sessions\/([^/]+)(?:\/(\w+))?$/.exec(path);
  if (method === 'POST' && path === '/v1/sessions') {
    const sessionId = `RE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    sessions.set(sessionId, { answered: 0, lastQuestionId: null });
    return { sessionId };
  }
  if (sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1] ?? '');
    const action = sessionMatch[2];
    if (method === 'POST' && action === 'answers') return handleAnswer(id, body as AnswerRequest);
    if (method === 'POST' && action === 'evaluate') {
      sessionFor(id).evaluatedAt = new Date().toISOString();
      return { results: EXAMPLE_RESULTS } satisfies EvaluationData;
    }
    if (method === 'GET' && action === 'results') {
      if (!sessionFor(id).evaluatedAt) throw new ApiError('NOT_FOUND', 'No results yet', 404);
      return { results: EXAMPLE_RESULTS } satisfies EvaluationData;
    }
    if (method === 'POST' && action === 'explain') {
      const { scheme: code } = body as { scheme: string };
      return {
        text: `Mock explanation for ${code}: the rules engine found the conditions shown above. The government office takes the final decision.`,
      };
    }
    if (method === 'DELETE' && !action) {
      sessions.delete(id);
      return undefined;
    }
  }
  if (method === 'GET' && path === '/v1/form') return FALLBACK_FORM;
  if (method === 'POST' && path === '/v1/voice/transcribe') return { text: 'haan' };
  if (method === 'POST' && path === '/v1/voice/speak')
    return { audioBase64: '', mime: 'audio/mpeg' };
  if (method === 'GET' && path === '/v1/schemes') return SCHEMES;
  const schemeMatch = /^\/v1\/schemes\/([^/]+)$/.exec(path);
  if (method === 'GET' && schemeMatch) {
    const found = SCHEMES.find((s) => s.code === decodeURIComponent(schemeMatch[1] ?? ''));
    if (!found) throw new ApiError('NOT_FOUND', 'Scheme not found', 404);
    return found;
  }
  if (method === 'POST' && path === '/v1/auth/login') {
    const { cscId } = body as { cscId: string };
    return { token: 'mock-token', cscId, role: cscId.startsWith('admin') ? 'admin' : 'operator' };
  }
  if (method === 'GET' && path === '/v1/admin/verification-queue') {
    return [
      {
        scheme: 'IGNOAPS',
        version: 'ignoaps@2026-05-01',
        verifiedOn: '2026-05-01',
        reason: 'Verified-on date is older than 90 days',
      },
    ];
  }
  throw new ApiError('NOT_FOUND', `No mock route for ${method} ${path}`, 404);
}

/** Stands in for the api-gateway when VITE_USE_MOCK=true. Fails like a network when offline. */
export async function mockRequest<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<ApiSuccess<T>> {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  if (!navigator.onLine) throw new ApiError('NETWORK', 'Could not reach the server', 0);
  requestCounter += 1;
  const data = route(method, path, body) as T;
  const meta: ApiSuccess<T>['meta'] = { requestId: `mock_${requestCounter}` };
  if (path.endsWith('/evaluate') || path.endsWith('/results')) {
    meta.evaluatedAt = sessionFor(decodeURIComponent(path.split('/')[3] ?? '')).evaluatedAt;
  }
  return { data, meta };
}
