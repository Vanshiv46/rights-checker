import Dexie, { type Table } from 'dexie';
import type { AnswerRequest, SchemeResult } from './types';

export interface QueuedAnswer {
  id?: number;
  sessionId: string;
  request: AnswerRequest;
  createdAt: number;
}

export interface CachedResults {
  sessionId: string;
  results: SchemeResult[];
  evaluatedAt: string;
}

export interface KeyValue {
  key: string;
  value: unknown;
}

class AppDatabase extends Dexie {
  declare queue: Table<QueuedAnswer, number>;
  declare results: Table<CachedResults, string>;
  declare kv: Table<KeyValue, string>;

  constructor() {
    super('rights-checker');
    this.version(1).stores({ queue: '++id, sessionId', results: 'sessionId', kv: 'key' });
  }
}

export const db = new AppDatabase();

export async function getKv<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

/** Removes everything stored locally for one session. */
export async function clearSessionData(sessionId: string): Promise<void> {
  await db.queue.where('sessionId').equals(sessionId).delete();
  await db.results.delete(sessionId);
  await db.kv.where('key').startsWith(`ticks:${sessionId}:`).delete();
  await db.kv.delete('draft');
}
