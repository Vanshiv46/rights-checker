import { serviceAuth } from '@rec/common';
import { Router } from 'express';

/** Internal routes (service token required). */
export function createRouter(controller, serviceToken) {
  const router = Router();
  router.use(serviceAuth(serviceToken));
  router.post('/jobs', controller.create);
  router.get('/jobs/:id', controller.get);
  return router;
}
