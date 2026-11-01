/** Typed application error; the central error handler turns it into the error envelope. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (where, details) =>
    new AppError(400, 'VALIDATION_ERROR', `Invalid request ${where}`, details),
  unauthorized: (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'Insufficient role') => new AppError(403, 'FORBIDDEN', message),
  notFound: (resource) => new AppError(404, 'NOT_FOUND', `${resource} not found`),
  conflict: (code, message) => new AppError(409, code, message),
  unprocessable: (code, message, details) => new AppError(422, code, message, details),
  unavailable: (dependency) =>
    new AppError(503, 'DEPENDENCY_UNAVAILABLE', `${dependency} is unavailable`, { dependency }),
};

export function isAppError(value) {
  return value instanceof AppError;
}
