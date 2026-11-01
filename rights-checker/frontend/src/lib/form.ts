import type {
  FormCondition,
  FormDefinition,
  FormField,
  FormValue,
  FormValues,
  Member,
} from './types';

type Facts = Record<string, FormValue | undefined>;

function compare(op: string, actual: FormValue | undefined, expected: FormValue | FormValue[]) {
  if (actual === undefined) return false;
  if (op === 'in') return Array.isArray(expected) && expected.includes(actual);
  if (Array.isArray(expected)) return false;
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    case 'gt':
      return actual > expected;
    case 'gte':
      return actual >= expected;
    case 'lt':
      return actual < expected;
    default:
      return actual <= expected;
  }
}

/** Evaluates a `showIf` condition. A fact that is not known yet makes a comparison false. */
export function holds(cond: FormCondition, facts: Facts, everyone: Facts[]): boolean {
  if ('all' in cond) return cond.all.every((c) => holds(c, facts, everyone));
  if ('any' in cond) return cond.any.some((c) => holds(c, facts, everyone));
  if ('not' in cond) return !holds(cond.not, facts, everyone);
  if ('anyMember' in cond) return everyone.some((m) => holds(cond.anyMember, m, everyone));
  return compare(cond.op, facts[cond.fact], cond.value);
}

/** The facts known about one member: age, occupation and the member's own form answers. */
export function memberFacts(
  def: FormDefinition,
  member: Member,
  values: FormValues,
): Record<string, FormValue | undefined> {
  const facts: Record<string, FormValue | undefined> = {
    'member.age': Number.isFinite(member.age) ? member.age : undefined,
    'member.occupation': member.occupation,
  };
  const answers = values.byMember[member.id] ?? {};
  for (const f of def.fields) {
    if (f.scope === 'member' && answers[f.fact] !== undefined) facts[f.fact] = answers[f.fact];
  }
  return facts;
}

/**
 * Questions to show now. Member fields are checked one member at a time; a field that is hidden
 * is also dropped from what gets sent, so a changed occupation never leaves stale answers behind.
 */
export function visibleFields(
  def: FormDefinition,
  members: Member[],
  values: FormValues,
): { household: FormField[]; byMember: Record<string, FormField[]> } {
  const everyone = members.map((m) => memberFacts(def, m, values));
  const shown = (f: FormField, facts: Facts) => !f.showIf || holds(f.showIf, facts, everyone);
  const byMember: Record<string, FormField[]> = {};
  members.forEach((m, i) => {
    const facts = everyone[i] ?? {};
    byMember[m.id] = def.fields.filter((f) => f.scope === 'member' && shown(f, facts));
  });
  return {
    household: def.fields.filter((f) => f.scope === 'household' && shown(f, {})),
    byMember,
  };
}

/** The answers worth sending: only for questions currently shown and actually answered. */
export function visibleValues(
  def: FormDefinition,
  members: Member[],
  values: FormValues,
): FormValues {
  const shown = visibleFields(def, members, values);
  const household: FormValues['household'] = {};
  for (const f of shown.household) {
    const v = values.household[f.fact];
    if (v !== undefined) household[f.fact] = v;
  }
  const byMember: FormValues['byMember'] = {};
  for (const m of members) {
    const answers: Record<string, FormValue> = {};
    for (const f of shown.byMember[m.id] ?? []) {
      const v = values.byMember[m.id]?.[f.fact];
      if (v !== undefined) answers[f.fact] = v;
    }
    byMember[m.id] = answers;
  }
  return { household, byMember };
}

const occupationIn = (value: string[]): FormCondition => ({
  fact: 'member.occupation',
  op: 'in',
  value,
});
const EARNING = [
  'farmer',
  'agri_labourer',
  'daily_wage',
  'salaried_private',
  'government_employee',
  'self_employed',
  'retired_government',
];
const LAND = [
  'farmer',
  'agri_labourer',
  'self_employed',
  'homemaker',
  'retired_government',
  'unemployed',
  'other',
];

