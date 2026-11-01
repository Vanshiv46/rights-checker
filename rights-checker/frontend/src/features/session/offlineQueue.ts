import { ApiError, api } from '../../lib/api';
import { db, type QueuedAnswer } from '../../lib/db';
import type { AnswerRequest } from '../../lib/types';

export async function enqueueAnswer(sessionId: string, request: AnswerRequest): Promise<void> {
  await db.queue.add({ sessionId, request, createdAt: Date.now() });
}

export function sendQueued(item: QueuedAnswer) {
  return api.submitAnswer(item.sessionId, item.request);
}

async function drain(send: (item: QueuedAnswer) => Promise<unknown>): Promise<number> {
  const items = await db.queue.orderBy('id').toArray();
  let sent = 0;
  for (const item of items) {
    try {
      await send(item);
      sent += 1;
    } catch (error) {
      // Keep order: stop on a network/server failure, drop answers the server rejected for good.
      if (!(error instanceof ApiError) || error.retryable) break;
    }
    if (item.id !== undefined) await db.queue.delete(item.id);
  }
  return sent;
}

let inFlight: Promise<number> | null = null;

/** Sends queued answers oldest-first. Concurrent calls share one run. Returns how many were sent. */
export function flushQueue(send: (item: QueuedAnswer) => Promise<unknown> = sendQueued) {
  inFlight ??= drain(send).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
