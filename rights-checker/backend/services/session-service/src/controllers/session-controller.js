import {
  answersBodySchema,
  createSessionBodySchema,
  idParamSchema,
  parseOrThrow,
  sendData,
} from '@rec/common';

/** HTTP layer only. */
export function createSessionController(sessions) {
  return {
    create: async (req, res) => {
      const body = parseOrThrow(createSessionBodySchema, req.body, 'body');
      sendData(res, await sessions.create(body), { status: 201 });
    },
    get: async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'params');
      sendData(res, await sessions.get(id));
    },
    saveAnswers: async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'params');
      const body = parseOrThrow(answersBodySchema, req.body, 'body');
      sendData(res, await sessions.saveAnswers(id, body));
    },
    facts: async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'params');
      sendData(res, await sessions.getFacts(id));
    },
    remove: async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'params');
      await sessions.delete(id);
      res.status(204).end();
    },
  };
}
