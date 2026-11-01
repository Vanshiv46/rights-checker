/**
 * Provider-agnostic LLM interface. Implementations must return output that passes `schema`;
 * callers never let the output decide or change an eligibility verdict.
 *
 * @typedef {object} LlmProvider
 * @property {string} name
 * @property {(prompt: string, schema: import('zod').ZodType) => Promise<any>} complete
 */

export const PROMPT_TASK_PREFIX = 'TASK: ';
export const PROMPT_CONTEXT_MARKER = 'CONTEXT_JSON:\n';

/** Builds the prompt layout shared by every task: task line, instructions, JSON context. */
export function buildPrompt(task, instructions, context) {
  return `${PROMPT_TASK_PREFIX}${task}\nINSTRUCTIONS: ${instructions}\n${PROMPT_CONTEXT_MARKER}${JSON.stringify(context)}`;
}
