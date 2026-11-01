import { describe, expect, it } from 'vitest';
import {
  linkMembers,
  parseYesNo,
  toAnswerBody,
  toMembersBody,
  toSchemeDetail,
  toSchemeResult,
  toVerificationItem,
  type BackendResult,
} from './adapters';
import type { Member } from './types';

const me: Member = { id: 'mabc123', relation: 'self', age: 40, sex: 'female' };
const mother: Member = { id: 'mdef456', relation: 'mother', age: 66, sex: 'female' };

describe('household mapping', () => {
  it('creates new members by ref and sends ages; maps relations to the backend set', () => {
    expect(toMembersBody([me, mother], {})).toEqual({
      members: [
        { ref: 'mabc123', relation: 'self' },
        { ref: 'mdef456', relation: 'parent' },
      ],
      answers: [
        { key: 'member.age', memberRef: 'mabc123', value: 40 },
        { key: 'member.age', memberRef: 'mdef456', value: 66 },
      ],
    });
  });

  it('only updates the age of members the backend already knows', () => {
    const body = toMembersBody([me, { ...mother, age: 67 }], { mdef456: 'be-2' });
    expect(body.members).toEqual([{ ref: 'mabc123', relation: 'self' }]);
    expect(body.answers[1]).toEqual({ key: 'member.age', memberId: 'be-2', value: 67 });
  });

  it('links frontend member ids to backend ids by ref', () => {
    const saved = [
      { id: 'be-1', ref: 'mabc123', relation: 'self' as const },
      { id: 'be-2', ref: 'mdef456', relation: 'parent' as const },
    ];
    expect(linkMembers([me, mother], saved, {})).toEqual({ mabc123: 'be-1', mdef456: 'be-2' });
  });
});

describe('answer mapping', () => {
  const links = { mabc123: 'be-1', mdef456: 'be-2' };

  it('maps household questions directly', () => {
    expect(toAnswerBody({ questionId: 'land', value: true }, links)).toEqual({
      answers: [{ key: 'household.owns_cultivable_land', value: true }],
    });
    expect(toAnswerBody({ questionId: 'bpl', value: false }, links)).toEqual({
      answers: [{ key: 'household.bpl_status', value: false }],
    });
  });

  it('writes "no" for every member and "yes" once for "anyone…" questions', () => {
    expect(toAnswerBody({ questionId: 'tax', value: false }, links)?.answers).toEqual([
      { key: 'member.paid_income_tax_last_ay', memberId: 'be-1', value: false },
      { key: 'member.paid_income_tax_last_ay', memberId: 'be-2', value: false },
    ]);
    expect(toAnswerBody({ questionId: 'pension', value: true }, links)?.answers).toEqual([
      { key: 'member.monthly_pension', memberId: 'be-1', value: 10000 },
    ]);
    expect(toAnswerBody({ questionId: 'pension', value: false }, {})).toBeNull();
  });

  it('sends nothing for "I don\'t know" and parses spoken yes/no', () => {
    expect(toAnswerBody({ questionId: 'land', value: null }, links)).toBeNull();
    expect(toAnswerBody({ questionId: 'land', text: 'हाँ जी' }, links)?.answers[0]?.value).toBe(
      true,
    );
    expect(parseYesNo('Nahi.')).toBe(false);
    expect(parseYesNo('maybe')).toBeNull();
  });
});

const backendResult: BackendResult = {
  schemeCode: 'PM-KISAN',
  schemeName: 'PM-KISAN',
  verdict: 'LIKELY',
  reasons: [
    { clauseId: 'pmkisan.land', kind: 'requirement', outcome: 'met', description: 'Owns land.' },
    { clauseId: 'pmkisan.tax', kind: 'exclusion', outcome: 'unknown', description: 'Tax' },
  ],
  checksLeft: [
    {
      clauseId: 'pmkisan.tax',
      description: 'Tax',
      missingFacts: [{ key: 'member.paid_income_tax_last_ay', memberId: 'be-1' }],
    },
  ],
  missingFacts: [],
  benefits: [],
  supersededBy: null,
  checklist: {
    status: 'AVAILABLE',
    items: [
      { id: 'aadhaar', label: 'Aadhaar card' },
      { id: 'other', label: 'Ration card' },
    ],
  },
  source: { document: 'PM-KISAN Operational Guidelines', section: '2.4', url: null },
  ruleVersion: { id: 'v-1', version: 1 },
  verifiedOn: '2026-11-01',
};

describe('result mapping', () => {
  it('turns an engine result into a scheme card result', () => {
    expect(toSchemeResult(backendResult)).toEqual({
      scheme: 'PM-KISAN',
      verdict: 'LIKELY',
      reasons: ['Owns land.'],
      checksLeft: ['any_member.paid_income_tax_last_ay'],
      missingFacts: [],
      checklist: [
        { document: 'Aadhaar', kind: 'mandatory' },
        { document: 'Ration card', kind: 'mandatory' },
      ],
      source: { title: 'PM-KISAN Operational Guidelines', section: '2.4', url: '' },
      ruleVersion: 'pm-kisan@v1',
      verifiedOn: '2026-11-01',
    });
  });

  it('marks state-dependent checklists as pending', () => {
    const pending = toSchemeResult({
      ...backendResult,
      verdict: 'NEEDS_VERIFICATION',
      checklist: { status: 'PENDING_STATE_VERIFICATION', items: [] },
      missingFacts: [{ key: 'household.bpl_status', memberId: null }],
      verifiedOn: null,
    });
    expect(pending.checklist).toBeNull();
    expect(pending.checklistStatus).toBe('PENDING_STATE_VERIFICATION');
    expect(pending.missingFacts).toEqual(['household.bpl_status']);
    expect(pending.verifiedOn).toBeUndefined();
  });

  it('maps scheme details and the verification queue', () => {
    const detail = toSchemeDetail({
      code: 'IGNOAPS',
      name: 'IGNOAPS',
      description: 'd',
      publishedVersion: { id: 'x', version: 1, verifiedOn: '2026-11-01' },
      rule: {
        benefits: [{ description: 'Rs 200.' }, { description: 'Rs 500.' }],
        source: { url: null },
      },
    });
    expect(detail).toMatchObject({
      status: 'published',
      currentVersion: 'ignoaps@v1',
      benefit: 'Rs 200. Rs 500.',
    });
    expect(
      toVerificationItem({
        id: 'x',
        schemeCode: 'PMMVY',
        version: 1,
        status: 'draft',
        verifiedOn: null,
        verifiedBy: null,
        notes: 'TODO',
      }),
    ).toEqual({ scheme: 'PMMVY', version: 'pmmvy@v1', verifiedOn: '', reason: 'TODO' });
  });
});
