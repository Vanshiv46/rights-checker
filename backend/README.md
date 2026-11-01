# Rights & Entitlements Checker — Backend

Hackathon prototype that tells Indian citizens which government schemes **may** apply to their
household, why, and which documents they need. Microservices in plain **JavaScript (ES modules)**
on Node.js 22 + Express 5, MySQL 8.4 (one database per service), Redis Streams and BullMQ.
No build step: every service runs its `src/` directly with `node`.

**Core rule:** verdicts come only from the deterministic rules engine in `eligibility-service`.
`ai-service` may propose facts and explain verdicts; it can never decide or change one. There is
no `ELIGIBLE` verdict — only `LIKELY`, `NEEDS_VERIFICATION` and `NOT_ELIGIBLE`.

## Service map

| Service               | Port | Database         | Owns / does                                                                                      |
| --------------------- | ---- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `api-gateway`         | 4000 | `auth_db`        | Only public entry (`/v1`). JWT auth, roles, rate limits, CORS allowlist, x-request-id, audit_log |
| `session-service`     | 4001 | `session_db`     | Sessions, consent, household members, facts; erases sessions; BullMQ expiry job                 |
| `eligibility-service` | 4002 | `eligibility_db` | Pure rules engine + question planner; rule cache; stores evaluations                             |
| `scheme-service`      | 4003 | `scheme_db`      | Catalogue, rule versions, verify/publish workflow, FULLTEXT source search                        |
| `ai-service`          | 4004 | —                | `/extract`, `/explain`; `LlmProvider` interface with `MockProvider` (default)                    |
| `voice-service`       | 4005 | —                | `/transcribe` via Groq Whisper (`/speak` always 503: browser reads aloud); 503 `VOICE_UNAVAILABLE` → clients fall back to text        |
| `ocr-service`         | 4006 | —                | Optional. BullMQ job reads one field; image kept in process memory only                          |

Only the gateway is published by `docker-compose.yml`; all other services require the
`x-service-token` header and are reachable only on the compose network.

```
client ──► api-gateway ──► session-service ──► MySQL session_db
                │      ├──► eligibility-service ──► MySQL eligibility_db
                │      │          ├── GET facts ──► session-service
                │      │          └── GET /rules/published ──► scheme-service
                │      ├──► scheme-service ──► MySQL scheme_db
                │      ├──► ai-service ──► eligibility-service, scheme-service /sources/search
                │      ├──► voice-service ──► Groq Whisper
                │      └──► ocr-service ──► BullMQ (Redis)
                └──► MySQL auth_db (operators, audit_log)

Redis Streams:  rule.published (scheme → eligibility: reload cache)
                session.deleted (session → eligibility: delete evaluations)
                evaluation.created (eligibility → anyone interested)
```

## Events (Redis Streams, key `rec:events:<type>`)

| Event                | Producer            | Consumer (group)      | Effect                                      |
| -------------------- | ------------------- | --------------------- | ------------------------------------------- |
| `rule.published`     | scheme-service      | eligibility-service   | Reloads the in-memory rule cache            |
| `session.deleted`    | session-service     | eligibility-service   | Deletes that session's evaluations          |
| `evaluation.created` | eligibility-service | — (available to subscribe) | Audit / analytics hook                 |

Payloads are validated with zod (`packages/common/src/contracts/events.js`) on publish and on
consume. Consumers ack after the handler succeeds, de-duplicate by event id and are idempotent, so
replays are safe. `session.deleted` is published **before** the row is deleted, so evaluations are
never orphaned if Redis is down (the DELETE then returns 503 and can be retried).

## Communication rules

- No service reads another service's tables; foreign ids are plain `CHAR(36)` values.
- Sync calls use the typed client in `packages/common` (`createServiceClient`): service token,
  `x-request-id` propagation, 2s timeout, 2 retries with exponential backoff for GET only, opossum
  circuit breaker; network failure or an open breaker → `503 DEPENDENCY_UNAVAILABLE`.
  Exception: gateway → voice-service uses `VOICE_TIMEOUT_MS` (default 10s) because speech
  recognition is slower.
- Verdicts never depend on ai-service or voice-service.

## Public API (gateway, `/v1`)

Success: `{ data, meta }` — Error: `{ error: { code, message, details } }` — every response has
`x-request-id`. Lists take `limit` (max 100) and `offset`.

