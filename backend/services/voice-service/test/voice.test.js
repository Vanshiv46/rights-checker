import { createLogger } from '@rec/common';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createGroqSpeechClient } from '../src/clients/groq-client.js';
import { VoiceService } from '../src/services/voice-service.js';

const TOKEN = 'test-service-token-123';
const auth = { 'x-service-token': TOKEN };
const logger = createLogger('voice-service', 'silent');
const AUDIO = Buffer.from('fake-audio').toString('base64');

const ok = (body) => new Response(JSON.stringify(body), { status: 200 });

function setup(fetchImpl, configured = true) {
  const speech = createGroqSpeechClient({
    apiKey: configured ? 'gsk_test_key_123' : undefined,
    timeoutMs: 1000,
    logger,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const app = createApp({
    logger,
    serviceToken: TOKEN,
    voice: new VoiceService(speech),
    jsonLimit: '1mb',
  });
  return { app, speech };
}

describe('voice-service with Groq Whisper', () => {
  it('transcribes with whisper and a language hint', async () => {
    const fetchImpl = vi.fn(async () => ok({ text: ' मेरी उम्र 67 है ' }));
    const { app } = setup(fetchImpl);
    const res = await request(app)
      .post('/transcribe')
      .set(auth)
      .send({ audioBase64: AUDIO, language: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ text: 'मेरी उम्र 67 है', language: 'hi' });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(init.headers.authorization).toBe('Bearer gsk_test_key_123');
    expect(init.body.get('model')).toBe('whisper-large-v3-turbo');
    expect(init.body.get('language')).toBe('hi');
    expect(init.body.get('file')).toBeInstanceOf(Blob);
  });

  it('lets whisper auto-detect languages it does not list', async () => {
    const fetchImpl = vi.fn(async () => ok({ text: 'ok' }));
    await request(setup(fetchImpl).app)
      .post('/transcribe')
      .set(auth)
      .send({ audioBase64: AUDIO, language: 'or' });
    expect(fetchImpl.mock.calls[0][1].body.has('language')).toBe(false);
  });

  it.each([
    ['no API key', undefined, false],
    ['HTTP error', vi.fn(async () => new Response('{}', { status: 429 })), true],
    ['network error', vi.fn(async () => Promise.reject(new Error('ECONNRESET'))), true],
    ['bad payload', vi.fn(async () => ok({ nope: true })), true],
    ['empty transcript', vi.fn(async () => ok({ text: ' ' })), true],
  ])('returns 503 VOICE_UNAVAILABLE on %s', async (_name, fetchImpl, configured) => {
    const { app, speech } = setup(fetchImpl, configured);
    const res = await request(app)
      .post('/transcribe')
      .set(auth)
      .send({ audioBase64: AUDIO, language: 'en' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('VOICE_UNAVAILABLE');
    speech.shutdown();
  });

  it('never synthesises speech (the browser reads text aloud)', async () => {
    const res = await request(setup(vi.fn()).app)
      .post('/speak')
      .set(auth)
      .send({ text: 'नमस्ते', language: 'hi' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('VOICE_UNAVAILABLE');
  });

  it('validates bodies and the service token', async () => {
    const { app } = setup();
    expect(
      (
        await request(app)
          .post('/transcribe')
          .set(auth)
          .send({ audioBase64: '%%%', language: 'en' })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).post('/speak').set(auth).send({ text: '', language: 'en' })).status,
    ).toBe(400);
    expect((await request(app).post('/speak').send({ text: 'x', language: 'en' })).status).toBe(
      401,
    );
    expect((await request(app).get('/ready')).status).toBe(200);
  });
});
