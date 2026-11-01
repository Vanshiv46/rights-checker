import { factScope, questionFor } from '@rec/common';
import { collectLeaves, dedupeMissing, evaluate } from './evaluate.js';

/** Id used for a hypothetical member when the household has no members yet. */
const HYPOTHETICAL_MEMBER_ID = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

function ruleConditions(rule) {
  const { requirements, exclusions, supersededBy } = rule.rule;
  return [
    ...requirements.map((c) => c.condition),
    ...exclusions.map((c) => c.condition),
    ...(supersededBy ? [supersededBy.condition] : []),
  ];
}

/** Values worth trying for a fact: booleans, thresholds +/- 1, and listed enum values. */
export function candidateValues(key, rules) {
  const values = new Set();
  const leaves = rules.flatMap(ruleConditions).flatMap(collectLeaves);
  for (const leaf of leaves.filter((l) => l.fact === key)) {
    for (const v of Array.isArray(leaf.value) ? leaf.value : [leaf.value]) {
      if (typeof v === 'boolean') {
        values.add(true).add(false);
      } else if (typeof v === 'number') {
        values
          .add(Math.max(0, v - 1))
          .add(v)
          .add(v + 1);
      } else {
        values.add(v).add('OTHER');
      }
    }
  }
  return [...values];
}

/** Returns a copy of `facts` with one hypothetical answer applied. */
export function withAnswer(facts, target, value) {
  if (factScope(target.key) === 'household') {
    return { ...facts, household: { ...facts.household, [target.key]: value } };
  }
  if (target.memberId === null) {
    const member = {
      id: HYPOTHETICAL_MEMBER_ID,
      relation: 'other',
      facts: { [target.key]: value },
    };
    return { ...facts, members: [...facts.members, member] };
  }
  return {
    ...facts,
    members: facts.members.map((m) =>
      m.id === target.memberId ? { ...m, facts: { ...m.facts, [target.key]: value } } : m,
    ),
  };
}

/** True when `after` is more decided than `before`: a verdict settles or a check disappears. */
function settles(before, after) {
  if (before.verdict === 'NEEDS_VERIFICATION') return after.verdict !== 'NEEDS_VERIFICATION';
  return after.verdict !== before.verdict || after.checksLeft.length < before.checksLeft.length;
}

function openFacts(results) {
  return dedupeMissing(
    results.flatMap((r) => [...r.missingFacts, ...r.checksLeft.flatMap((c) => c.missingFacts)]),
  );
}

/**
 * Ranks unknown facts by how many scheme verdicts (or open checks) a single answer could settle.
 * Pure: re-runs the rules engine with hypothetical answers; never stores anything.
 */
export function planQuestions(rules, facts, language, limit = 5) {
  const baseline = rules.map((rule) => ({ rule, before: evaluate(rule, facts) }));
  const ranked = openFacts(baseline.map((b) => b.before)).map((target) => {
    const values = candidateValues(target.key, rules);
    const settled = baseline
      .filter(({ rule, before }) =>
        values.some((v) => settles(before, evaluate(rule, withAnswer(facts, target, v)))),
      )
      .map(({ rule }) => rule.schemeCode);
    return {
      key: target.key,
      memberId: target.memberId,
      question: questionFor(target.key, language),
      settles: settled.length,
      schemes: settled,
    };
  });
  return ranked.sort((a, b) => b.settles - a.settles || a.key.localeCompare(b.key)).slice(0, limit);
}
