# Rights & Entitlements Checker

Tells Indian citizens which government schemes **may** apply to their household, why, and which
documents they need. Verdicts (`Likely`, `Needs verification`, `Not eligible`) come only from a
deterministic rules engine; the AI layer only explains them.

| Folder      | What it is                                                                   |
| ----------- | ---------------------------------------------------------------------------- |
| `backend/`  | 7 Node.js + Express microservices (JavaScript), MySQL, Redis Streams, BullMQ |
| `frontend/` | React + Vite PWA (Hindi/English, voice, offline answers)                     |

## How it works

Citizens fill **one form**: for each household member they give relation, age, sex and pick an
**occupation** from a dropdown. The questions that follow depend on the answers (a farmer sees the
land question, a retired government employee sees pension, a student sees nothing extra). The
questions come from the backend (`GET /v1/form`, defined in
`backend/packages/common/src/contracts/form.js`), so adding a question or a scheme needs no
frontend change. Questions that stay hidden stay unknown, so a verdict that needs them is
"Needs verification", never a guess.

## Run locally

Needs Node.js 22+, MySQL 8 and Redis (on Windows: [Memurai](https://www.memurai.com/)).

One command per step from this folder (needs Node.js 22+, MySQL 8, Redis):

```bash
npm run install:all    # installs backend and frontend
npm run setup:local    # creates databases, .env files, migrations, seed data
npm run dev            # backend (gateway :4000) + frontend (http://localhost:5173)
npm run check          # lint, typecheck, tests and build for both
```

Or step by step:

```bash
# backend
cd backend
npm install
npm run db:create      # creates the 4 databases (asks for the MySQL root password)
npm run setup:local    # .env files, migrations, seed data
npm run start:all      # all services; API gateway on http://localhost:4000/v1
npm run smoke          # end-to-end check (second terminal)

# frontend
cd frontend
npm install
cp .env.example .env   # Windows: copy .env.example .env
npm run dev            # http://localhost:5173
```

With Docker instead: `cd backend && docker compose up --build`.

## AI and voice keys

- **Groq** (`GROQ_API_KEY`, ai-service): writes the plain-language explanations and extracts facts
  from free text. If Groq fails, the built-in template answers instead. Verdicts always come from
  the rules engine, never from the AI.
- **Voice** (same `GROQ_API_KEY`, voice-service): speech to text with Groq's hosted Whisper. Reading
  text aloud uses the browser's built-in speech. Without a key, voice answers 503 and citizens
  tap their answers. No Bhashini account is needed.

Local: put them in `backend/services/ai-service/.env` and `backend/services/voice-service/.env`.
Docker: copy `backend/.env.example` to `backend/.env` and fill them in. Hosting: Render dashboard.

## Deploy for free

See [DEPLOY.md](DEPLOY.md): the whole app (API and website) as ONE free Render service, MySQL on
Aiven, Redis on Redis Cloud. No Vercel and no CORS setup needed.

More detail: [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md).
