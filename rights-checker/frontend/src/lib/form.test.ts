import { describe, expect, it } from 'vitest';
import { toFormBody } from './adapters';
import { FALLBACK_FORM, visibleFields, visibleValues } from './form';
import type { FormValues, Member } from './types';

const member = (id: string, age: number, occupation?: Member['occupation']): Member => ({
  id,
  relation: 'self',
  age,
  sex: 'male',
  ...(occupation ? { occupation } : {}),
});
const empty: FormValues = { household: {}, byMember: {} };
const ids = (fields: { id: string }[]) => fields.map((f) => f.id);

describe('dynamic household form', () => {
  it('asks only the always-relevant question before an occupation is chosen', () => {
    const shown = visibleFields(FALLBACK_FORM, [member('a', 30)], empty);
    expect(ids(shown.household)).toEqual(['bpl']);
    expect(ids(shown.byMember.a ?? [])).toEqual([]);
  });

  it('adds land and tax questions for a farmer', () => {
    const shown = visibleFields(FALLBACK_FORM, [member('a', 40, 'farmer')], empty);
    expect(ids(shown.household)).toEqual(['land', 'bpl']);
    expect(ids(shown.byMember.a ?? [])).toEqual(['tax']);
  });

  it('asks a student nothing extra, and a retired person about pension', () => {
    const student = visibleFields(FALLBACK_FORM, [member('s', 19, 'student')], empty);
    expect(ids(student.household)).toEqual(['bpl']);
    expect(ids(student.byMember.s ?? [])).toEqual([]);
    const retired = visibleFields(FALLBACK_FORM, [member('r', 66, 'retired_government')], empty);
    expect(ids(retired.byMember.r ?? [])).toEqual(['tax', 'pension']);
  });

  it('shows the pension category only for a pension of Rs 10,000 or more', () => {
    const low: FormValues = {
      household: {},
      byMember: { r: { 'member.monthly_pension': 9000 } },
    };
    const high: FormValues = {
      household: {},
      byMember: { r: { 'member.monthly_pension': 12000 } },
    };
    const m = [member('r', 66, 'retired_government')];
    expect(ids(visibleFields(FALLBACK_FORM, m, low).byMember.r ?? [])).not.toContain(
      'pension_category',
    );
    expect(ids(visibleFields(FALLBACK_FORM, m, high).byMember.r ?? [])).toContain(
      'pension_category',
    );
  });

  it('drops answers of questions that are hidden again', () => {
    const values: FormValues = {
      household: { 'household.owns_cultivable_land': true, 'household.bpl_status': false },
      byMember: { a: { 'member.paid_income_tax_last_ay': true } },
    };
    const sent = visibleValues(FALLBACK_FORM, [member('a', 20, 'student')], values);
    expect(sent.household).toEqual({ 'household.bpl_status': false });
    expect(sent.byMember.a).toEqual({});
  });

  it('turns the form into one backend request', () => {
    const farmer = member('abc', 40, 'farmer');
    const body = toFormBody(
      {
        members: [farmer],
        household: { 'household.owns_cultivable_land': true },
        byMember: { abc: { 'member.paid_income_tax_last_ay': false } },
      },
      {},
    );
    expect(body.members).toEqual([{ ref: 'abc', relation: 'self' }]);
    expect(body.answers).toEqual([
      { key: 'member.age', value: 40, memberRef: 'abc' },
      { key: 'member.occupation', value: 'farmer', memberRef: 'abc' },
      { key: 'member.paid_income_tax_last_ay', value: false, memberRef: 'abc' },
      { key: 'household.owns_cultivable_land', value: true },
    ]);
    const again = toFormBody({ members: [farmer], household: {}, byMember: {} }, { abc: 'be-1' });
    expect(again.members).toEqual([]);
    expect(again.answers[0]).toEqual({ key: 'member.age', value: 40, memberId: 'be-1' });
  });
});
