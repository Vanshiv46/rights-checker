/**
 * Persistence port for evaluations.
 *
 * @typedef {object} StoredEvaluation
 * @property {string} id
 * @property {string} sessionId
 * @property {object} result  An evaluation result (see evaluationResultSchema in @rec/common)
 * @property {Date} createdAt
 *
 * @typedef {object} EvaluationRepository
 * @property {(sessionId: string, results: object[]) => Promise<StoredEvaluation[]>} replaceForSession
 *   Atomically replaces a session's evaluations with a new set.
 * @property {(sessionId: string) => Promise<StoredEvaluation[]>} findBySession
 * @property {(sessionId: string) => Promise<number>} deleteBySession
 *   Deletes every evaluation of a session; returns how many rows went.
 */

export {};
