import { serviceAuth } from '@rec/common';
import { Router } from 'express';

/** Internal routes (service token required). */
export function createRouter(controller, serviceToken) {
  const router = Router();
  router.use(serviceAuth(serviceToken));
  router.post('/sessions/:id/evaluate', controller.evaluate);
  router.get('/sessions/:id/results', controller.results);
  return router;
}