/**
 * Same questions as the backend's GET /v1/form. Used by the mock API and while the real form has
 * not loaded (or the device is offline); the server's version replaces it as soon as it arrives.
 */
export const FALLBACK_FORM: FormDefinition = {
  occupations: [
    ['farmer', 'Farmer (own or leased land)', 'किसान (अपनी या पट्टे की ज़मीन)'],
    ['agri_labourer', 'Agricultural labourer', 'खेतिहर मज़दूर'],
    ['daily_wage', 'Daily-wage / casual worker', 'दिहाड़ी / अस्थायी मज़दूर'],
    ['salaried_private', 'Salaried (private job)', 'निजी नौकरी'],
    ['government_employee', 'Government employee', 'सरकारी कर्मचारी'],
    ['retired_government', 'Retired government employee', 'सेवानिवृत्त सरकारी कर्मचारी'],
    ['self_employed', 'Self-employed / small business', 'स्वरोज़गार / छोटा व्यापार'],
    ['homemaker', 'Homemaker', 'गृहिणी / गृहस्थ'],
    ['student', 'Student', 'विद्यार्थी'],
    ['unemployed', 'Not working', 'काम नहीं करते'],
    ['other', 'Other', 'अन्य'],
  ].map(([value, en, hi]) => ({
    value: value as FormDefinition['occupations'][number]['value'],
    label: { en: en as string, hi: hi as string },
  })),
  fields: [
    {
      id: 'tax',
      fact: 'member.paid_income_tax_last_ay',
      scope: 'member',
      type: 'boolean',
      label: {
        en: 'Did this person pay income tax last year?',
        hi: 'क्या इस व्यक्ति ने पिछले साल आयकर दिया?',
      },
      showIf: { all: [{ fact: 'member.age', op: 'gte', value: 18 }, occupationIn(EARNING)] },
    },
    {
      id: 'pension',
      fact: 'member.monthly_pension',
      scope: 'member',
      type: 'number',
      unit: 'Rs',
      label: {
        en: 'Monthly pension this person receives (Rs, 0 if none)',
        hi: 'इस व्यक्ति की मासिक पेंशन (रु., न हो तो 0)',
      },
      showIf: {
        any: [occupationIn(['retired_government']), { fact: 'member.age', op: 'gte', value: 60 }],
      },
    },
    {
      id: 'pension_category',
      fact: 'member.pension_category',
      scope: 'member',
      type: 'choice',
      options: [
        { value: 'MTS', label: { en: 'MTS (Multi Tasking Staff)', hi: 'MTS' } },
        { value: 'CLASS_IV', label: { en: 'Class IV', hi: 'चतुर्थ श्रेणी' } },
        { value: 'GROUP_D', label: { en: 'Group D', hi: 'ग्रुप D' } },
        { value: 'OTHER', label: { en: 'None of these', hi: 'इनमें से कोई नहीं' } },
      ],
      label: {
        en: 'Which staff category was this person in?',
        hi: 'यह व्यक्ति किस श्रेणी के कर्मचारी थे?',
      },
      showIf: { fact: 'member.monthly_pension', op: 'gte', value: 10000 },
    },
    {
      id: 'land',
      fact: 'household.owns_cultivable_land',
      scope: 'household',
      type: 'boolean',
      label: {
        en: 'Does your household own cultivable land?',
        hi: 'क्या आपके परिवार के पास खेती योग्य ज़मीन है?',
      },
      showIf: { anyMember: occupationIn(LAND) },
    },
    {
      id: 'bpl',
      fact: 'household.bpl_status',
      scope: 'household',
      type: 'boolean',
      label: {
        en: 'Is your household listed as Below Poverty Line (BPL)?',
        hi: 'क्या आपका परिवार गरीबी रेखा से नीचे (BPL) सूची में है?',
      },
      showIf: null,
    },
  ],
};
