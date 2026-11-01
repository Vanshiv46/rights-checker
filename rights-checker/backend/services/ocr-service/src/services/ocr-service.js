import { randomUUID } from 'node:crypto';
import { Errors } from '@rec/common';

/**
 * Background job port (BullMQ in production). Job data never contains the image.
 * @typedef {{ status: 'queued' | 'active' | 'completed' | 'failed', field: string,
 *   reading: { value: unknown, confidence: number } | null }} JobState
 * @typedef {object} OcrJobQueue
 * @property {(jobId: string, field: string) => Promise<void>} enqueue
 * @property {(jobId: string) => Promise<JobState | null>} getState
 */

/**
 * Async OCR of a single field. Images live only in this process's memory and are dropped as soon
 * as the job runs; nothing is written to disk, Redis or a database.
 */
export class OcrService {
  images = new Map();

  constructor(engine, queue) {
    this.engine = engine;
    this.queue = queue;
  }

  /** Accepts an image and queues a job for one field; returns immediately (202). */
  async createJob(body) {
    const jobId = randomUUID();
    this.images.set(jobId, Buffer.from(body.imageBase64, 'base64'));
    try {
      await this.queue.enqueue(jobId, body.field);
    } catch {
      this.images.delete(jobId);
      throw Errors.unavailable('ocr job queue');
    }
    return { jobId, status: 'queued', result: null };
  }

  /** Worker step: reads the field and forgets the image whatever happens. */
  async process(jobId, field) {
    const image = this.images.get(jobId);
    this.images.delete(jobId);
    if (!image) return { value: null, confidence: 0 };
    return this.engine.readField(image, field);
  }

  /** Current job status and, when done, the proposed value (the citizen must confirm it). */
  async getJob(jobId) {
    const state = await this.queue.getState(jobId);
    if (!state) throw Errors.notFound('OCR job');
    return {
      jobId,
      status: state.status,
      result: state.reading ? { field: state.field, ...state.reading } : null,
    };
  }

  /** Images currently held in memory. */
  pendingImages() {
    return this.images.size;
  }
}
