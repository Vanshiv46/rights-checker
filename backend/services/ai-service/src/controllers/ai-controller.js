import { explainBodySchema, extractBodySchema, parseOrThrow, sendData } from '@rec/common';

/** HTTP layer only. */
export function createAiController(ai) {
  return {
    extract: async (req, res) => {
      const body = parseOrThrow(extractBodySchema, req.body, 'body');
      sendData(res, await ai.extract(body));
    },
    explain: async (req, res) => {
      const body = parseOrThrow(explainBodySchema, req.body, 'body');
      sendData(res, await ai.explain(body));
    },
  };
}
