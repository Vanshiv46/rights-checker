import { serviceAuth } from '@rec/common';
import { Router } from 'express';

/** Internal routes (service token required). */
export function createRouter(controller, serviceToken) {
  const router = Router();
  router.use(serviceAuth(serviceToken));
  router.post('/sessions', controller.create);
  router.get('/sessions/:id', controller.get);
  router.post('/sessions/:id/answers', controller.saveAnswers);
  router.get('/sessions/:id/facts', controller.facts);
  router.delete('/sessions/:id', controller.remove);
  return router;
}
