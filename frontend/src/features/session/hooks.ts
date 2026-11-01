import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api, setAuthToken } from '../../lib/api';
import { clearSessionData } from '../../lib/db';
import { QUESTION_BANK, nextBankQuestion } from '../../lib/questions';
import type { AnswerRequest, AnswerResponse } from '../../lib/types';
import { enqueueAnswer, flushQueue } from './offlineQueue';
import { startDraftPersistence, useSessionStore } from './store';
import { useOnline } from './useOnline';

/** Keeps i18next and <html lang> in step with the chosen language and persists the draft. */
export function useAppBootstrap(): void {
  const { i18n } = useTranslation();
  const language = useSessionStore((s) => s.language);

  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [i18n, language]);

  useEffect(() => startDraftPersistence(), []);
}

export function useCreateSession() {
  const language = useSessionStore((s) => s.language);
  const startSession = useSessionStore((s) => s.startSession);
  return useMutation({
    mutationFn: () => api.createSession(language),
    onSuccess: ({ data }) => startSession(data.sessionId),
  });
}

/** Sends one answer online, or queues it in IndexedDB (and moves on locally) when offline. */
export function useSubmitAnswer() {
  const online = useOnline();
  return useMutation({
    mutationFn: async (request: AnswerRequest): Promise<AnswerResponse> => {
      const { sessionId, question, answered, setNeedsEvaluation } = useSessionStore.getState();
      if (!sessionId) throw new ApiError('NO_SESSION', 'No active session', 400);
      setNeedsEvaluation(true);
      if (!online) {
        await enqueueAnswer(sessionId, request);
        return {
          nextQuestion: nextBankQuestion(request.answer ? (question?.id ?? null) : null),
          answered: request.answer ? answered + 1 : answered,
        };
      }
      await flushQueue();
      return (await api.submitAnswer(sessionId, request)).data;
    },
    onSuccess: (data) => useSessionStore.getState().setQuestion(data.nextQuestion, data.answered),
  });
}

/** State and actions for the one-question-per-screen flow. */
export function useQuestionFlow() {
  const question = useSessionStore((s) => s.question);
  const answered = useSessionStore((s) => s.answered);
  const submit = useSubmitAnswer();

  const answer = (value: boolean | null) => {
    if (question) submit.mutate({ answer: { questionId: question.id, value } });
  };
  const answerText = (text: string) => {
    if (question) submit.mutate({ answer: { questionId: question.id, text } });
  };

  const index = question ? QUESTION_BANK.findIndex((q) => q.id === question.id) : -1;
  const previous = index > 0 ? (QUESTION_BANK[index - 1] ?? null) : null;
  /** Steps back one question; answering it again replaces the earlier answer. */
  const back = () => {
    if (previous) useSessionStore.getState().setQuestion(previous, Math.max(0, answered - 1));
  };

  return {
    question,
    position: answered + 1,
    total: QUESTION_BANK.length,
    answer,
    answerText,
    back: previous ? back : null,
    isPending: submit.isPending,
    error: submit.error,
  };
}

export function useDeleteSession() {
  const reset = useSessionStore((s) => s.reset);
  return useMutation({
    mutationFn: async (sessionId: string) => {
      await api.deleteSession(sessionId);
      await clearSessionData(sessionId);
    },
    onSuccess: () => reset(),
  });
}

export function useOperatorLogin() {
  const setOperator = useSessionStore((s) => s.setOperator);
  return useMutation({
    mutationFn: ({ cscId, password }: { cscId: string; password: string }) =>
      api.login(cscId, password),
    onSuccess: ({ data }) => {
      setAuthToken(data.token);
      setOperator({ cscId: data.cscId, role: data.role });
    },
  });
}

export function useOperatorLogout() {
  const setOperator = useSessionStore((s) => s.setOperator);
  const reset = useSessionStore((s) => s.reset);
  return () => {
    setAuthToken(null);
    setOperator(null);
    reset();
  };
}
