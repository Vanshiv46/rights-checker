import { useMutation, useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { ApiError, api } from '../../lib/api';
import { db } from '../../lib/db';
import type { ChecklistDoc, DocKind, SchemeResult } from '../../lib/types';
import { flushQueue } from '../session/offlineQueue';
import { useSessionStore } from '../session/store';

export interface LoadedResults {
  results: SchemeResult[];
  evaluatedAt: string;
  fromCache: boolean;
}

async function fetchFresh(sessionId: string, evaluate: boolean) {
  if (evaluate) {
    await flushQueue();
    return api.evaluate(sessionId);
  }
  try {
    return await api.getResults(sessionId);
  } catch (error) {
    // 404 = never evaluated (gateway: NO_EVALUATION, mock: NOT_FOUND): evaluate now.
    if (error instanceof ApiError && error.status === 404) return api.evaluate(sessionId);
    throw error;
  }
}

/** Evaluates (when answers changed) or fetches saved results; falls back to the offline copy. */
export async function loadResults(sessionId: string): Promise<LoadedResults> {
  const store = useSessionStore.getState();
  try {
    const { data, meta } = await fetchFresh(sessionId, store.needsEvaluation);
    const evaluatedAt = meta.evaluatedAt ?? new Date().toISOString();
    await db.results.put({ sessionId, results: data.results, evaluatedAt });
    store.setNeedsEvaluation(false);
    store.setLastEvaluatedAt(evaluatedAt);
    return { results: data.results, evaluatedAt, fromCache: false };
  } catch (error) {
    const cached = await db.results.get(sessionId);
    if (cached && error instanceof ApiError && error.retryable) {
      store.setLastEvaluatedAt(cached.evaluatedAt);
      return { results: cached.results, evaluatedAt: cached.evaluatedAt, fromCache: true };
    }
    throw error;
  }
}

export function useResults(sessionId: string | null) {
  return useQuery({
    queryKey: ['results', sessionId],
    queryFn: () => loadResults(sessionId ?? ''),
    enabled: sessionId !== null,
  });
}

export function useScheme(code: string) {
  return useQuery({
    queryKey: ['scheme', code],
    queryFn: async () => (await api.getScheme(code)).data,
  });
}

export function useSchemes() {
  return useQuery({ queryKey: ['schemes'], queryFn: async () => (await api.getSchemes()).data });
}

export function useVerificationQueue() {
  return useQuery({
    queryKey: ['verification-queue'],
    queryFn: async () => (await api.getVerificationQueue()).data,
  });
}

export function useExplain(sessionId: string) {
  const language = useSessionStore((s) => s.language);
  return useMutation({
    mutationFn: ({ scheme, member }: { scheme: string; member?: string }) =>
      api.explain(sessionId, scheme, member, language),
  });
}

export function schemePath(result: Pick<SchemeResult, 'scheme' | 'member'>, base = 'scheme') {
  return `/${base}/${encodeURIComponent(result.scheme)}?m=${encodeURIComponent(result.member ?? '')}`;
}

export function findResult(results: SchemeResult[], code: string, member: string) {
  return results.find((r) => r.scheme === code && (r.member ?? '') === member);
}

const KIND_ORDER: DocKind[] = ['mandatory', 'conditional', 'optional'];

export function groupByKind(docs: ChecklistDoc[]): { kind: DocKind; docs: ChecklistDoc[] }[] {
  return KIND_ORDER.map((kind) => ({ kind, docs: docs.filter((d) => d.kind === kind) })).filter(
    (group) => group.docs.length > 0,
  );
}

/** Document ticks, stored in IndexedDB per session, scheme and member. */
export function useChecklistTicks(sessionId: string, code: string, member: string) {
  const key = `ticks:${sessionId}:${code}:${member}`;
  const ticked = useTicks(key);
  const toggle = async (document: string) => {
    const next = ticked.includes(document)
      ? ticked.filter((d) => d !== document)
      : [...ticked, document];
    await db.kv.put({ key, value: next });
  };
  return { ticked, toggle };
}

function useTicks(key: string): string[] {
  const row = useLiveQuery(() => db.kv.get(key), [key]);
  return useMemo(() => (Array.isArray(row?.value) ? (row.value as string[]) : []), [row]);
}
