import { AppError, isFactKey, isValidFactValue } from '@rec/common';
import { z } from 'zod';
import { buildPrompt } from '../llm/provider.js';
import { redactIdentifiers } from './redact.js';

const llmExtractSchema = z.object({
  facts: z.array(
    z.object({
      key: z.string(),
      value: z.union([z.boolean(), z.number(), z.string()]),
      memberRef: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

const llmExplainSchema = z.object({
  explanations: z.array(z.object({ schemeCode: z.string(), text: z.string().max(4000) })),
});

const CITATIONS_PER_SCHEME = 3;

const EXTRACT_INSTRUCTIONS =
  'Extract household facts from the text (Hindi, English or mixed). Use only these keys: ' +
  'household.owns_cultivable_land (boolean), household.bpl_status (boolean), member.age ' +
  '(integer), member.paid_income_tax_last_ay (boolean), member.monthly_pension (number, rupees), ' +
  'member.pension_category ("MTS" | "CLASS_IV" | "GROUP_D" | "OTHER"). Use memberRef "m1", "m2"... ' +
  'for different people, null for household facts. Only include facts the text clearly states. ' +
  'Never output names or identifiers. Never judge eligibility. Respond as JSON: ' +
  '{"facts":[{"key":string,"value":boolean|number|string,"memberRef":string|null,"confidence":number 0-1}]}';
const EXPLAIN_INSTRUCTIONS =
  'For every item, explain the verdict to a citizen in 2-4 plain, short sentences, in Hindi ' +
  '(Devanagari) if language is "hi", otherwise in English. Use the reasons, checksLeft and sources ' +
  'given. The verdicts are final outputs of a rules engine: do not change, soften or contradict ' +
  'them, never say "eligible" for LIKELY (say "may qualify"), and remind that the government ' +
  'office makes the final decision. Respond as JSON: ' +
  '{"explanations":[{"schemeCode":string,"text":string}]}';

/** LLM-backed helpers. They propose facts and explain verdicts; they never decide verdicts. */
export class AiService {
  constructor(llm, eligibility, schemes, logger) {
    this.llm = llm;
    this.eligibility = eligibility;
    this.schemes = schemes;
    this.logger = logger;
  }

  /** Proposes facts from free text; the citizen must confirm them before they count. */
  async extract(body) {
    const prompt = buildPrompt('extract', EXTRACT_INSTRUCTIONS, {
      language: body.language,
      text: redactIdentifiers(body.text),
    });
    const output = await this.complete(prompt, llmExtractSchema);
    const facts = output.facts.flatMap((f) =>
      isFactKey(f.key) && isValidFactValue(f.key, f.value) ? [{ ...f, key: f.key }] : [],
    );
    return { facts, requiresConfirmation: true };
  }

  /** Explains stored verdicts with citations; verdicts are copied from the rules engine. */
  async explain(body) {
    const { results } = await this.eligibility.getResults(body.sessionId);
    const enriched = await Promise.all(
      results.map(async (result) => ({ result, citations: await this.citationsFor(result) })),
    );
    const prompt = buildPrompt('explain', EXPLAIN_INSTRUCTIONS, {
      language: body.language,
      items: enriched.map(({ result: r, citations }) => ({
        schemeCode: r.schemeCode,
        verdict: r.verdict,
        reasons: r.reasons.map((x) => `${x.description} (${x.outcome})`),
        checksLeft: r.checksLeft.map((c) => c.description),
        sources: citations.map((c) => c.text),
      })),
    });
    const output = await this.complete(prompt, llmExplainSchema);
    const textByScheme = new Map(output.explanations.map((e) => [e.schemeCode, e.text]));
    return {
      sessionId: body.sessionId,
      explanations: enriched.map(({ result: r, citations }) => ({
        schemeCode: r.schemeCode,
        verdict: r.verdict,
        text: textByScheme.get(r.schemeCode) ?? r.reasons.map((x) => x.description).join(' '),
        citations: citations.map(({ chunkId, documentTitle, section }) => ({
          chunkId,
          documentTitle,
          section,
        })),
      })),
    };
  }

  async citationsFor(result) {
    const query = [result.schemeName, ...result.reasons.map((r) => r.description)].join(' ');
    try {
      const hits = await this.schemes.searchSources({
        schemeVersionId: result.ruleVersion.id,
        query,
      });
      return hits.slice(0, CITATIONS_PER_SCHEME);
    } catch {
      this.logger.warn(
        { schemeCode: result.schemeCode },
        'source search unavailable; no citations',
      );
      return [];
    }
  }

  async complete(prompt, schema) {
    try {
      return await this.llm.complete(prompt, schema);
    } catch (err) {
      this.logger.warn({ provider: this.llm.name, err }, 'llm call failed');
      throw new AppError(
        503,
        'AI_UNAVAILABLE',
        'The assistant is unavailable; results are still valid',
      );
    }
  }
}
