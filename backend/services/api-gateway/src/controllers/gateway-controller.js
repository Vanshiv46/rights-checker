import {
  codeParamSchema,
  currentRequestId,
  Errors,
  idParamSchema,
  loginBodySchema,
  paginationQuerySchema,
  parseOrThrow,
  sendData,
} from '@rec/common';

import { z } from 'zod';
import { principalOf } from '../middleware/auth.js';

const languageBodySchema = z.object({ language: z.unknown() }).loose();

/** The validated :id path parameter (a UUID), safe to place in an upstream path. */
const uuidParam = (req) => encodeURIComponent(parseOrThrow(idParamSchema, req.params, 'params').id);
const schemeCode = (req) =>
  encodeURIComponent(parseOrThrow(codeParamSchema, req.params, 'params').code);

/** Writes the upstream status and body unchanged (204s have no body). */
function relay(res, raw) {
  if (raw.status === 204 || raw.body === null) {
    res.status(raw.status).end();
    return;
  }
  res.status(raw.status).json(raw.body);
}

/** HTTP layer of the gateway: validates ids, forwards to the owning service, relays the answer. */
export function createGatewayController(proxy, auth) {
  const forward =
    (upstream, method, path, options = (req) => ({ body: req.body })) =>
    async (req, res) => {
      relay(res, await proxy.forward(upstream, method, path(req), options(req)));
    };
  const noBody = () => ({});

  return {
    login: async (req, res) => {
      const { email, password } = parseOrThrow(loginBodySchema, req.body, 'body');
      sendData(res, await auth.login(email, password, currentRequestId() ?? 'unknown'));
    },
    createSession: forward('session', 'POST', () => '/sessions'),
    saveAnswers: forward('session', 'POST', (req) => `/sessions/${uuidParam(req)}/answers`),
    deleteSession: forward('session', 'DELETE', (req) => `/sessions/${uuidParam(req)}`, noBody),
    evaluate: forward(
      'eligibility',
      'POST',
      (req) => `/sessions/${uuidParam(req)}/evaluate`,
      noBody,
    ),
    results: forward('eligibility', 'GET', (req) => `/sessions/${uuidParam(req)}/results`, noBody),
    explain: forward(
      'ai',
      'POST',
      () => '/explain',
      (req) => ({
        body: {
          sessionId: parseOrThrow(idParamSchema, req.params, 'params').id,
          language: parseOrThrow(languageBodySchema, req.body ?? {}, 'body').language,
        },
      }),
    ),
    extract: forward('ai', 'POST', () => '/extract'),
    transcribe: forward('voice', 'POST', () => '/transcribe'),
    speak: forward('voice', 'POST', () => '/speak'),
    createOcrJob: forward('ocr', 'POST', () => '/jobs'),
    getOcrJob: forward('ocr', 'GET', (req) => `/jobs/${uuidParam(req)}`, noBody),
    getForm: forward('scheme', 'GET', () => '/form', noBody),
    listSchemes: forward(
      'scheme',
      'GET',
      () => '/schemes',
      (req) => ({ query: parseOrThrow(paginationQuerySchema, req.query, 'query') }),
    ),
    getScheme: forward('scheme', 'GET', (req) => `/schemes/${schemeCode(req)}`, noBody),
    createVersion: forward('scheme', 'POST', (req) => `/schemes/${schemeCode(req)}/versions`),
    verifyVersion: forward(
      'scheme',
      'POST',
      (req) => `/versions/${uuidParam(req)}/verify`,
      (req) => {
        const principal = principalOf(req);
        if (!principal) throw Errors.unauthorized();
        return { body: { verifiedBy: principal.operatorId } };
      },
    ),
    publishVersion: forward(
      'scheme',
      'POST',
      (req) => `/versions/${uuidParam(req)}/publish`,
      noBody,
    ),
    verificationQueue: forward(
      'scheme',
      'GET',
      () => '/verification-queue',
      (req) => ({ query: parseOrThrow(paginationQuerySchema, req.query, 'query') }),
    ),
  };
}
