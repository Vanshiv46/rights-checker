import { z } from 'zod';
import { PROMPT_CONTEXT_MARKER, PROMPT_TASK_PREFIX } from './provider.js';

const extractContextSchema = z.object({ text: z.string() });
const explainContextSchema = z.object({
  language: z.string(),
  items: z.array(
    z.object({
      schemeCode: z.string(),
      verdict: z.enum(['LIKELY', 'NEEDS_VERIFICATION', 'NOT_ELIGIBLE']),
      reasons: z.array(z.string()),
      checksLeft: z.array(z.string()),
    }),
  ),
});

const AGE = /(\d{1,3})\s*(?:years?|yrs?|saal|sal|वर्ष|साल)/giu;
const BPL_NO = /\b(not|no)\b[^.]{0,20}\b(bpl|below poverty line)/iu;
const BPL_YES = /\bbpl\b|below poverty line|गरीबी रेखा/iu;
const LAND_NO = /\bno (farm|land)\b|\blandless\b|ज़मीन नहीं|जमीन नहीं/iu;
const LAND_YES = /\b(land|farm|field)\b|खेत|ज़मीन|जमीन/iu;
const TAX_NO = /\b(no|not|never|don't|do not)\b[^.]{0,15}income tax/iu;
const TAX_YES = /income tax|आयकर/iu;
const PENSION = /pension\D{0,20}(\d[\d,]*)/iu;

function extractFacts(text) {
  const facts = [];
  const ages = [...text.matchAll(AGE)].map((m) => Number(m[1]));
  ages.forEach((age, i) => {
    facts.push({ key: 'member.age', value: age, memberRef: `m${i + 1}`, confidence: 0.7 });
  });
  if (BPL_NO.test(text))
    facts.push({ key: 'household.bpl_status', value: false, memberRef: null, confidence: 0.6 });
  else if (BPL_YES.test(text))
    facts.push({ key: 'household.bpl_status', value: true, memberRef: null, confidence: 0.6 });
  if (LAND_NO.test(text)) {
    facts.push({
      key: 'household.owns_cultivable_land',
      value: false,
      memberRef: null,
      confidence: 0.6,
    });
  } else if (LAND_YES.test(text)) {
    facts.push({
      key: 'household.owns_cultivable_land',
      value: true,
      memberRef: null,
      confidence: 0.5,
    });
  }
  if (TAX_NO.test(text) || TAX_YES.test(text)) {
    facts.push({
      key: 'member.paid_income_tax_last_ay',
      value: !TAX_NO.test(text),
      memberRef: 'm1',
      confidence: 0.5,
    });
  }
  const pension = PENSION.exec(text)?.[1];
  if (pension !== undefined) {
    const amount = Number(pension.replaceAll(',', ''));
    facts.push({ key: 'member.monthly_pension', value: amount, memberRef: 'm1', confidence: 0.5 });
  }
  return facts;
}

const VERDICT_TEXT = {
  LIKELY: 'You may be eligible.',
  NEEDS_VERIFICATION: 'We need a few more answers before we can say.',
  NOT_ELIGIBLE: 'This scheme does not seem to apply.',
};

function explain(item) {
  const parts = [VERDICT_TEXT[item.verdict], ...item.reasons.map((r) => `- ${r}`)];
  if (item.checksLeft.length > 0) parts.push(`Still to check: ${item.checksLeft.join('; ')}`);
  return parts.join('\n');
}

/**
 * Deterministic offline provider used by default: keyword extraction and templated
 * explanations. Lets the whole system run (and be tested) without any LLM account.
 */
export class MockProvider {
  name = 'mock';

  complete(prompt, schema) {
    const task = prompt.slice(PROMPT_TASK_PREFIX.length, prompt.indexOf('\n'));
    const context = JSON.parse(
      prompt.slice(prompt.indexOf(PROMPT_CONTEXT_MARKER) + PROMPT_CONTEXT_MARKER.length),
    );
    if (task === 'extract') {
      const { text } = extractContextSchema.parse(context);
      return Promise.resolve(schema.parse({ facts: extractFacts(text) }));
    }
    const { items } = explainContextSchema.parse(context);
    const explanations = items.map((item) => ({
      schemeCode: item.schemeCode,
      text: explain(item),
    }));
    return Promise.resolve(schema.parse({ explanations }));
  }
}
