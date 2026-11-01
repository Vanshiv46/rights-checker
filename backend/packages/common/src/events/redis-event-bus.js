import { z } from 'zod';
import { runWithRequestId } from '../context.js';
import { domainEventSchema } from '../contracts/events.js';

const STREAM_PREFIX = 'rec:events:';
const MAX_STREAM_LENGTH = '10000';
const DEDUP_TTL_SECONDS = 7 * 24 * 3600;

const streamReplySchema = z
  .array(z.tuple([z.string(), z.array(z.tuple([z.string(), z.array(z.string())]))]))
  .nullable();

export const streamKey = (type) => `${STREAM_PREFIX}${type}`;

function fieldValue(fields, name) {
  const index = fields.indexOf(name);
  return index >= 0 ? fields[index + 1] : undefined;
}

/** Redis Streams event bus with consumer groups, ack-after-handle and event-id dedup. */
export function createRedisEventBus(options) {
  const { redis, subscriber, group, consumer, logger } = options;
  const handlers = new Map();
  let running = false;
  const isRunning = () => running;

  const ensureGroup = async (key) => {
    try {
      await redis.xgroup('CREATE', key, group, '0', 'MKSTREAM');
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('BUSYGROUP'))) throw err;
    }
  };

  const dedupKey = (eventId) => `rec:processed:${group}:${eventId}`;

  const handleEntry = async (key, entryId, fields) => {
    const parsed = domainEventSchema.safeParse(JSON.parse(fieldValue(fields, 'event') ?? 'null'));
    if (!parsed.success) {
      logger.error({ stream: key, entryId }, 'dropping invalid event');
      await redis.xack(key, group, entryId);
      return;
    }
    const event = parsed.data;
    const handler = handlers.get(event.type);
    const alreadyDone = (await redis.exists(dedupKey(event.id))) === 1;
    if (handler && !alreadyDone) {
      await runWithRequestId(event.requestId ?? event.id, () => handler(event));
      await redis.set(dedupKey(event.id), '1', 'EX', DEDUP_TTL_SECONDS);
    }
    await redis.xack(key, group, entryId);
  };

  const readBatch = async (cursor) => {
    const keys = [...handlers.keys()].map(streamKey);
    const reply = await subscriber.call(
      'XREADGROUP',
      'GROUP',
      group,
      consumer,
      'COUNT',
      '20',
      'BLOCK',
      String(options.blockMs ?? 5000),
      'STREAMS',
      ...keys,
      ...keys.map(() => cursor),
    );
    for (const [key, entries] of streamReplySchema.parse(reply) ?? []) {
      for (const [entryId, fields] of entries) {
        try {
          await handleEntry(key, entryId, fields);
        } catch (err) {
          logger.error({ err, stream: key, entryId }, 'event handler failed; will retry');
        }
      }
    }
  };

  const loop = async () => {
    await readBatch('0');
    while (running) {
      try {
        await readBatch('>');
      } catch (err) {
        if (isRunning()) logger.error({ err }, 'event read failed');
      }
    }
  };

  return {
    async publish(event) {
      const valid = domainEventSchema.parse(event);
      await redis.xadd(
        streamKey(valid.type),
        'MAXLEN',
        '~',
        MAX_STREAM_LENGTH,
        '*',
        'event',
        JSON.stringify(valid),
      );
    },
    subscribe(type, handler) {
      handlers.set(type, handler);
    },
    async start() {
      if (handlers.size === 0 || running) return;
      for (const type of handlers.keys()) await ensureGroup(streamKey(type));
      running = true;
      void loop();
    },
    async close() {
      running = false;
      subscriber.disconnect();
      await Promise.resolve();
    },
  };
}
