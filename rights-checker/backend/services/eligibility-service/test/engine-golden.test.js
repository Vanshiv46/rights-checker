import { describe, expect, it } from 'vitest';
import { evaluate, evaluateCondition } from '../src/engine/evaluate.js';
import { household, MEMBER_A, MEMBER_B, seededRules } from './fixtures.js';

const rules = seededRules();
const pmKisan = rules['PM-KISAN'];
const ignoaps = rules.IGNOAPS;

const nonTaxpayer = { 'member.paid_income_tax_last_ay': false, 'member.monthly_pension': 0 };

describe('PM-KISAN golden cases', () => {
  it('LIKELY: owns land, nobody paid income tax, no large pension', () => {
    const r = evaluate(
      pmKisan,
      household({ 'household.owns_cultivable_land': true }, [nonTaxpayer]),
    );
    expect(r.verdict).toBe('LIKELY');
    expect(r.checksLeft).toEqual([]);
    expect(r.firedRules).toEqual(['pmkisan.land']);
    expect(r.checklist.items.map((i) => i.id)).toEqual(['aadhaar', 'bank_account', 'land_record']);
    expect(r.source).toEqual({
      document: 'PM-KISAN Operational Guidelines',
      section: '2.4',
      url: null,
    });
    expect(r.ruleVersion.version).toBe(1);
    expect(r.verifiedOn).toBe('2026-11-01');
  });

  it('LIKELY with checksLeft when exclusions are still unknown', () => {
    const r = evaluate(pmKisan, household({ 'household.owns_cultivable_land': true }, [{}]));
    expect(r.verdict).toBe('LIKELY');
    expect(r.checksLeft.map((c) => c.clauseId)).toEqual([
      'pmkisan.income_tax',
      'pmkisan.pensioner',
    ]);
    expect(r.checksLeft[0].missingFacts).toEqual([
      { key: 'member.paid_income_tax_last_ay', memberId: MEMBER_A },
    ]);
  });

  it('NOT_ELIGIBLE: no cultivable land', () => {
    const r = evaluate(
      pmKisan,
      household({ 'household.owns_cultivable_land': false }, [nonTaxpayer]),
    );
    expect(r.verdict).toBe('NOT_ELIGIBLE');
    expect(r.reasons[0]).toMatchObject({ clauseId: 'pmkisan.land', outcome: 'not_met' });
    expect(r.checksLeft).toEqual([]);
    expect(r.missingFacts).toEqual([]);
  });

  it('NOT_ELIGIBLE: any member paid income tax', () => {
    const r = evaluate(
      pmKisan,
      household({ 'household.owns_cultivable_land': true }, [
        nonTaxpayer,
        { 'member.paid_income_tax_last_ay': true },
      ]),
    );
    expect(r.verdict).toBe('NOT_ELIGIBLE');
    expect(r.firedRules).toContain('pmkisan.income_tax');
  });

  it('NOT_ELIGIBLE: pension of Rs 10,000+ outside MTS/Class IV/Group D', () => {
    const pensioner = {
      ...nonTaxpayer,
      'member.monthly_pension': 10000,
      'member.pension_category': 'OTHER',
    };
    const r = evaluate(pmKisan, household({ 'household.owns_cultivable_land': true }, [pensioner]));
    expect(r.verdict).toBe('NOT_ELIGIBLE');
    expect(r.reasons.find((x) => x.clauseId === 'pmkisan.pensioner')?.outcome).toBe('applies');
  });

  it('LIKELY: Group D pensioners are not excluded', () => {
    const pensioner = {
      ...nonTaxpayer,
      'member.monthly_pension': 25000,
      'member.pension_category': 'GROUP_D',
    };
    expect(
      evaluate(pmKisan, household({ 'household.owns_cultivable_land': true }, [pensioner])).verdict,
    ).toBe('LIKELY');
  });

  it('LIKELY with a check left when a large pension has no category yet', () => {
    const pensioner = { ...nonTaxpayer, 'member.monthly_pension': 12000 };
    const r = evaluate(pmKisan, household({ 'household.owns_cultivable_land': true }, [pensioner]));
    expect(r.verdict).toBe('LIKELY');
    expect(r.checksLeft[0].missingFacts).toEqual([
      { key: 'member.pension_category', memberId: MEMBER_A },
    ]);
  });

  it('NEEDS_VERIFICATION: land ownership unknown', () => {
    const r = evaluate(pmKisan, household({}, [nonTaxpayer]));
    expect(r.verdict).toBe('NEEDS_VERIFICATION');
    expect(r.missingFacts).toEqual([{ key: 'household.owns_cultivable_land', memberId: null }]);
    expect(r.reasons[0].outcome).toBe('unknown');
  });
});

