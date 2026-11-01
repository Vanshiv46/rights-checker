import { createOcrJobBodySchema, parseOrThrow, sendData } from '@rec/common';

import { z } from 'zod';

const jobIdParamSchema = z.object({ id: z.uuid() });

/** HTTP layer only. */
export function createOcrController(ocr) {
  return {
    create: async (req, res) => {
      const body = parseOrThrow(createOcrJobBodySchema, req.body, 'body');
      sendData(res, await ocr.createJob(body), { status: 202 });
    },
    get: async (req, res) => {
      const { id } = parseOrThrow(jobIdParamSchema, req.params, 'params');
      sendData(res, await ocr.getJob(id));
    },
  };
}
