import { serviceAuth } from '@rec/common';
import { Router } from 'express';

/** Internal routes (service token required); the public API lives in api-gateway. */
export function createRouter(controller, serviceToken) {
  const router = Router();
  router.use(serviceAuth(serviceToken));
  router.get('/form', controller.getForm);
  router.get('/schemes', controller.listSchemes);
  router.get('/schemes/:code', controller.getScheme);
  router.post('/schemes/:code/versions', controller.createVersion);
  router.get('/rules/published', controller.listPublishedRules);
  router.post('/versions/:id/verify', controller.verifyVersion);
  router.post('/versions/:id/publish', controller.publishVersion);
  router.get('/verification-queue', controller.verificationQueue);
  router.post('/sources/search', controller.searchSources);
  return router;
}
