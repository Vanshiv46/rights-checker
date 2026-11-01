import { createLogger } from '@rec/common';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { MockOcrEngine } from '../src/services/ocr-engine.js';
import { OcrService } from '../src/services/ocr-service.js';

const TOKEN = 'test-service-token-123';
const auth = { 'x-service-token': TOKEN };
const image = (text) => Buffer.from(text).toString('base64');

/** Queue that runs jobs on demand, like a BullMQ worker in the same process. */
class ManualQueue {
  jobs = new Map();
  service;
  fail = false;
  async enqueue(jobId, field) {
    if (this.fail) throw new Error('redis down');
    this.jobs.set(jobId, { status: 'queued', field, reading: null });
  }
  async getState(jobId) {
    return this.jobs.get(jobId) ?? null;
  }
  async runAll() {
    for (const [id, job] of this.jobs) {
      job.reading = await this.service.process(id, job.field);
      job.status = 'completed';
    }
  }
}

function setup() {
  const queue = new ManualQueue();
  const ocr = new OcrService(new MockOcrEngine(), queue);
  queue.service = ocr;
  const logger = createLogger('ocr-service', 'silent');
  const app = createApp({
    logger,
    serviceToken: TOKEN,
    ocr,
    jsonLimit: '2mb',
    readiness: async () => ({ redis: true }),
  });
  return { app, queue, ocr };
}

describe('ocr-service', () => {
  it('queues a job (202), reads one field, and drops the image from memory', async () => {
    const { app, queue, ocr } = setup();
    const created = await request(app)
      .post('/jobs')
      .set(auth)
      .send({ imageBase64: image('Name: X  Age: 67'), field: 'member.age' });
    expect(created.status).toBe(202);
    const jobId = created.body.data.jobId;
    expect(ocr.pendingImages()).toBe(1);
    const pending = await request(app).get(`/jobs/${jobId}`).set(auth);
    expect(pending.body.data).toEqual({ jobId, status: 'queued', result: null });
    await queue.runAll();
    expect(ocr.pendingImages()).toBe(0);
    const done = await request(app).get(`/jobs/${jobId}`).set(auth);
    expect(done.body.data.result).toEqual({ field: 'member.age', value: 67, confidence: 0.4 });
  });

  it('reports "not found" instead of guessing', async () => {
    const { app, queue } = setup();
    const created = await request(app)
      .post('/jobs')
      .set(auth)
      .send({ imageBase64: image('xyz'), field: 'household.bpl_status' });
    const bpl = await request(app)
      .post('/jobs')
      .set(auth)
      .send({ imageBase64: image('BPL card'), field: 'household.bpl_status' });
    const age = await request(app)
      .post('/jobs')
      .set(auth)
      .send({ imageBase64: image('xyz'), field: 'member.age' });
    await queue.runAll();
    const read = async (res) =>
      (await request(app).get(`/jobs/${res.body.data.jobId}`).set(auth)).body.data.result;
    expect(await read(created)).toEqual({
      field: 'household.bpl_status',
      value: null,
      confidence: 0,
    });
    expect(await read(bpl)).toEqual({
      field: 'household.bpl_status',
      value: true,
      confidence: 0.4,
    });
    expect(await read(age)).toEqual({ field: 'member.age', value: null, confidence: 0 });
  });

  it('forgets the image when the queue is unavailable', async () => {
    const { app, queue, ocr } = setup();
    queue.fail = true;
    const res = await request(app)
      .post('/jobs')
      .set(auth)
      .send({ imageBase64: image('Age 50'), field: 'member.age' });
    expect(res.status).toBe(503);
    expect(ocr.pendingImages()).toBe(0);
    expect(await ocr.process('missing', 'member.age')).toEqual({ value: null, confidence: 0 });
  });

  it('validates input and returns 404 for unknown jobs', async () => {
    const { app } = setup();
    expect(
      (
        await request(app)
          .post('/jobs')
          .set(auth)
          .send({ imageBase64: image('x'), field: 'member.name' })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).get('/jobs/11111111-2222-4333-8444-555555555555').set(auth)).status,
    ).toBe(404);
    expect((await request(app).get('/jobs/abc').set(auth)).status).toBe(400);
  });
});
