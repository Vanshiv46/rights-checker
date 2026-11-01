export type Language = 'hi' | 'en';
export type Verdict = 'LIKELY' | 'NEEDS_VERIFICATION' | 'NOT_ELIGIBLE';
export type DocKind = 'mandatory' | 'conditional' | 'optional';
export type Relation = 'self' | 'spouse' | 'mother' | 'father' | 'son' | 'daughter' | 'other';
export type Sex = 'female' | 'male' | 'other';

export type Occupation =
  | 'farmer'
  | 'agri_labourer'
  | 'daily_wage'
  | 'salaried_private'
  | 'government_employee'
  | 'retired_government'
  | 'self_employed'
  | 'homemaker'
  | 'student'
  | 'unemployed'
  | 'other';

export interface Member {
  id: string;
  relation: Relation;
  age: number;
  sex: Sex;
  occupation?: Occupation;
}

export type FormValue = boolean | number | string;
type Labels = { en: string; hi: string };

/** Condition language of the backend rules DSL, as used by the form's `showIf`. */
export type FormCondition =
  | {
      fact: string;
      op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
      value: FormValue | FormValue[];
    }
  | { all: FormCondition[] }
  | { any: FormCondition[] }
  | { not: FormCondition }
  | { anyMember: FormCondition };

export interface FormField {
  id: string;
  fact: string;
  scope: 'household' | 'member';
  type: 'boolean' | 'number' | 'choice';
  label: Labels;
  unit?: string;
  options?: { value: string; label: Labels }[];
  showIf: FormCondition | null;
}

export interface FormDefinition {
  occupations: { value: Occupation; label: Labels }[];
  fields: FormField[];
}

/** Everything typed into the form, keyed by fact key: household answers, and answers per member id. */
export interface FormValues {
  household: Record<string, FormValue>;
  byMember: Record<string, Record<string, FormValue>>;
}

export interface FormSubmission extends FormValues {
  members: Member[];
}

export interface Question {
  id: string;
  factKey: string;
  scope: 'household' | 'member';
  icon: string;
}

export interface ApiMeta {
  requestId: string;
  evaluatedAt?: string;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiFailure {
  error: { code: string; message: string; details?: unknown };
}

export interface SessionCreated {
  sessionId: string;
}

/** One request per answer so the offline queue can replay them in order. */
export interface AnswerRequest {
  members?: Member[];
  form?: FormSubmission;
  answer?: { questionId: string; value?: boolean | null; text?: string };
}

export interface AnswerResponse {
  nextQuestion: Question | null;
  answered: number;
}

export interface ChecklistDoc {
  document: string;
  kind: DocKind;
}

export interface SchemeResult {
  scheme: string;
  member?: string;
  verdict: Verdict;
  reasons: string[];
  checksLeft?: string[];
  missingFacts?: string[];
  checklist: ChecklistDoc[] | null;
  checklistStatus?: 'PENDING_STATE_VERIFICATION';
  source?: { title: string; section: string; url: string };
  ruleVersion?: string;
  verifiedOn?: string;
  nextStep?: { label: string; url: string; offline: string };
}

export interface EvaluationData {
  results: SchemeResult[];
}

export interface SchemeSummary {
  code: string;
  name: string;
  level: 'central' | 'state';
  officialUrl: string;
  status: 'draft' | 'published' | 'retired';
  currentVersion: string | null;
  verifiedOn: string | null;
}

export interface SchemeDetailData extends SchemeSummary {
  benefit: string | null;
}

export interface ExplainData {
  text: string;
  citation?: string;
}

export interface LoginData {
  token: string;
  role: 'operator' | 'admin';
  cscId: string;
}

export interface VerificationItem {
  scheme: string;
  version: string;
  verifiedOn: string;
  reason: string;
}