describe('IGNOAPS golden cases', () => {
  it('LIKELY at 67 in a BPL household, with the Rs 200 benefit and pending state checklist', () => {
    const r = evaluate(
      ignoaps,
      household({ 'household.bpl_status': true }, [{ 'member.age': 67 }]),
    );
    expect(r.verdict).toBe('LIKELY');
    expect(r.benefits).toEqual(['Central assistance of Rs 200 per month (age 60-79).']);
    expect(r.checklist).toEqual({ status: 'PENDING_STATE_VERIFICATION', items: [] });
  });

  it('LIKELY at 82 with the Rs 500 benefit', () => {
    const r = evaluate(
      ignoaps,
      household({ 'household.bpl_status': true }, [{ 'member.age': 30 }, { 'member.age': 82 }]),
    );
    expect(r.verdict).toBe('LIKELY');
    expect(r.benefits).toEqual(['Central assistance of Rs 500 per month (age 80 and above).']);
  });

  it('NOT_ELIGIBLE: household is not BPL', () => {
    const r = evaluate(
      ignoaps,
      household({ 'household.bpl_status': false }, [{ 'member.age': 70 }]),
    );
    expect(r.verdict).toBe('NOT_ELIGIBLE');
    expect(r.benefits).toEqual([]);
  });

  it('NOT_ELIGIBLE: everyone is under 60', () => {
    const r = evaluate(
      ignoaps,
      household({ 'household.bpl_status': true }, [{ 'member.age': 59 }, { 'member.age': 30 }]),
    );
    expect(r.verdict).toBe('NOT_ELIGIBLE');
  });

  it('NEEDS_VERIFICATION: no members recorded yet', () => {
    const r = evaluate(ignoaps, household({ 'household.bpl_status': true }));
    expect(r.verdict).toBe('NEEDS_VERIFICATION');
    expect(r.missingFacts).toEqual([{ key: 'member.age', memberId: null }]);
  });

  it('NEEDS_VERIFICATION: one age unknown, BPL unknown', () => {
    const r = evaluate(ignoaps, household({}, [{ 'member.age': 40 }, {}]));
    expect(r.verdict).toBe('NEEDS_VERIFICATION');
    expect(r.missingFacts).toEqual([
      { key: 'member.age', memberId: MEMBER_B },
      { key: 'household.bpl_status', memberId: null },
    ]);
  });
});

describe('supersededBy (IGNWPS -> IGNOAPS at 80)', () => {
  const widowRule = {
    ...rules.IGNWPS,
    rule: {
      ...rules.IGNWPS.rule,
      requirements: [
        {
          id: 'test.bpl',
          description: 'Test-only requirement',
          condition: { fact: 'household.bpl_status', op: 'eq', value: true },
        },
      ],
    },
  };

  it('is NOT_ELIGIBLE and points to IGNOAPS from age 80', () => {
    const r = evaluate(
      widowRule,
      household({ 'household.bpl_status': true }, [{ 'member.age': 81 }]),
    );
    expect(r.verdict).toBe('NOT_ELIGIBLE');
    expect(r.supersededBy).toBe('IGNOAPS');
    expect(r.reasons.at(-1)).toMatchObject({ kind: 'superseded', outcome: 'applies' });
  });

  it('stays LIKELY below 80 and lists the age check when unknown', () => {
    expect(
      evaluate(widowRule, household({ 'household.bpl_status': true }, [{ 'member.age': 70 }]))
        .supersededBy,
    ).toBeNull();
    const r = evaluate(widowRule, household({ 'household.bpl_status': true }, [{}]));
    expect(r.verdict).toBe('LIKELY');
    expect(r.checksLeft[0].clauseId).toBe('superseded-by.IGNOAPS');
  });
});

describe('three-valued operators', () => {
  const ctx = {
    facts: household({ 'household.bpl_status': true }, [{ 'member.age': 70 }]),
    member: null,
  };
  const m = (condition) => evaluateCondition(condition, ctx).value;

  it('supports ne, gt, lte, in and type mismatches', () => {
    expect(m({ fact: 'household.bpl_status', op: 'ne', value: false })).toBe(true);
    expect(m({ anyMember: { fact: 'member.age', op: 'gt', value: 69 } })).toBe(true);
    expect(m({ anyMember: { fact: 'member.age', op: 'lte', value: 69 } })).toBe(false);
    expect(m({ anyMember: { fact: 'member.age', op: 'in', value: [70, 71] } })).toBe(true);
    expect(m({ anyMember: { fact: 'member.age', op: 'eq', value: [70] } })).toBe(false);
    expect(m({ fact: 'household.bpl_status', op: 'gt', value: 1 })).toBe(false);
  });

  it('applies Kleene logic for any/all/not with unknowns', () => {
    const unknown = { fact: 'household.owns_cultivable_land', op: 'eq', value: true };
    const yes = { fact: 'household.bpl_status', op: 'eq', value: true };
    expect(m({ any: [unknown, yes] })).toBe(true);
    expect(m({ all: [unknown, yes] })).toBeNull();
    expect(m({ all: [unknown, { not: yes }] })).toBe(false);
    expect(m({ not: unknown })).toBeNull();
    expect(m({ any: [{ not: yes }, { not: yes }] })).toBe(false);
  });

  it('treats member facts outside anyMember as unknown', () => {
    expect(evaluateCondition({ fact: 'member.age', op: 'gte', value: 1 }, ctx)).toEqual({
      value: null,
      missing: [{ key: 'member.age', memberId: null }],
    });
  });
});
