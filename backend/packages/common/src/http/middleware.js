import { randomUUID, timingSafeEqual } from 'node:crypto';

import { requestContext } from '../context.js';
import { AppError, Errors } from '../errors.js';
import { sendError } from './response.js';

export const REQUEST_ID_HEADER = 'x-request-id';
export const SERVICE_TOKEN_HEADER = 'x-service-token';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/** Accepts a well-formed incoming x-request-id or mints one, echoes it, and binds it for logs. */
export const requestIdMiddleware = (req, res, next) => {
  const incoming = req.get(REQUEST_ID_HEADER);
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  requestContext.run({ requestId }, next);
};

/** Logs method, route and status once per request; never bodies (they may hold personal data). */
export function requestLogger(logger) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info(
        { method: req.method, path: req.path, status: res.statusCode, durationMs },
        'request completed',
      );
    });
    next();
  };
}

function tokensMatch(expected, given) {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Rejects internal calls that do not carry the shared service token. */
export function serviceAuth(token) {
  return (req, _res, next) => {
    const given = req.get(SERVICE_TOKEN_HEADER);
    if (!given || !tokensMatch(token, given)) {
      next(Errors.unauthorized('Missing or invalid service token'));
      return;
    }
    next();
  };
}

export const notFoundHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

function isBodyParserError(err) {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

/** Central error handler: typed AppErrors keep their status; anything else becomes a 500. */
export function errorHandler(logger) {
  return (err, _req, res, _next) => {
    if (err instanceof AppError) {
      if (err.status >= 500) logger.warn({ code: err.code }, err.message);
      sendError(res, err.status, err.code, err.message, err.details);
      return;
    }
    if (isBodyParserError(err)) {
      const tooLarge = err.type === 'entity.too.large';
      sendError(
        res,
        tooLarge ? 413 : 400,
        tooLarge ? 'PAYLOAD_TOO_LARGE' : 'MALFORMED_JSON',
        tooLarge ? 'Request body is too large' : 'Request body is not valid JSON',
      );
      return;
    }
    logger.error({ err }, 'unhandled error');
    sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
  };
}