| Method & path                          | Auth           | Upstream                               |
| -------------------------------------- | -------------- | -------------------------------------- |
| `POST /sessions` → 201                 | —              | session                                |
| `POST /sessions/:id/answers`           | —              | session                                |
| `POST /sessions/:id/evaluate`          | —              | eligibility                            |
| `GET /sessions/:id/results`            | —              | eligibility                            |
| `POST /sessions/:id/explain`           | —              | ai                                     |
| `POST /sessions/:id/extract`           | —              | ai (proposed facts, need confirmation) |
| `DELETE /sessions/:id` → 204           | —              | session (+ `session.deleted`)          |
| `POST /voice/transcribe`, `/voice/speak` | —            | voice                                  |
| `POST /ocr/jobs` → 202, `GET /ocr/jobs/:id` | —         | ocr                                    |
| `GET /schemes`, `GET /schemes/:code`   | —              | scheme                                 |
| `POST /auth/login`                     | —              | gateway (JWT)                          |
| `POST /admin/schemes/:code/versions` → 201 | admin      | scheme                                 |
| `POST /admin/versions/:id/verify`      | operator/admin | scheme (verifiedBy = caller)           |
| `POST /admin/versions/:id/publish`     | admin          | scheme (+ `rule.published`)            |
| `GET /admin/verification-queue`        | operator/admin | scheme                                 |

Every service also exposes `GET /health` and `GET /ready`.

Status codes used: 400 validation, 401/403 auth, 404, 409 (e.g. publish before verify),
422 (e.g. unknown fact, consent missing, rule with no requirements), 429 rate limit,
503 dependency down.

## Rules engine

`services/eligibility-service/src/engine/` — pure JavaScript, no I/O:

- `evaluate(ruleVersion, facts)`: Kleene three-valued logic (`true` / `false` / unknown) over
  `fact`/`all`/`any`/`not`/`anyMember` conditions.
- `NOT_ELIGIBLE` if a requirement is false, an exclusion is true, or `supersededBy` applies
  (IGNWPS → IGNOAPS at 80); `NEEDS_VERIFICATION` if a requirement is unknown; otherwise `LIKELY`
  with unknown exclusions listed in `checksLeft`.
- Every result carries `reasons`, `checksLeft`, `missingFacts`, `firedRules`, `benefits`,
  `checklist`, `source`, `ruleVersion` and `verifiedOn`.
- `planQuestions` re-runs the engine with hypothetical answers and ranks unknown facts by how many
  verdicts (or open checks) one answer would settle.
- Only **confirmed** facts are used. Typed answers are confirmed; voice/OCR/LLM facts must be
  re-sent with `confirmed: true`.

Facts are limited to the catalogue in `packages/common/src/contracts/facts.js`, so names, phone
numbers, Aadhaar numbers and images can't be stored. `ai-service` also strips Aadhaar-like numbers,
phone numbers and e-mails before building any prompt, and logs redact bodies and fact values.

## Seed data (`services/scheme-service/seed-data/schemes.json`)

- **PM-KISAN** (published): requires `household.owns_cultivable_land`; excludes any income-tax payer
  and pensioners at Rs 10,000+/month unless MTS / Class IV / Group D; checklist Aadhaar,
  Aadhaar-seeded bank account, land record details; source PM-KISAN Operational Guidelines §2.4.
- **IGNOAPS** (published): a member aged 60+ and BPL household; Rs 200/month (60–79), Rs 500 (80+);
  checklist empty with status `PENDING_STATE_VERIFICATION`.
- **PMMVY, IGNWPS, IGNDPS, NFBS**: DRAFT versions with TODO notes only (no invented conditions).
  IGNWPS carries only the `supersededBy` IGNOAPS-at-80 link. Publishing a rule with no
  requirements is refused (422).
- Source chunks are short project summaries marked "replace with the official text". Seeded
  versions are marked `verified_by = seed-data` and must be re-verified before real use.

## Setup

### Free hosting

`npm run start:hosted` runs all seven services in one Node process (for Render's free 512 MB
instance) after creating the databases and running migrations and seeders. Full guide:
[../DEPLOY.md](../DEPLOY.md).

### Docker (all services)

```bash
cd backend
npm install                      # creates node_modules; package-lock.json is included
docker compose up --build        # MySQL 8.4, Redis, all services; gateway on :4000
```

Each data-owning container runs `npm run db:migrate && npm run db:seed` (Sequelize CLI) before
starting; seeders are tracked in `sequelize_data`, so restarts don't duplicate data. The admin
account comes from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (defaults in compose are for local
use only — override them, plus `SERVICE_TOKEN`, `JWT_SECRET` and `DB_PASSWORD`).

