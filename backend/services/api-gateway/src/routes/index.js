import { sendError } from '@rec/common';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { auditTrail, requireRole } from '../middleware/auth.js';

function limiter(limit) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, 429, 'RATE_LIMITED', 'Too many requests, please slow down');
    },
  });
}

/** Public API under /v1. Citizen routes are anonymous; /admin needs an operator/admin JWT. */
export function createV1Router(deps) {
  const { controller: c, auth } = deps;
  const v1 = Router();
  v1.use(limiter(deps.ratePerMinute));

  v1.post('/auth/login', limiter(deps.loginPerMinute), c.login);

  v1.post('/sessions', c.createSession);
  v1.post('/sessions/:id/answers', c.saveAnswers);
  v1.post('/sessions/:id/evaluate', c.evaluate);
  v1.get('/sessions/:id/results', c.results);
  v1.post('/sessions/:id/explain', c.explain);
  v1.post('/sessions/:id/extract', c.extract);
  v1.delete('/sessions/:id', c.deleteSession);

  v1.post('/voice/transcribe', c.transcribe);
  v1.post('/voice/speak', c.speak);
  v1.post('/ocr/jobs', c.createOcrJob);
  v1.get('/ocr/jobs/:id', c.getOcrJob);

  v1.get('/form', c.getForm);
  v1.get('/schemes', c.listSchemes);
  v1.get('/schemes/:code', c.getScheme);

  const admin = Router();
  admin.use(
    auditTrail(deps.audit, (err) => {
      deps.logger.error({ err }, 'audit write failed');
    }),
  );
  const staff = requireRole(auth, 'operator', 'admin');
  const adminOnly = requireRole(auth, 'admin');
  admin.post('/schemes/:code/versions', adminOnly, c.createVersion);
  admin.post('/versions/:id/verify', staff, c.verifyVersion);
  admin.post('/versions/:id/publish', adminOnly, c.publishVersion);
  admin.get('/verification-queue', staff, c.verificationQueue);
  v1.use('/admin', admin);

  return v1;
}
