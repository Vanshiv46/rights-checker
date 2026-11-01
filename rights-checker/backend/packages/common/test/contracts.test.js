import { describe, expect, it, vi } from 'vitest';
import {
  answersBodySchema,
  buildEvent,
  conditionSchema,
  createLogger,
  createMemoryEventBus,
  domainEventSchema,
  isFactKey,
  isValidFactValue,
  loadEnv,
  questionFor,
  factScope,
  runWithRequestId,
  baseEnvShape,
} from '../src/index.js';
import { z } from 'zod';

const sessionId = '0b5c3e0e-8a3f-4d7e-9c5a-2f4c1d6e7a80';

describe('fact catalogue', () => {
  it('knows keys, scopes, value types and questions', () => {
    expect(isFactKey('member.age')).toBe(true);
    expect(isFactKey('member.name')).toBe(false);
    expect(factScope('household.bpl_status')).toBe('household');
    expect(isValidFactValue('member.age', 64)).toBe(true);
    expect(isValidFactValue('member.age', 'sixty')).toBe(false);
    expect(isValidFactValue('member.pension_category', 'GROUP_D')).toBe(true);
    expect(questionFor('member.age', 'hi')).toContain('उम्र');
    expect(questionFor('member.age', 'ta')).toBe('How old is this person?');
  });
});

describe('rule condition schema', () => {
  it('accepts nested conditions and rejects unknown facts', () => {
    const nested = {
      anyMember: {
        all: [
          { fact: 'member.monthly_pension', op: 'gte', value: 10000 },
          { not: { fact: 'member.pension_category', op: 'in', value: ['MTS'] } },
        ],
      },
    };
    expect(conditionSchema.safeParse(nested).success).toBe(true);
    expect(conditionSchema.safeParse({ fact: 'member.name', op: 'eq', value: 'x' }).success).toBe(
      false,
    );
    expect(conditionSchema.safeParse({ any: [] }).success).toBe(false);
  });
});

describe('answers body', () => {
  it('requires something to save and forbids memberId with memberRef', () => {
    expect(answersBodySchema.safeParse({ answers: [] }).success).toBe(false);
    const both = {
      answers: [{ key: 'member.age', value: 1, memberRef: 'a', memberId: sessionId }],
    };
    expect(answersBodySchema.safeParse(both).success).toBe(false);
  });
});

describe('events', () => {
  it('builds and validates events', () => {
    const event = buildEvent('session.deleted', { sessionId, reason: 'user_request' }, 'req-1');
    expect(domainEventSchema.parse(event)).toEqual(event);
    expect(() => buildEvent('session.deleted', { sessionId: 'nope', reason: 'expired' })).toThrow();
  });

  it('memory bus validates, delivers and supports replay', async () => {
    const bus = createMemoryEventBus();
    const seen = vi.fn(async () => undefined);
    bus.subscribe('session.deleted', seen);
    await bus.start();
    const event = buildEvent('session.deleted', { sessionId, reason: 'expired' });
    await bus.publish(event);
    await bus.deliver(event);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(bus.published).toHaveLength(1);
    await bus.close();
    await bus.publish(buildEvent('session.deleted', { sessionId, reason: 'expired' }));
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe('loadEnv', () => {
  const schema = z.object(baseEnvShape);
  it('parses and coerces valid config', () => {
    const env = loadEnv(schema, { PORT: '4000', SERVICE_TOKEN: 'x'.repeat(16) });
    expect(env.PORT).toBe(4000);
    expect(env.LOG_LEVEL).toBe('info');
  });
  it('fails fast listing every problem', () => {
    expect(() => loadEnv(schema, { PORT: 'abc', SERVICE_TOKEN: 'short' })).toThrow(
      /PORT.*SERVICE_TOKEN/,
    );
  });
});

describe('logger', () => {
  it('adds the current request id and redacts secrets', () => {
    const lines = [];
    const logger = createLogger('svc', 'info', { write: (line) => lines.push(line) });
    runWithRequestId('req-xyz12345', () => {
      logger.info({ user: { password: 'secret' } }, 'hello');
    });
    expect(lines[0]).toContain('req-xyz12345');
    expect(lines[0]).not.toContain('secret');
  });
});

describe('household form definition', () => {
  it('uses only catalogue facts and valid option values', async () => {
    const { FORM_FIELDS, buildFormDefinition, OCCUPATIONS } = await import('../src/index.js');
    const form = buildFormDefinition();
    expect(form.occupations.map((o) => o.value)).toEqual(OCCUPATIONS);
    const facts = new Set();
    const walk = (c) => {
      if (!c) return;
      if (c.fact) facts.add(c.fact);
      for (const k of ['all', 'any']) c[k]?.forEach(walk);
      if (c.not) walk(c.not);
      if (c.anyMember) walk(c.anyMember);
    };
    for (const f of FORM_FIELDS) {
      expect(isFactKey(f.fact)).toBe(true);
      walk(f.showIf);
      for (const o of f.options ?? []) expect(isValidFactValue(f.fact, o.value)).toBe(true);
    }
    for (const fact of facts) expect(isFactKey(fact)).toBe(true);
  });
});
