import { idParamSchema, parseOrThrow, sendData } from '@rec/common';

/** HTTP layer only. */
export function createEligibilityController(eligibility) {
  return {
    evaluate: async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'params');
      sendData(res, await eligibility.evaluateSession(id));
    },
    results: async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'params');
      sendData(res, await eligibility.getResults(id));
    },
  };
}