### Local (without Docker)

```bash
npm install
# MySQL 8.4 + Redis running locally; create databases and user:
mysql -uroot < docker/mysql-init/01-databases.sql   # after: CREATE USER 'rec'@'%' IDENTIFIED BY '...';
for s in services/*; do cp $s/.env.example $s/.env; done
npm run db:migrate && npm run db:seed
# in separate terminals (or use `npm run dev -w @rec/<service>` for watch mode):
(cd services/scheme-service && npm start)   # repeat for every service
npm run smoke                                 # end-to-end check through the gateway
```

### Scripts

Root: `npm run lint | test | check | db:migrate | db:seed | smoke` (`check` = lint + test),
`db:create`, `setup:local`, `start:all` (local, see the repo README) and `start:hosted` (free hosting).
Each service: `dev` (`node --watch`), `start`, `lint`, `test`, `check`, `db:migrate`, `db:seed`.
There is no `build` or `typecheck` script: the code is plain JavaScript.

## Example requests

```bash
GW=http://localhost:4000/v1

# 1. Start a session (consent is required)
SID=$(curl -s $GW/sessions -H 'content-type: application/json' \
  -d '{"language":"hi","consent":true}' | jq -r .data.id)

# 2. Answer questions (members get a short client ref, never a name)
curl -s $GW/sessions/$SID/answers -H 'content-type: application/json' -d '{
  "members": [{ "ref": "me", "relation": "self" }],
  "answers": [
    { "key": "household.owns_cultivable_land", "value": true },
    { "key": "household.bpl_status", "value": true },
    { "key": "member.age", "memberRef": "me", "value": 67 }
  ]}'

# 3. Evaluate: verdicts + next questions
curl -s -X POST $GW/sessions/$SID/evaluate | jq '.data.results[] | {schemeCode, verdict, checksLeft}'
curl -s $GW/sessions/$SID/results
curl -s $GW/sessions/$SID/explain -H 'content-type: application/json' -d '{"language":"en"}'

# 4. Erase everything about the session
curl -s -X DELETE $GW/sessions/$SID -o /dev/null -w '%{http_code}\n'   # 204

# Admin
TOKEN=$(curl -s $GW/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@example.org","password":"change-me-admin-password"}' | jq -r .data.token)
curl -s $GW/admin/verification-queue -H "authorization: Bearer $TOKEN"
```

## Code quality and tests

- Plain JavaScript (ES modules, Node 22). Contracts are zod schemas in `packages/common`, and
  ports (repositories, event bus, LLM, OCR, speech clients) are documented with JSDoc `@typedef`s.
- ESLint (`@eslint/js` recommended + `no-console`, `eqeqeq`, `no-shadow`, …) and Prettier; no
  `console`, pino only.
- Layering per service: `routes → controllers (HTTP only) → services → repositories → models`.
- zod validates every body, param, query, event and env var; services exit on bad config.
- Tests (Vitest + supertest): golden cases for PM-KISAN and IGNOAPS (LIKELY / NOT_ELIGIBLE /
  NEEDS_VERIFICATION), supersededBy, planner, API error cases, contract tests (typed clients vs zod
  contracts), event tests (rule.published reloads cache; session.deleted removes evaluations,
  replay-safe).
- Coverage thresholds: 90% eligibility-service, 80% elsewhere. Adapters that need live
  MySQL/Redis (Sequelize repositories, models, Redis bus, BullMQ wiring, `server.js`) are excluded
  from unit coverage and exercised by the smoke test instead.

## Known limitations (prototype)

- `GET /sessions/:id/results` returns stored verdicts; `nextQuestions` is only filled by
  `POST /evaluate`.
- Session ids are unguessable UUIDs and act as the citizen's capability; there is no citizen login.
- Voice and OCR routes accept larger bodies (`VOICE_MAX_BODY` 1mb, `OCR_MAX_BODY` 2mb); every other
  route keeps the 100kb limit.
- OCR uses a placeholder engine (returns "not found" unless the bytes contain plain-text markers);
  plug a real engine in behind `OcrEngine`. OCR images live in one process's memory, so run one
  ocr-service replica (or add sticky routing) until a different design is chosen.
- `LLM_PROVIDER` only supports `mock`; add real providers behind `LlmProvider`.
- Compose uses one MySQL user with grants on the four databases; use one user per database in a
  real deployment. No hosting/cloud config is included (hosting is undecided).
