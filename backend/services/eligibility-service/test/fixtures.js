import { readFileSync } from 'node:fs';
import { publishedRuleSchema } from '@rec/common';

/** Rules exactly as scheme-service seeds them, so golden tests cover the real seed data. */
export function seededRules() {
  const seed = JSON.parse(
    readFileSync(new URL('../../scheme-service/seed-data/schemes.json', import.meta.url), 'utf8'),
  );
  const rules = {};
  for (const s of seed.schemes) {
    for (const v of s.versions) {
      rules[s.code] = publishedRuleSchema.parse({
        schemeCode: s.code,
        schemeName: s.name,
        versionId: v.id,
        version: v.version,
        rule: v.rule,
        checklist: v.checklist,
        verifiedOn: v.verifiedOn,
      });
    }
  }
  return rules;
}

export const SESSION_ID = '0b5c3e0e-8a3f-4d7e-9c5a-2f4c1d6e7a80';
export const MEMBER_A = '1a2b3c4d-1111-4aaa-8aaa-000000000001';
export const MEMBER_B = '1a2b3c4d-2222-4bbb-8bbb-000000000002';

export function household(householdFacts, members = []) {
  const ids = [MEMBER_A, MEMBER_B];
  return {
    sessionId: SESSION_ID,
    language: 'en',
    household: householdFacts,
    members: members.map((facts, i) => ({
      id: ids[i],
      relation: i === 0 ? 'self' : 'spouse',
      facts,
    })),
    unconfirmed: [],
  };
}
