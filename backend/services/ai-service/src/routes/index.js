import { serviceAuth } from '@rec/common';
import { Router } from 'express';

/** Internal routes (service token required). */
export function createRouter(controller, serviceToken) {
  const router = Router();
  router.use(serviceAuth(serviceToken));
  router.post('/extract', controller.extract);
  router.post('/explain', controller.explain);
  return router;
}
