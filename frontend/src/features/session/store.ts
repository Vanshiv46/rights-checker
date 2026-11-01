import { create } from 'zustand';
import { getKv, setKv } from '../../lib/db';
import type { FormValues, Language, Member, Question } from '../../lib/types';

export interface Operator {
  cscId: string;
  role: 'operator' | 'admin';
}

export interface Draft {
  language: Language;
  sessionId: string | null;
  members: Member[];
  formValues: FormValues;
  question: Question | null;
  answered: number;
  needsEvaluation: boolean;
  lastEvaluatedAt: string | null;
}

interface SessionState extends Draft {
  operator: Operator | null;
  setLanguage: (language: Language) => void;
  startSession: (sessionId: string) => void;
  resumeSession: (sessionId: string) => void;
  setMembers: (members: Member[]) => void;
  setFormValues: (values: FormValues) => void;
  setQuestion: (question: Question | null, answered: number) => void;
  setNeedsEvaluation: (value: boolean) => void;
  setLastEvaluatedAt: (value: string | null) => void;
  setOperator: (operator: Operator | null) => void;
  reset: () => void;
}

const emptySession = {
  sessionId: null,
  members: [],
  formValues: { household: {}, byMember: {} },
  question: null,
  answered: 0,
  needsEvaluation: false,
  lastEvaluatedAt: null,
} satisfies Omit<Draft, 'language'>;

export const useSessionStore = create<SessionState>()((set) => ({
  language: 'en',
  ...emptySession,
  operator: null,
  setLanguage: (language) => set({ language }),
  startSession: (sessionId) => set({ ...emptySession, sessionId }),
  resumeSession: (sessionId) => set({ ...emptySession, sessionId }),
  setMembers: (members) => set({ members }),
  setFormValues: (formValues) => set({ formValues }),
  setQuestion: (question, answered) => set({ question, answered }),
  setNeedsEvaluation: (needsEvaluation) => set({ needsEvaluation }),
  setLastEvaluatedAt: (lastEvaluatedAt) => set({ lastEvaluatedAt }),
  setOperator: (operator) => set({ operator }),
  reset: () => set({ ...emptySession }),
}));

const DRAFT_KEY = 'draft';

function pickDraft(state: SessionState): Draft {
  const {
    language,
    sessionId,
    members,
    formValues,
    question,
    answered,
    needsEvaluation,
    lastEvaluatedAt,
  } = state;
  return {
    language,
    sessionId,
    members,
    formValues,
    question,
    answered,
    needsEvaluation,
    lastEvaluatedAt,
  };
}

/** Restores the unfinished session from IndexedDB so a closed tab resumes where it stopped. */
export async function hydrateDraft(): Promise<void> {
  const draft = await getKv<Draft>(DRAFT_KEY);
  if (draft)
    useSessionStore.setState({
      ...draft,
      formValues: draft.formValues ?? { household: {}, byMember: {} },
    });
}

/** Mirrors the draft into IndexedDB on every change. Returns an unsubscribe function. */
export function startDraftPersistence(): () => void {
  return useSessionStore.subscribe((state) => {
    void setKv(DRAFT_KEY, pickDraft(state));
  });
}
