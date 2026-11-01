import { factScope } from '@rec/common';

/**
 * Three-valued truth: true, false, or null when a needed fact is unknown.
 * @typedef {boolean | null} Tri
 * @typedef {{ value: Tri, missing: { key: string, memberId: string | null }[] }} ConditionOutcome
 */

function compare(actual, op, expected) {
  if (op === 'in') return Array.isArray(expected) && expected.includes(actual);
  if (Array.isArray(expected)) return false;
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    default:
      return typeof actual === 'number' && typeof expected === 'number'
        ? compareNumbers(actual, op, expected)
        : false;
  }
}

function compareNumbers(a, op, b) {
  if (op === 'gt') return a > b;
  if (op === 'gte') return a >= b;
  if (op === 'lt') return a < b;
  return a <= b;
}

function lookup(leaf, ctx) {
  if (factScope(leaf.fact) === 'household') return ctx.facts.household[leaf.fact];
  return ctx.member?.facts[leaf.fact];
}

/** Every leaf condition inside a condition tree. */
export function collectLeaves(condition) {
  if ('fact' in condition) return [condition];
  if ('all' in condition) return condition.all.flatMap(collectLeaves);
  if ('any' in condition) return condition.any.flatMap(collectLeaves);
  if ('not' in condition) return collectLeaves(condition.not);
  return collectLeaves(condition.anyMember);
}

function evaluateLeaf(leaf, ctx) {
  const actual = lookup(leaf, ctx);
  if (actual === undefined) {
    const memberId = factScope(leaf.fact) === 'member' ? (ctx.member?.id ?? null) : null;
    return { value: null, missing: [{ key: leaf.fact, memberId }] };
  }
  return { value: compare(actual, leaf.op, leaf.value), missing: [] };
}

/** Kleene AND/OR over child outcomes. `dominant` is false for AND, true for OR. */
function combine(outcomes, dominant) {
  if (outcomes.some((o) => o.value === dominant)) return { value: dominant, missing: [] };
  const unknown = outcomes.filter((o) => o.value === null);
  if (unknown.length === 0) return { value: !dominant, missing: [] };
  return { value: null, missing: unknown.flatMap((o) => o.missing) };
}

function evaluateAnyMember(inner, ctx) {
  if (ctx.facts.members.length === 0) {
    const missing = collectLeaves(inner)
      .filter((leaf) => factScope(leaf.fact) === 'member')
      .map((leaf) => ({ key: leaf.fact, memberId: null }));
    return { value: null, missing };
  }
  return combine(
    ctx.facts.members.map((member) => evaluateCondition(inner, { ...ctx, member })),
    true,
  );
}

/** Evaluates one condition tree with three-valued logic. Pure: no I/O, no clock. */
export function evaluateCondition(condition, ctx) {
  if ('fact' in condition) return evaluateLeaf(condition, ctx);
  if ('all' in condition)
    return combine(
      condition.all.map((c) => evaluateCondition(c, ctx)),
      false,
    );
  if ('any' in condition)
    return combine(
      condition.any.map((c) => evaluateCondition(c, ctx)),
      true,
    );
  if ('not' in condition) {
    const inner = evaluateCondition(condition.not, ctx);
    return { value: inner.value === null ? null : !inner.value, missing: inner.missing };
  }
  return evaluateAnyMember(condition.anyMember, ctx);
}

/** Removes duplicate (key, memberId) pairs, keeping first-seen order. */
export function dedupeMissing(facts) {
  const seen = new Set();
  return facts.filter((f) => {
    const id = `${f.key}|${f.memberId ?? ''}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const REQUIREMENT_OUTCOME = { true: 'met', false: 'not_met', null: 'unknown' };
const EXCLUSION_OUTCOME = { true: 'applies', false: 'does_not_apply', null: 'unknown' };

function triKey(value) {
  return value === null ? 'null' : value ? 'true' : 'false';
}

function toReason(item, kind) {
  const table = kind === 'requirement' ? REQUIREMENT_OUTCOME : EXCLUSION_OUTCOME;
  return {
    clauseId: item.clause.id,
    kind,
    outcome: table[triKey(item.outcome.value)],
    description: item.clause.description,
  };
}

function decideVerdict(requirements, exclusions, superseded) {
  if (superseded === true) return 'NOT_ELIGIBLE';
  if (requirements.some((r) => r.outcome.value === false)) return 'NOT_ELIGIBLE';
  if (exclusions.some((e) => e.outcome.value === true)) return 'NOT_ELIGIBLE';
  if (requirements.some((r) => r.outcome.value === null)) return 'NEEDS_VERIFICATION';
  return 'LIKELY';
}

function checksLeftFor(exclusions, superseded) {
  const unknown = exclusions
    .filter((e) => e.outcome.value === null)
    .map((e) => ({
      clauseId: e.clause.id,
      description: e.clause.description,
      missingFacts: dedupeMissing(e.outcome.missing),
    }));
  return superseded ? [...unknown, superseded] : unknown;
}

/**
 * Pure, deterministic eligibility evaluation of one published rule version.
 * NOT_ELIGIBLE: a requirement is false, an exclusion is true, or the scheme is superseded.
 * NEEDS_VERIFICATION: no exclusion applies but a requirement is unknown.
 * LIKELY: all requirements true and no exclusion true (unknown exclusions become checksLeft).
 * There is deliberately no ELIGIBLE verdict: final eligibility is the department's decision.
 */
export function evaluate(rule, facts) {
  const ctx = { facts, member: null };
  const run = (clause) => ({
    clause,
    outcome: evaluateCondition(clause.condition, ctx),
  });
  const requirements = rule.rule.requirements.map(run);
  const exclusions = rule.rule.exclusions.map(run);
  const sup = rule.rule.supersededBy;
  const supOutcome = sup ? evaluateCondition(sup.condition, ctx) : null;
  const verdict = decideVerdict(requirements, exclusions, supOutcome?.value ?? false);

  const reasons = [
    ...requirements.map((r) => toReason(r, 'requirement')),
    ...exclusions.map((e) => toReason(e, 'exclusion')),
  ];
  if (sup && supOutcome?.value === true) {
    reasons.push({
      clauseId: `superseded-by.${sup.schemeCode}`,
      kind: 'superseded',
      outcome: 'applies',
      description: sup.description,
    });
  }
  const supCheck =
    sup && supOutcome?.value === null
      ? {
          clauseId: `superseded-by.${sup.schemeCode}`,
          description: sup.description,
          missingFacts: dedupeMissing(supOutcome.missing),
        }
      : null;

  return {
    schemeCode: rule.schemeCode,
    schemeName: rule.schemeName,
    verdict,
    reasons,
    checksLeft: verdict === 'NOT_ELIGIBLE' ? [] : checksLeftFor(exclusions, supCheck),
    missingFacts:
      verdict === 'NEEDS_VERIFICATION'
        ? dedupeMissing(
            requirements.flatMap((r) => (r.outcome.value === null ? r.outcome.missing : [])),
          )
        : [],
    firedRules: [...requirements, ...exclusions]
      .filter((c) => c.outcome.value === true)
      .map((c) => c.clause.id),
    benefits:
      verdict === 'NOT_ELIGIBLE'
        ? []
        : rule.rule.benefits
            .filter((b) => evaluateCondition(b.condition, ctx).value === true)
            .map((b) => b.description),
    supersededBy: supOutcome?.value === true && sup ? sup.schemeCode : null,
    checklist: rule.checklist,
    source: rule.rule.source,
    ruleVersion: { id: rule.versionId, version: rule.version },
    verifiedOn: rule.verifiedOn,
  };
}
