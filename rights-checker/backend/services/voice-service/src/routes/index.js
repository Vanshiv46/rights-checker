import { serviceAuth } from '@rec/common';
import { Router } from 'express';

/** Internal routes (service token required). */
export function createRouter(controller, serviceToken) {
  const router = Router();
  router.use(serviceAuth(serviceToken));
  router.post('/transcribe', controller.transcribe);
  router.post('/speak', controller.speak);
  return router;
}
