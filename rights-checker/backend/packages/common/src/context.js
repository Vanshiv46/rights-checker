import { AsyncLocalStorage } from 'node:async_hooks';

/** Carries the x-request-id through every async call made while serving a request. */
export const requestContext = new AsyncLocalStorage();

export function currentRequestId() {
  return requestContext.getStore()?.requestId;
}

/** Runs `fn` with the given request id bound, e.g. while handling an event. */
export function runWithRequestId(requestId, fn) {
  return requestContext.run({ requestId }, fn);
}
