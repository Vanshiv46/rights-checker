import { z } from 'zod';
import {
  factKeySchema,
  factOriginSchema,
  factValueSchema,
  languageSchema,
  relationSchema,
} from './facts.js';
import { checklistSchema, ruleDefinitionSchema, sourceRefSchema } from './rules.js';

/* ---------- envelopes ---------- */

export const metaSchema = z.record(z.string(), z.unknown());

/** Success envelope `{ data, meta }` used by every endpoint. */
export function envelopeSchema(data) {
  return z.object({ data, meta: metaSchema.optional() });
}

export const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const idParamSchema = z.object({ id: z.uuid() });
export const codeParamSchema = z.object({ code: z.string().regex(/^[A-Z0-9-]{2,32}$/) });

/* ---------- sessions ---------- */

export const createSessionBodySchema = z.object({ language: languageSchema, consent: z.boolean() });

export const sessionSchema = z.object({
  id: z.uuid(),
  language: languageSchema,
  consentAt: z.string(),
  expiresAt: z.string(),
});

export const answerSchema = z
  .object({
    key: z.string().min(3).max(64),
    value: factValueSchema,
    memberId: z.uuid().optional(),
    memberRef: z.string().min(1).max(16).optional(),
    origin: factOriginSchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
    confirmed: z.boolean().optional(),
  })
  .refine((a) => !(a.memberId && a.memberRef), 'Use memberId or memberRef, not both');

export const answersBodySchema = z
  .object({
    members: z
      .array(z.object({ ref: z.string().min(1).max(16), relation: relationSchema }))
      .max(20)
      .optional(),
    answers: z.array(answerSchema).max(50),
  })
  .refine((b) => b.answers.length > 0 || (b.members?.length ?? 0) > 0, 'Nothing to save');

export const answersResultSchema = z.object({
  sessionId: z.uuid(),
  members: z.array(
    z.object({ id: z.uuid(), ref: z.string().nullable(), relation: relationSchema }),
  ),
  saved: z.number().int().min(0),
});

/* ---------- eligibility ---------- */

export const verdictSchema = z.enum(['LIKELY', 'NEEDS_VERIFICATION', 'NOT_ELIGIBLE']);

export const missingFactSchema = z.object({ key: factKeySchema, memberId: z.uuid().nullable() });

export const reasonSchema = z.object({
  clauseId: z.string(),
  kind: z.enum(['requirement', 'exclusion', 'superseded']),
  outcome: z.enum(['met', 'not_met', 'unknown', 'applies', 'does_not_apply']),
  description: z.string(),
});

export const checkLeftSchema = z.object({
  clauseId: z.string(),
  description: z.string(),
  missingFacts: z.array(missingFactSchema),
});

export const evaluationResultSchema = z.object({
  schemeCode: z.string(),
  schemeName: z.string(),
  verdict: verdictSchema,
  reasons: z.array(reasonSchema),
  checksLeft: z.array(checkLeftSchema),
  missingFacts: z.array(missingFactSchema),
  firedRules: z.array(z.string()),
  benefits: z.array(z.string()),
  supersededBy: z.string().nullable(),
  checklist: checklistSchema,
  source: sourceRefSchema,
  ruleVersion: z.object({ id: z.uuid(), version: z.number().int().positive() }),
  verifiedOn: z.string().nullable(),
});

export const nextQuestionSchema = z.object({
  key: factKeySchema,
  memberId: z.uuid().nullable(),
  question: z.string(),
  settles: z.number().int().min(0),
  schemes: z.array(z.string()),
});

export const evaluationResponseSchema = z.object({
  sessionId: z.uuid(),
  evaluatedAt: z.string(),
  results: z.array(evaluationResultSchema),
  nextQuestions: z.array(nextQuestionSchema),
});

/* ---------- schemes ---------- */

export const versionStatusSchema = z.enum(['draft', 'published', 'retired']);

export const schemeSummarySchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  publishedVersion: z
    .object({ id: z.uuid(), version: z.number().int(), verifiedOn: z.string().nullable() })
    .nullable(),
});

export const schemeDetailSchema = schemeSummarySchema.extend({
  rule: ruleDefinitionSchema.nullable(),
  checklist: checklistSchema.nullable(),
});

export const createVersionBodySchema = z.object({
  rule: ruleDefinitionSchema,
  checklist: checklistSchema,
  notes: z.string().max(2000).optional(),
});

export const schemeVersionSchema = z.object({
  id: z.uuid(),
  schemeCode: z.string(),
  version: z.number().int().positive(),
  status: versionStatusSchema,
  verifiedOn: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  notes: z.string().nullable(),
});

export const verifyBodySchema = z.object({ verifiedBy: z.string().min(2).max(64) });

export const sourceSearchBodySchema = z.object({
  schemeVersionId: z.uuid(),
  query: z.string().min(2).max(500),
  embedding: z.array(z.number()).min(1).max(4096).optional(),
});

export const sourceChunkResultSchema = z.object({
  chunkId: z.uuid(),
  documentTitle: z.string(),
  section: z.string().nullable(),
  text: z.string(),
  score: z.number(),
});

/* ---------- ai ---------- */

export const extractBodySchema = z.object({
  text: z.string().min(1).max(2000),
  language: languageSchema,
});

export const extractedFactSchema = z.object({
  key: factKeySchema,
  value: factValueSchema,
  memberRef: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export const extractResultSchema = z.object({
  facts: z.array(extractedFactSchema),
  requiresConfirmation: z.literal(true),
});

export const explainBodySchema = z.object({ sessionId: z.uuid(), language: languageSchema });

export const explanationSchema = z.object({
  schemeCode: z.string(),
  verdict: verdictSchema,
  text: z.string(),
  citations: z.array(
    z.object({ chunkId: z.uuid(), documentTitle: z.string(), section: z.string().nullable() }),
  ),
});
export const explainResultSchema = z.object({
  sessionId: z.uuid(),
  explanations: z.array(explanationSchema),
});

/* ---------- voice ---------- */

export const transcribeBodySchema = z.object({
  audioBase64: z.base64().min(1),
  language: languageSchema,
});

export const transcribeResultSchema = z.object({ text: z.string(), language: languageSchema });

export const speakBodySchema = z.object({
  text: z.string().min(1).max(1000),
  language: languageSchema,
  gender: z.enum(['female', 'male']).optional(),
});

export const speakResultSchema = z.object({ audioBase64: z.string(), mimeType: z.string() });

/* ---------- ocr ---------- */

export const ocrFieldSchema = z.enum(['member.age', 'household.bpl_status']);
export const createOcrJobBodySchema = z.object({
  imageBase64: z.base64().min(1),
  field: ocrFieldSchema,
});

export const ocrJobSchema = z.object({
  jobId: z.string(),
  status: z.enum(['queued', 'active', 'completed', 'failed']),
  result: z
    .object({
      field: ocrFieldSchema,
      value: factValueSchema.nullable(),
      confidence: z.number().min(0).max(1),
    })
    .nullable(),
});

/* ---------- auth ---------- */

export const roleSchema = z.enum(['operator', 'admin']);

export const loginBodySchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});
export const loginResultSchema = z.object({
  token: z.string(),
  role: roleSchema,
  expiresIn: z.number().int(),
});
