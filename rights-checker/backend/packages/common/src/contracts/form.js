import { OCCUPATIONS } from './facts.js';

/**
 * The household form shown to citizens. Each member picks an occupation; the fields below then
 * appear only when their `showIf` condition holds, so a student is never asked about farmland and
 * a farmer is never asked about a pension category. Fields left hidden stay unknown, so a verdict
 * that needs them is "Needs verification", never a guess.
 *
 * `showIf` uses the rules DSL: {fact, op, value}, {all}, {any}, {not}, {anyMember}.
 * Member-scope fields are checked against each member; household-scope fields against the
 * household (use `anyMember` to depend on members). Add a question here and the form shows it.
 */

export const OCCUPATION_LABELS = {
  farmer: { en: 'Farmer (own or leased land)', hi: 'किसान (अपनी या पट्टे की ज़मीन)' },
  agri_labourer: { en: 'Agricultural labourer', hi: 'खेतिहर मज़दूर' },
  daily_wage: { en: 'Daily-wage / casual worker', hi: 'दिहाड़ी / अस्थायी मज़दूर' },
  salaried_private: { en: 'Salaried (private job)', hi: 'निजी नौकरी' },
  government_employee: { en: 'Government employee', hi: 'सरकारी कर्मचारी' },
  retired_government: { en: 'Retired government employee', hi: 'सेवानिवृत्त सरकारी कर्मचारी' },
  self_employed: { en: 'Self-employed / small business', hi: 'स्वरोज़गार / छोटा व्यापार' },
  homemaker: { en: 'Homemaker', hi: 'गृहिणी / गृहस्थ' },
  student: { en: 'Student', hi: 'विद्यार्थी' },
  unemployed: { en: 'Not working', hi: 'काम नहीं करते' },
  other: { en: 'Other', hi: 'अन्य' },
};

const EARNING = [
  'farmer',
  'agri_labourer',
  'daily_wage',
  'salaried_private',
  'government_employee',
  'self_employed',
  'retired_government',
];
const LAND_RELEVANT = [
  'farmer',
  'agri_labourer',
  'self_employed',
  'homemaker',
  'retired_government',
  'unemployed',
  'other',
];

const occupationIn = (values) => ({ fact: 'member.occupation', op: 'in', value: values });

/** @type {Array<object>} */
export const FORM_FIELDS = [
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
    showIf: { anyMember: occupationIn(LAND_RELEVANT) },
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
];

export function buildFormDefinition() {
  return {
    occupations: OCCUPATIONS.map((value) => ({ value, label: OCCUPATION_LABELS[value] })),
    fields: FORM_FIELDS,
  };
}
