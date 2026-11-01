import {
  buildFormDefinition,
  codeParamSchema,
  createVersionBodySchema,
  idParamSchema,
  paginationQuerySchema,
  parseOrThrow,
  sendData,
  sourceSearchBodySchema,
  verifyBodySchema,
} from '@rec/common';

/** HTTP layer only: validate input, call the service, write the envelope. */
export function createSchemeController(catalog) {
  return {
    getForm: (_req, res) => {
      sendData(res, buildFormDefinition());
    },
    listSchemes: async (req, res) => {
      const page = parseOrThrow(paginationQuerySchema, req.query, 'query');
      const { rows, total } = await catalog.listSchemes(page);
      sendData(res, rows, { meta: { ...page, total } });
    },
    getScheme: async (req, res) => {
      const { code } = parseOrThrow(codeParamSchema, req.params, 'params');
      sendData(res, await catalog.getScheme(code));
    },
    listPublishedRules: async (_req, res) => {
      sendData(res, await catalog.listPublishedRules());
    },
    createVersion: async (req, res) => {
      const { code } = parseOrThrow(codeParamSchema, req.params, 'params');
      const body = parseOrThrow(createVersionBodySchema, req.body, 'body');
      sendData(res, await catalog.createVersion(code, body), { status: 201 });
    },
    verifyVersion: async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'params');
      const { verifiedBy } = parseOrThrow(verifyBodySchema, req.body, 'body');
      sendData(res, await catalog.verifyVersion(id, verifiedBy));
    },
    publishVersion: async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'params');
      sendData(res, await catalog.publishVersion(id));
    },
    verificationQueue: async (req, res) => {
      const page = parseOrThrow(paginationQuerySchema, req.query, 'query');
      const { rows, total } = await catalog.verificationQueue(page);
      sendData(res, rows, { meta: { ...page, total } });
    },
    searchSources: async (req, res) => {
      const body = parseOrThrow(sourceSearchBodySchema, req.body, 'body');
      sendData(res, await catalog.searchSources(body));
    },
  };
}
