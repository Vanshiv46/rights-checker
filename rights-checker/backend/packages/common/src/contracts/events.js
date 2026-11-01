import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { verdictSchema } from './api.js';

const baseEvent = {
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  requestId: z.string().max(128).optional(),
};

export const rulePublishedEventSchema = z.object({
  ...baseEvent,
  type: z.literal('rule.published'),
  payload: z.object({
    schemeCode: z.string(),
    versionId: z.uuid(),
    version: z.number().int().positive(),
  }),
});

export const sessionDeletedEventSchema = z.object({
  ...baseEvent,
  type: z.literal('session.deleted'),
  payload: z.object({ sessionId: z.uuid(), reason: z.enum(['user_request', 'expired']) }),
});

export const evaluationCreatedEventSchema = z.object({
  ...baseEvent,
  type: z.literal('evaluation.created'),
  payload: z.object({
    sessionId: z.uuid(),
    evaluationIds: z.array(z.uuid()),
    verdicts: z.record(z.string(), verdictSchema),
  }),
});

export const domainEventSchema = z.discriminatedUnion('type', [
  rulePublishedEventSchema,
  sessionDeletedEventSchema,
  evaluationCreatedEventSchema,
]);

export const EVENT_TYPES = ['rule.published', 'session.deleted', 'evaluation.created'];

/** Builds a validated event envelope with a fresh id and timestamp. */
export function buildEvent(type, payload, requestId) {
  const candidate = {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    type,
    payload,
    ...(requestId ? { requestId } : {}),
  };
  return domainEventSchema.parse(candidate);
}
