/**
 * Pure mapping between the screens' view models (./types) and the api-gateway contract
 * (backend packages/common/src/contracts). Kept free of I/O so it is easy to unit test.
 */
import type {
  AnswerRequest,
  FormSubmission,
  ChecklistDoc,
  Language,
  Member,
  Relation,
  SchemeDetailData,
  SchemeResult,
  SchemeSummary,
  VerificationItem,
} from './types';

/* ---------- backend shapes (only the fields the frontend reads) ---------- */

export type BackendRelation = 'self' | 'spouse' | 'parent' | 'child' | 'sibling' | 'other';
type FactValue = boolean | number | string;

export interface BackendSession {
  id: string;
  language: Language;
  consentAt: string;
  expiresAt: string;
}

export interface BackendAnswer {
  key: string;
  value: FactValue;
  memberId?: string;
  memberRef?: string;
}

export interface BackendAnswersBody {
  members?: { ref: string; relation: BackendRelation }[];
  answers: BackendAnswer[];
}

export interface BackendAnswersResult {
  sessionId: string;
  members: { id: string; ref: string | null; relation: BackendRelation }[];
  saved: number;
}

interface BackendMissingFact {
  key: string;
  memberId: string | null;
}

export interface BackendResult {
  schemeCode: string;
  schemeName: string;
  verdict: SchemeResult['verdict'];
  reasons: {
    clauseId: string;
    kind: 'requirement' | 'exclusion' | 'superseded';
    outcome: 'met' | 'not_met' | 'unknown' | 'applies' | 'does_not_apply';
    description: string;
  }[];
  checksLeft: { clauseId: string; description: string; missingFacts: BackendMissingFact[] }[];
  missingFacts: BackendMissingFact[];
  benefits: string[];
  supersededBy: string | null;
  checklist: {
    status: 'AVAILABLE' | 'PENDING_STATE_VERIFICATION' | 'TODO';
    items: { id: string; label: string }[];
  };
  source: { document: string; section: string | null; url: string | null };
  ruleVersion: { id: string; version: number };
  verifiedOn: string | null;
}

export interface BackendEvaluation {
  sessionId: string;
  evaluatedAt: string;
  results: BackendResult[];
}

interface BackendRule {
  benefits: { description: string }[];
  source: { url: string | null };
}

export interface BackendSchemeSummary {
  code: string;
  name: string;
  description: string;
  publishedVersion: { id: string; version: number; verifiedOn: string | null } | null;
}

export interface BackendSchemeDetail extends BackendSchemeSummary {
  rule: BackendRule | null;
}

export interface BackendVersion {
  id: string;
  schemeCode: string;
  version: number;
  status: 'draft' | 'published' | 'retired';
  verifiedOn: string | null;
  verifiedBy: string | null;
  notes: string | null;
}

export interface BackendExplanation {
  sessionId: string;
  explanations: {
    schemeCode: string;
    text: string;
    citations: { documentTitle: string; section: string | null }[];
  }[];
}

/* ---------- household and answers ---------- */

const RELATIONS: Record<Relation, BackendRelation> = {
  self: 'self',
  spouse: 'spouse',
  mother: 'parent',
  father: 'parent',
  son: 'child',
  daughter: 'child',
  other: 'other',
};

/** Frontend member id -> backend member id, for members already saved in this session. */
export type MemberLinks = Record<string, string>;

/** The backend only allows 16-character refs; frontend member ids are short (`m` + base36). */
export const memberRef = (member: Member) => member.id.slice(0, 16);

/**
 * New members are created with a ref; already-saved members only get their age updated.
 * Sex is not sent: no published rule uses it, and the backend stores only catalogue facts.
 */
export function toMembersBody(members: Member[], links: MemberLinks): BackendAnswersBody {
  const fresh = members.filter((m) => !links[m.id]);
  return {
    members: fresh.map((m) => ({ ref: memberRef(m), relation: RELATIONS[m.relation] })),
    answers: members.map((m) => {
      const linked = links[m.id];
      return linked
        ? { key: 'member.age', memberId: linked, value: m.age }
        : { key: 'member.age', memberRef: memberRef(m), value: m.age };
    }),
  };
}

/**
 * One request for the whole form: creates new members and stores every shown answer (age,
 * occupation, and the follow-up questions) for members and the household. Sex is not sent: no
 * published rule uses it, and the backend stores only catalogue facts.
 */
export function toFormBody(form: FormSubmission, links: MemberLinks): BackendAnswersBody {
  const fresh = form.members.filter((m) => !links[m.id]);
  const answers: BackendAnswer[] = [];
  for (const m of form.members) {
    const linked = links[m.id];
    const target = linked ? { memberId: linked } : { memberRef: memberRef(m) };
    answers.push({ key: 'member.age', value: m.age, ...target });
    if (m.occupation) answers.push({ key: 'member.occupation', value: m.occupation, ...target });
    for (const [key, value] of Object.entries(form.byMember[m.id] ?? {})) {
      answers.push({ key, value, ...target });
    }
  }
  for (const [key, value] of Object.entries(form.household)) answers.push({ key, value });
  return {
    members: fresh.map((m) => ({ ref: memberRef(m), relation: RELATIONS[m.relation] })),
    answers,
  };
}

/** Adds the backend ids returned for newly created members to the links. */
export function linkMembers(
  members: Member[],
  saved: BackendAnswersResult['members'],
  links: MemberLinks,
): MemberLinks {
  const byRef = new Map(saved.filter((m) => m.ref).map((m) => [m.ref, m.id]));
  const next = { ...links };
  for (const m of members) {
    const id = byRef.get(memberRef(m));
    if (id) next[m.id] = id;
  }
  return next;
}

