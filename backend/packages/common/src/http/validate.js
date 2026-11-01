import { Errors } from '../errors.js';

/** Validates request input with zod and throws a 400 AppError listing the issues. */
export function parseOrThrow(schema, input, where) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw Errors.validation(
      where,
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}
