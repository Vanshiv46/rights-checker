import { domainEventSchema } from '../contracts/events.js';

/** In-process event bus with the same validation rules; used in tests. */
export function createMemoryEventBus() {
  const handlers = new Map();
  const published = [];

  const deliver = async (event) => {
    const valid = domainEventSchema.parse(event);
    for (const handler of handlers.get(valid.type) ?? []) {
      await handler(valid);
    }
  };

  return {
    published,
    deliver,
    async publish(event) {
      published.push(domainEventSchema.parse(event));
      await deliver(event);
    },
    subscribe(type, handler) {
      const list = handlers.get(type) ?? [];
      list.push(handler);
      handlers.set(type, list);
    },
    start() {
      return Promise.resolve();
    },
    close() {
      handlers.clear();
      return Promise.resolve();
    },
  };
}
