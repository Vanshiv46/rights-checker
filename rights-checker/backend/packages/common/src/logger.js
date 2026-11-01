import { pino } from 'pino';
import { currentRequestId } from './context.js';

/** Fields that may carry personal data or secrets; never written to logs. */
const REDACTED_PATHS = [
  'password',
  'token',
  'authorization',
  '*.password',
  '*.token',
  '*.authorization',
  '*.audioBase64',
  '*.imageBase64',
  '*.text',
  '*.value',
  '*.email',
];

/** Structured pino logger; every line carries the service name and current x-request-id. */
export function createLogger(service, level = 'info', destination) {
  const options = {
    name: service,
    level,
    base: { service },
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    mixin() {
      const requestId = currentRequestId();
      return requestId ? { requestId } : {};
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
