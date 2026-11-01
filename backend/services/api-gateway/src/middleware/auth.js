import { currentRequestId, Errors } from '@rec/common';

const principals = new WeakMap();
const RESOURCE_IN_PATH = /\/(?:schemes|versions)\/([^/]+)/u;

export function principalOf(req) {
  return principals.get(req);
}

/** Requires a valid bearer JWT whose role is one of `roles` (401 without token, 403 wrong role). */
export function requireRole(auth, ...roles) {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      next(Errors.unauthorized());
      return;
    }
    const principal = auth.verify(token);
    if (!roles.includes(principal.role)) {
      next(Errors.forbidden());
      return;
    }
    principals.set(req, principal);
    next();
  };
}

/** Writes one audit_log row per admin/operator request once the response is sent. */
export function auditTrail(audit, onError) {
  return (req, res, next) => {
    const requestId = currentRequestId() ?? 'unknown';
    res.on('finish', () => {
      const path = req.originalUrl.split('?')[0] ?? '';
      audit
        .record({
          operatorId: principalOf(req)?.operatorId ?? null,
          action: `${req.method} ${path}`.slice(0, 120),
          resource: RESOURCE_IN_PATH.exec(path)?.[1]?.slice(0, 64) ?? null,
          requestId,
          statusCode: res.statusCode,
        })
        .catch(onError);
    });
    next();
  };
}