const YES = new Set(['yes', 'yeah', 'haan', 'han', 'ha', 'ji', 'हाँ', 'हां', 'हा', 'जी']);
const NO = new Set(['no', 'nope', 'nahi', 'nahin', 'na', 'नहीं', 'नही', 'ना']);

/** Reads a spoken/typed yes or no (Hindi or English). Anything else counts as "don't know". */
export function parseYesNo(text: string): boolean | null {
  const words = text
    .toLowerCase()
    .split(/[\s,.!?।]+/u)
    .filter(Boolean);
  if (words.some((w) => NO.has(w))) return false;
  if (words.some((w) => YES.has(w))) return true;
  return null;
}

/**
 * Turns one answer to a bank question into backend facts. Returns null when there is nothing to
 * store ("I don't know", or a household-wide question asked before any member exists).
 *
 * The tax and pension questions are asked about the whole household ("does anyone…"), while the
 * backend stores them per member and its rules check "any member". So "no" is written for every
 * member, and "yes" is written on the first member (which member does not change the verdict).
 * A "yes" to the pension question is stored as Rs 10,000, the rule's threshold.
 */
export function toAnswerBody(
  answer: NonNullable<AnswerRequest['answer']>,
  links: MemberLinks,
): BackendAnswersBody | null {
  const value = answer.value !== undefined ? answer.value : parseYesNo(answer.text ?? '');
  if (value === null) return null;
  const memberIds = Object.values(links);
  const perMember = (key: string, yes: FactValue, no: FactValue): BackendAnswer[] => {
    const [first] = memberIds;
    if (value) return first ? [{ key, memberId: first, value: yes }] : [];
    return memberIds.map((memberId) => ({ key, memberId, value: no }));
  };
  let answers: BackendAnswer[];
  switch (answer.questionId) {
    case 'land':
      answers = [{ key: 'household.owns_cultivable_land', value }];
      break;
    case 'bpl':
      answers = [{ key: 'household.bpl_status', value }];
      break;
    case 'tax':
      answers = perMember('member.paid_income_tax_last_ay', true, false);
      break;
    case 'pension':
      answers = perMember('member.monthly_pension', 10000, 0);
      break;
    default:
      answers = [];
  }
  return answers.length > 0 ? { answers } : null;
}

/* ---------- results ---------- */

/** Backend fact keys -> the keys the screens have labels for (src/i18n facts.*). */
const FACT_KEYS: Record<string, string> = {
  'member.paid_income_tax_last_ay': 'any_member.paid_income_tax_last_ay',
  'member.monthly_pension': 'any_member.monthly_pension',
};
export const toFactKey = (key: string) => FACT_KEYS[key] ?? key;

/** Backend checklist item ids -> document names used by the i18n files. */
const DOCUMENTS: Record<string, string> = {
  aadhaar: 'Aadhaar',
  bank_account: 'Aadhaar-seeded bank account',
  land_record: 'Land record details',
};

const unique = (values: string[]) => [...new Set(values)];

/** Most decisive reasons first; unknown and "does not apply" outcomes are left out. */
const REASON_ORDER = ['not_met', 'applies', 'met'] as const;

export function toSchemeResult(r: BackendResult): SchemeResult {
  const reasons = REASON_ORDER.flatMap((outcome) =>
    r.reasons.filter((x) => x.outcome === outcome).map((x) => x.description),
  );
  const checksLeft = unique(
    r.checksLeft.flatMap((c) =>
      c.missingFacts.length > 0 ? c.missingFacts.map((f) => toFactKey(f.key)) : [c.description],
    ),
  );
  const checklist: ChecklistDoc[] | null =
    r.checklist.status === 'AVAILABLE'
      ? r.checklist.items.map((i) => ({ document: DOCUMENTS[i.id] ?? i.label, kind: 'mandatory' }))
      : null;
  return {
    scheme: r.schemeCode,
    verdict: r.verdict,
    reasons,
    checksLeft,
    missingFacts: unique(r.missingFacts.map((f) => toFactKey(f.key))),
    checklist,
    ...(r.checklist.status === 'PENDING_STATE_VERIFICATION'
      ? { checklistStatus: 'PENDING_STATE_VERIFICATION' as const }
      : {}),
    source: { title: r.source.document, section: r.source.section ?? '', url: r.source.url ?? '' },
    ruleVersion: `${r.schemeCode.toLowerCase()}@v${r.ruleVersion.version}`,
    ...(r.verifiedOn ? { verifiedOn: r.verifiedOn } : {}),
  };
}

/* ---------- schemes and admin ---------- */

export function toSchemeSummary(s: BackendSchemeSummary): SchemeSummary {
  const published = s.publishedVersion;
  return {
    code: s.code,
    name: s.name,
    level: 'central',
    officialUrl: '',
    status: published ? 'published' : 'draft',
    currentVersion: published ? `${s.code.toLowerCase()}@v${published.version}` : null,
    verifiedOn: published?.verifiedOn ?? null,
  };
}

export function toSchemeDetail(s: BackendSchemeDetail): SchemeDetailData {
  const benefits = s.rule?.benefits.map((b) => b.description) ?? [];
  return {
    ...toSchemeSummary(s),
    officialUrl: s.rule?.source.url ?? '',
    benefit: benefits.length > 0 ? benefits.join(' ') : null,
  };
}

export function toVerificationItem(v: BackendVersion): VerificationItem {
  return {
    scheme: v.schemeCode,
    version: `${v.schemeCode.toLowerCase()}@v${v.version}`,
    verifiedOn: v.verifiedOn ?? '',
    reason: v.notes ?? 'Draft waiting for verification',
  };
}

export function toCitation(c: { documentTitle: string; section: string | null } | undefined) {
  if (!c) return undefined;
  return c.section ? `${c.documentTitle}, section ${c.section}` : c.documentTitle;
}
