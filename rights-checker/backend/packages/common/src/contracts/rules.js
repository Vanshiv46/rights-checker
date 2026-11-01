import { z } from 'zod';
import { factKeySchema, factValueSchema } from './facts.js';

export const comparisonOpSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in']);

/**
 * Rule DSL. A condition is one of:
 *   { fact, op, value }      leaf comparison (op: eq | ne | gt | gte | lt | lte | in)
 *   { all: Condition[] }     every child true
 *   { any: Condition[] }     at least one child true
 *   { not: Condition }       negation
 *   { anyMember: Condition } inner condition evaluated per household member; true if any matches
 * Facts must come from FACT_CATALOGUE, so rules can never reference personal identifiers.
 */

const leafSchema = z.strictObject({
  fact: factKeySchema,
  op: comparisonOpSchema,
  value: z.union([factValueSchema, z.array(factValueSchema).min(1).max(20)]),
});

export const conditionSchema = z.lazy(() =>
  z.union([
    leafSchema,
    z.strictObject({ all: z.array(conditionSchema).min(1).max(20) }),
    z.strictObject({ any: z.array(conditionSchema).min(1).max(20) }),
    z.strictObject({ not: conditionSchema }),
    z.strictObject({ anyMember: conditionSchema }),
  ]),
);

export const clauseSchema = z.object({
  id: z.string().regex(/^[a-z0-9_.-]{2,64}$/),
  description: z.string().min(3).max(300),
  condition: conditionSchema,
});

export const sourceRefSchema = z.object({
  document: z.string().min(3).max(200),
  section: z.string().max(50).nullable(),
  url: z.url().nullable(),
});

export const ruleDefinitionSchema = z.object({
  requirements: z.array(clauseSchema).max(30),
  exclusions: z.array(clauseSchema).max(30),
  supersededBy: z
    .object({
      schemeCode: z.string().min(2).max(32),
      description: z.string().min(3).max(300),
      condition: conditionSchema,
    })
    .nullable(),
  benefits: z.array(
    z.object({ description: z.string().min(3).max(300), condition: conditionSchema }),
  ),
  source: sourceRefSchema,
  notes: z.array(z.string().max(500)),
});

export const checklistStatusSchema = z.enum(['AVAILABLE', 'PENDING_STATE_VERIFICATION', 'TODO']);

export const checklistSchema = z.object({
  status: checklistStatusSchema,
  items: z.array(z.object({ id: z.string().min(1).max(64), label: z.string().min(1).max(200) })),
});

/** A published rule version as served to eligibility-service. */
export const publishedRuleSchema = z.object({
  schemeCode: z.string(),
  schemeName: z.string(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  rule: ruleDefinitionSchema,
  checklist: checklistSchema,
  verifiedOn: z.string().nullable(),
});
