import { z } from 'zod';
import { evaluationResponseSchema, sourceChunkResultSchema } from '../contracts/api.js';
import { sessionFactsSchema } from '../contracts/facts.js';
import { publishedRuleSchema } from '../contracts/rules.js';

const seg = (value) => encodeURIComponent(value);

/** Typed client for scheme-service internal endpoints. */
export function createSchemeClient(http) {
  return {
    listPublishedRules: () => http.getJson('/rules/published', z.array(publishedRuleSchema)),
    searchSources: (body) =>
      http.postJson('/sources/search', body, z.array(sourceChunkResultSchema)),
  };
}

/** Typed client for session-service internal endpoints. */
export function createSessionClient(http) {
  return {
    getFacts: (sessionId) => http.getJson(`/sessions/${seg(sessionId)}/facts`, sessionFactsSchema),
  };
}

/** Typed client for eligibility-service internal endpoints. */
export function createEligibilityClient(http) {
  return {
    getResults: (sessionId) =>
      http.getJson(`/sessions/${seg(sessionId)}/results`, evaluationResponseSchema),
  };
}
