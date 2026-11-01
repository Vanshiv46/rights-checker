import { describe, expect, it } from 'vitest';
import { candidateValues, planQuestions, withAnswer } from '../src/engine/planner.js';
import { household, MEMBER_A, seededRules } from './fixtures.js';

const rules = seededRules();
const published = [rules['PM-KISAN'], rules.IGNOAPS];

describe('candidateValues', () => {
  it('derives booleans, thresholds and enum values from rule conditions', () => {
    expect(candidateValues('household.bpl_status', published)).toEqual([true, false]);
    expect(candidateValues('member.monthly_pension', published)).toEqual([9999, 10000, 10001]);
    expect(candidateValues('member.pension_category', published)).toEqual([
      'MTS',
      'OTHER',
      'CLASS_IV',
      'GROUP_D',
    ]);
    expect(candidateValues('member.age', [rules.IGNWPS])).toEqual([79, 80, 81]);
  });
});

describe('withAnswer', () => {
  it('applies household, member and hypothetical-member answers without mutating input', () => {
    const facts = household({}, [{}]);
    expect(
      withAnswer(facts, { key: 'household.bpl_status', memberId: null }, true).household,
    ).toEqual({
      'household.bpl_status': true,
    });
    expect(
      withAnswer(facts, { key: 'member.age', memberId: MEMBER_A }, 61).members[0].facts,
    ).toEqual({
      'member.age': 61,
    });
    expect(
      withAnswer(household({}), { key: 'member.age', memberId: null }, 61).members,
    ).toHaveLength(1);
    expect(facts.household).toEqual({});
  });
});

describe('planQuestions', () => {
  it('asks about facts that settle verdicts, in Hindi when requested', () => {
    const questions = planQuestions(published, household({}, [{ 'member.age': 65 }]), 'hi');
    const keys = questions.map((q) => q.key);
    expect(keys).toContain('household.owns_cultivable_land');
    expect(keys).toContain('household.bpl_status');
    const bpl = questions.find((q) => q.key === 'household.bpl_status');
    expect(bpl.schemes).toEqual(['IGNOAPS']);
    expect(bpl.settles).toBe(1);
    expect(bpl.question).toContain('BPL');
  });

  it('ranks a fact that settles two schemes above one that settles one', () => {
    const landRule = (code) => ({
      ...rules['PM-KISAN'],
      schemeCode: code,
      rule: {
        ...rules['PM-KISAN'].rule,
        exclusions: [],
        requirements: [
          {
            id: `${code}.land`,
            description: 'Owns land',
            condition: { fact: 'household.owns_cultivable_land', op: 'eq', value: true },
          },
        ],
      },
    });
    const questions = planQuestions(
      [landRule('A'), landRule('B'), rules.IGNOAPS],
      household({}, [{ 'member.age': 70 }]),
      'en',
    );
    expect(questions[0]).toMatchObject({
      key: 'household.owns_cultivable_land',
      settles: 2,
      schemes: ['A', 'B'],
    });
  });

  it('returns nothing once every verdict is settled and respects the limit', () => {
    const done = household(
      { 'household.owns_cultivable_land': false, 'household.bpl_status': false },
      [{ 'member.age': 30 }],
    );
    expect(planQuestions(published, done, 'en')).toEqual([]);
    expect(planQuestions(published, household({}), 'en', 2)).toHaveLength(2);
  });
});
