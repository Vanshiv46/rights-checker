import { currentRequestId } from '../context.js';

/** Writes the standard `{ data, meta }` success envelope. */
export function sendData(res, data, options = {}) {
  res.status(options.status ?? 200).json({
    data,
    meta: { requestId: currentRequestId(), ...options.meta },
  });
}

/** Writes the standard `{ error: { code, message, details } }` envelope. */
export function sendError(res, status, code, message, details) {
  res
    .status(status)
    .json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
}
