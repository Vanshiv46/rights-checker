# Rights & Entitlements Checker: Frontend

React + Vite + TypeScript PWA. It never decides eligibility: it shows the verdicts returned by the
api-gateway (`/v1`). Verdict words are **Likely**, **Needs verification** and **Not eligible**;
"Eligible" is never shown.

## Setup

```bash
npm install
cp .env.example .env      # points at the api-gateway on http://localhost:4000
npm run dev               # http://localhost:5173
```

To run without a backend, set `VITE_USE_MOCK=true` in `.env`.

### Connecting to the backend

1. Start the backend (in `backend/`): `docker compose up --build`, or run the services locally as
   its README describes. The gateway listens on `http://localhost:4000`.
2. Make sure the gateway allows this app's origin: `CORS_ORIGINS` defaults to
   `http://localhost:5173,http://localhost:4173` (dev server and preview/e2e). Add your real domain
   when you deploy.
3. In this folder: `cp .env.example .env` (`VITE_API_URL=http://localhost:4000`,
   `VITE_USE_MOCK=false`) and `npm run dev`.
4. Staff login (`/operator`) uses the operator account's **e-mail** and password. The first admin is
   created by the backend seeder from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
5. Optional live browser test against the running backend:
   `E2E_MODE=live npx playwright test e2e/live.spec.ts` (uses `.env.live`; set `ADMIN_EMAIL` and
   `ADMIN_PASSWORD` if you changed the seed account).

| Script              | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Dev server                                         |
| `npm run build`     | Typecheck + production build (with service worker) |
| `npm run preview`   | Serve the production build                         |
| `npm run lint`      | ESLint (zero warnings) + Prettier check            |
| `npm run typecheck` | `tsc --noEmit` (strict)                            |
| `npm test`          | Vitest + React Testing Library                     |
| `npm run e2e`       | Playwright full flow against the mock API          |
| `npm run check`     | lint + typecheck + test + build                    |

E2E needs a browser: `npx playwright install chromium` once. To use an existing Chromium instead,
set `CHROMIUM_PATH=/path/to/chromium`.

## Environment

- `VITE_API_URL`: base URL of the api-gateway (default `http://localhost:4000`).
- `VITE_USE_MOCK`: `true` serves the built-in mock (PM-KISAN LIKELY; IGNOAPS for the mother,
  NEEDS_VERIFICATION, `PENDING_STATE_VERIFICATION`). The mock is a separate chunk and is not
  shipped when the flag is off.

## Screens

| Route              | Screen        | Purpose                                                   |
| ------------------ | ------------- | --------------------------------------------------------- |
| `/`                | Language      | Hindi / English, resume an unfinished session             |
| `/consent`         | Consent       | Plain-words consent, creates the session                  |
| `/household`       | Household     | Add members (relation, age, sex)                          |
| `/questions`       | Questions     | One question per screen: tap, voice, "I don't know"       |
| `/results`         | Results       | One SchemeCard per scheme and member                      |
| `/scheme/:code`    | SchemeDetail  | Why, benefit, to verify, documents, source, next step     |
| `/checklist/:code` | Checklist     | Tick boxes grouped mandatory / conditional / optional     |
| `/saved`           | SavedResults  | Short code, last-evaluated date, check again, load, erase |
| `/operator`        | OperatorLogin | CSC staff login; the same flow runs in assisted mode      |
| `/admin`           | AdminRules    | Rule versions and verification queue (admin role)         |

## How the frontend talks to the backend

All calls go through `src/lib/api.ts`, which picks the mock client or the real gateway client
(`src/lib/gateway.ts`). The gateway client converts between the screens' shapes (`src/lib/types.ts`)
and the backend contract with the pure functions in `src/lib/adapters.ts`, so screens and hooks
don't know which one they use.

| Screen action         | Gateway call                                              | Mapping                                                                                               |
| --------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Consent               | `POST /v1/sessions`                                       | `{ id }` → `sessionId`                                                                                |
| Household → Continue  | `POST /v1/sessions/:id/answers`                           | members by short ref, relation mother/father → `parent`, son/daughter → `child`; ages as `member.age` |
| Answer a question     | `POST /v1/sessions/:id/answers`                           | land/BPL → household facts; tax/pension ("anyone…") → per-member facts; "I don't know" sends nothing  |
| Voice answer          | `POST /v1/voice/transcribe`                               | audio sent as base64 JSON; the text is read as yes/no (Hindi or English)                              |
| Results               | `POST …/evaluate`, `GET …/results`                        | engine results → scheme cards; `evaluatedAt` kept; 404 (never evaluated) triggers an evaluation       |
| Explain               | `POST /v1/sessions/:id/explain`                           | sends the chosen language; shows the text and first citation for the scheme                           |
| Scheme detail         | `GET /v1/schemes/:code`                                   | benefit text from the rule's benefits                                                                 |
| Saved results → Erase | `DELETE /v1/sessions/:id`                                 | also removes the local member links                                                                   |
| Staff login, Admin    | `POST /v1/auth/login`, `GET /v1/admin/verification-queue` | e-mail + password → JWT kept in memory; queue items from draft versions                               |

The backend has no "next question" endpoint, so the question order comes from
`src/lib/questions.ts` both online and offline. The frontend keeps a small per-session record in
IndexedDB (`gateway:<sessionId>`) with the backend ids of household members and the answered
question ids.

Known gaps:

- Removing a member after the household was sent does not remove it on the backend (there is no
  delete-member endpoint yet); start a new session instead.
- Sex is not sent: the backend stores only catalogue facts and no published rule uses it.
- The tax/pension questions are household-wide. "No" is stored for every member; "yes" is stored on
  the first member (pension "yes" as Rs 10,000, the rule's threshold), so PM-KISAN may then list the
  pensioner's staff category as still to check.
- Results are per household (no per-member cards) and have no "next step" link yet.
- Browsers record voice as WebM/Opus; they are converted to 16 kHz WAV before upload.
- The staff token is in memory only, so reloading the page logs staff out.

## Offline

Workbox pre-caches the app shell and both language files. While offline, answers go to an
IndexedDB queue and are sent oldest-first when the connection returns; the next question comes from
the bundled question list. Results are cached per session and open offline with a banner showing
the last-evaluated date. The voice and listen buttons are hidden offline.
