import { Queue, Worker } from 'bullmq';

const QUEUE = 'session-expiry';

/** Repeating BullMQ job that erases expired sessions (and emits session.deleted for each). */
export async function startExpiryJob(connection, sessions, everyMs, logger) {
  const queue = new Queue(QUEUE, { connection });
  await queue.upsertJobScheduler('expire-sessions', { every: everyMs }, { name: 'expire' });
  const worker = new Worker(
    QUEUE,
    async () => {
      await sessions.expireSessions(new Date());
    },
    { connection, concurrency: 1 },
  );
  worker.on('failed', (_job, err) => {
    logger.error({ err }, 'session expiry job failed');
  });
  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
