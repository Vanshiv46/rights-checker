import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { db } from '../../lib/db';
import { flushQueue } from './offlineQueue';
import { useOnline } from './useOnline';

/** Reports how many answers are waiting and sends them whenever the connection is back. */
export function useOfflineQueue() {
  const online = useOnline();
  const pending = useLiveQuery(() => db.queue.count(), [], 0);

  useEffect(() => {
    if (online) void flushQueue();
  }, [online]);

  return { online, pending };
}
