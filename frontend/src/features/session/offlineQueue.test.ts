import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../../lib/api';
import { db } from '../../lib/db';
import { enqueueAnswer, flushQueue } from './offlineQueue';
import { useOfflineQueue } from './useOfflineQueue';

const answer = (questionId: string) => ({ answer: { questionId, value: true } });
const reply = { data: { nextQuestion: null, answered: 1 }, meta: { requestId: 'r' } };

describe('offline answer queue', () => {
  beforeEach(async () => {
    await db.queue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends queued answers in the order they were given and empties the queue', async () => {
    await enqueueAnswer('S1', answer('land'));
    await enqueueAnswer('S1', answer('tax'));
    await enqueueAnswer('S1', answer('pension'));
    const sent: string[] = [];
    const sentCount = await flushQueue(async (item) => {
      sent.push(item.request.answer?.questionId ?? '');
    });
    expect(sent).toEqual(['land', 'tax', 'pension']);
    expect(sentCount).toBe(3);
    expect(await db.queue.count()).toBe(0);
  });

  it('stops at the first network failure and keeps the rest for later', async () => {
    await enqueueAnswer('S1', answer('land'));
    await enqueueAnswer('S1', answer('tax'));
    await flushQueue(async () => {
      throw new ApiError('NETWORK', 'offline', 0);
    });
    expect(await db.queue.count()).toBe(2);
  });

  it('drops an answer the server rejected permanently', async () => {
    await enqueueAnswer('S1', answer('land'));
    await flushQueue(async () => {
      throw new ApiError('VALIDATION', 'bad answer', 422);
    });
    expect(await db.queue.count()).toBe(0);
  });

  it('useOfflineQueue reports pending answers and flushes them when back online', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const submit = vi.spyOn(api, 'submitAnswer').mockResolvedValue(reply);
    await enqueueAnswer('S1', answer('land'));
    await enqueueAnswer('S1', answer('tax'));

    const { result } = renderHook(() => useOfflineQueue());
    await waitFor(() => expect(result.current.pending).toBe(2));
    expect(result.current.online).toBe(false);
    expect(submit).not.toHaveBeenCalled();

    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(submit.mock.calls.map(([, body]) => body.answer?.questionId)).toEqual(['land', 'tax']);
  });
});
