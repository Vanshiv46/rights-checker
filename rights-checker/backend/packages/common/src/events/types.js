/**
 * Event bus contract shared by the Redis Streams bus and the in-memory test bus.
 *
 * @typedef {import('../contracts/events.js').DomainEvent} DomainEvent
 * @typedef {DomainEvent['type']} EventType
 * @typedef {(event: DomainEvent) => Promise<void>} EventHandler
 *
 * @typedef {object} EventBus
 *   Publish/subscribe over Redis Streams (or in memory in tests). Handlers must be idempotent.
 * @property {(event: DomainEvent) => Promise<void>} publish Validates and appends an event.
 * @property {(type: EventType, handler: EventHandler) => void} subscribe Registers one handler.
 * @property {() => Promise<void>} start Starts consuming subscribed streams.
 * @property {() => Promise<void>} close Stops consuming and releases connections.
 */

export {};
