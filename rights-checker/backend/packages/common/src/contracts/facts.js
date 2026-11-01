import { z } from 'zod';

/** member_id value used for household-level facts (keeps the unique key NOT NULL). */
export const HOUSEHOLD_SCOPE = '00000000-0000-0000-0000-000000000000';

export const LANGUAGES = [
  'en',
  'hi',
  'bn',
  'ta',
  'te',
  'mr',
  'gu',
  'kn',
  'ml',
  'or',
  'pa',
  'as',
  'ur',
];
export const languageSchema = z.enum(LANGUAGES);

export const relationSchema = z.enum(['self', 'spouse', 'parent', 'child', 'sibling', 'other']);

export const factOriginSchema = z.enum(['typed', 'voice', 'ocr']);

export const factValueSchema = z.union([z.boolean(), z.number(), z.string().max(64)]);

export const PENSION_CATEGORIES = ['MTS', 'CLASS_IV', 'GROUP_D', 'OTHER'];

export const OCCUPATIONS = [
  'farmer',
  'agri_labourer',
  'daily_wage',
  'salaried_private',
  'government_employee',
  'retired_government',
  'self_employed',
  'homemaker',
  'student',
  'unemployed',
  'other',
];

/**
 * Every fact the rules engine understands. Only facts listed here can be stored or used in rules,
 * which keeps personal identifiers (names, phone, Aadhaar) out of the system by construction.
 */
export const FACT_CATALOGUE = {
  'household.owns_cultivable_land': {
    scope: 'household',
    schema: z.boolean(),
    question: {
      en: 'Does your household own cultivable land?',
      hi: 'क्या आपके परिवार के पास खेती योग्य ज़मीन है?',
    },
  },
  'household.bpl_status': {
    scope: 'household',
    schema: z.boolean(),
    question: {
      en: 'Is your household listed as Below Poverty Line (BPL)?',
      hi: 'क्या आपका परिवार गरीबी रेखा से नीचे (BPL) सूची में है?',
    },
  },
  'member.age': {
    scope: 'member',
    schema: z.number().int().min(0).max(120),
    question: { en: 'How old is this person?', hi: 'इस व्यक्ति की उम्र कितनी है?' },
  },
  'member.occupation': {
    scope: 'member',
    schema: z.enum(OCCUPATIONS),
    question: {
      en: 'What does this person do for a living?',
      hi: 'यह व्यक्ति क्या काम करता/करती है?',
    },
  },
  'member.paid_income_tax_last_ay': {
    scope: 'member',
    schema: z.boolean(),
    question: {
      en: 'Did this person pay income tax in the last assessment year?',
      hi: 'क्या इस व्यक्ति ने पिछले कर निर्धारण वर्ष में आयकर दिया?',
    },
  },
  'member.monthly_pension': {
    scope: 'member',
    schema: z.number().min(0).max(10_000_000),
    question: {
      en: 'What monthly pension (in Rs) does this person receive? Enter 0 if none.',
      hi: 'इस व्यक्ति को हर महीने कितनी पेंशन (रु.) मिलती है? न हो तो 0 लिखें।',
    },
  },
  'member.pension_category': {
    scope: 'member',
    schema: z.enum(PENSION_CATEGORIES),
    question: {
      en: 'Was this person employed as MTS, Class IV or Group D staff?',
      hi: 'क्या यह व्यक्ति MTS, चतुर्थ श्रेणी या ग्रुप D कर्मचारी थे?',
    },
  },
};

export const FACT_KEYS = Object.keys(FACT_CATALOGUE);
export const factKeySchema = z.enum(FACT_KEYS);

export function isFactKey(key) {
  return Object.hasOwn(FACT_CATALOGUE, key);
}

export function factScope(key) {
  return FACT_CATALOGUE[key].scope;
}

/** True when `value` has the type and range the catalogue declares for `key`. */
export function isValidFactValue(key, value) {
  return FACT_CATALOGUE[key].schema.safeParse(value).success;
}

export function questionFor(key, language) {
  const q = FACT_CATALOGUE[key].question;
  return language === 'hi' ? q.hi : q.en;
}

const factMapSchema = z.record(z.string(), factValueSchema);

/** Confirmed facts of a session, shaped for the rules engine. */
export const sessionFactsSchema = z.object({
  sessionId: z.uuid(),
  language: languageSchema,
  household: factMapSchema,
  members: z.array(z.object({ id: z.uuid(), relation: relationSchema, facts: factMapSchema })),
  unconfirmed: z.array(z.object({ key: z.string(), memberId: z.uuid().nullable() })),
});
