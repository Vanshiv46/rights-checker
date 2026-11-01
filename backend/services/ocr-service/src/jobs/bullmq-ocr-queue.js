import { Queue, Worker } from 'bullmq';
import { ocrFieldSchema } from '@rec/common';

import { z } from 'zod';

const QUEUE = 'ocr';
const jobDataSchema = z.object({ field: ocrFieldSchema });
const readingSchema = z.object({
  value: z.union([z.boolean(), z.number(), z.string()]).nullable(),
  confidence: z.number(),
});

function toStatus(state) {
  if (state === 'active') return 'active';
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  return 'queued';
}

/**
 * BullMQ-backed queue. Job data holds only the field name; the image stays in process memory,
 * so the worker runs in this same process.
 */
export function createBullmqOcrQueue(connection, processor, logger) {
  const queue = new Queue(QUEUE, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 3600 },
      attempts: 1,
    },
  });
  const worker = new Worker(
    QUEUE,
    async (job) => {
      const { field } = jobDataSchema.parse(job.data);
      return processor(job.id ?? '', field);
    },
    { connection, concurrency: 2 },
  );
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'ocr job failed');
  });

  return {
    async enqueue(jobId, field) {
      await queue.add('read-field', { field }, { jobId });
    },
    async getState(jobId) {
      const job = await queue.getJob(jobId);
      if (!job) return null;
      const { field } = jobDataSchema.parse(job.data);
      const status = toStatus(await job.getState());
      const reading = status === 'completed' ? readingSchema.parse(job.returnvalue) : null;
      return { status, field, reading };
    },
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
