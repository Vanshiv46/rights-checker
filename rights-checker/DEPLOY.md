# Deploying for free

| Part  | Host                                          | Free plan used                                                     |
| ----- | --------------------------------------------- | ------------------------------------------------------------------ |
| App   | [Render](https://render.com) free web service | Website + API in one service; 512 MB RAM, sleeps after 15 min idle |
| MySQL | [Aiven](https://aiven.io) free MySQL          | 1 GB RAM, 1 GB storage, no card; may power off when unused         |
| Redis | [Redis Cloud](https://redis.io/cloud/) free   | 30 MB, 30 connections, 100 ops/s                                   |

Free plans change; check each provider's page before the demo.

The free Render instance runs **all seven services in one Node process** (`npm run start:hosted`):
each keeps its own Express app, port, database and Redis streams, but only the gateway is public.
It used about 180 MB of RAM in testing. Locally and with Docker the services still run as
separate processes/containers.

## 0. Prepare two secrets

Run twice and keep both values (one for `SERVICE_TOKEN`, one for `JWT_SECRET`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Also choose the admin login: `SEED_ADMIN_EMAIL` and a `SEED_ADMIN_PASSWORD` (12+ characters).

## 1. MySQL on Aiven

1. Sign up at aiven.io → **Create service** → **MySQL** → **Free plan** → pick a region near your
   Render region (e.g. Singapore for India) → create.
2. When it is "Running", open **Overview → Connection information** and note **Host**, **Port**,
   **User** (`avnadmin`) and **Password**.
3. Optional (verified TLS): download the **CA certificate**; you can paste its text into
   `DB_SSL_CA`. Without it the connection is still encrypted (`DB_SSL=true`) but the server
   certificate is not verified.

The backend creates `auth_db`, `session_db`, `eligibility_db` and `scheme_db` itself on first
start.

## 2. Redis on Redis Cloud

1. Sign up at redis.io/cloud → create the **free** database (30 MB).
2. Copy the public endpoint and the `default` user password and build the URL:
   `redis://default:<password>@<host>:<port>`
3. If the database settings offer an **eviction policy**, choose `noeviction` (BullMQ jobs must not
   be evicted).

## 3. The app on Render (website + API together)

The gateway serves the built website from the same address as the API, so you deploy one service
and one URL. (Section 4 explains the optional split with Vercel.)

1. render.com → **New → Web Service** → connect your GitHub repo.
2. Settings:
   - **Root Directory:** leave empty (repo root)
   - **Runtime:** Node 22 (set `NODE_VERSION` = `22` if needed)
   - **Build Command:** `npm run install:all && npm run build`
   - **Start Command:** `npm start`
   - **Instance type:** Free
   - **Health Check Path:** `/health`
3. **Environment variables:**

| Key                   | Value                                                    |
| --------------------- | -------------------------------------------------------- |
| `DB_HOST`             | Aiven host                                               |
| `DB_PORT`             | Aiven port                                               |
| `DB_USER`             | `avnadmin`                                               |
| `DB_PASSWORD`         | Aiven password                                           |
| `DB_SSL`              | `true`                                                   |
| `DB_SSL_CA`           | (optional) CA certificate text                           |
| `DB_POOL_MAX`         | `5`                                                      |
| `REDIS_URL`           | `redis://default:<password>@<host>:<port>`               |
| `SERVICE_TOKEN`       | secret 1                                                 |
| `JWT_SECRET`          | secret 2                                                 |
| `CORS_ORIGINS`        | optional; only needed if the website is hosted elsewhere |
| `SEED_ADMIN_EMAIL`    | your admin e-mail                                        |
| `SEED_ADMIN_PASSWORD` | your admin password                                      |
| `LOG_LEVEL`           | `info`                                                   |

AI and voice keys (the app still works without them, using template explanations and tap
answers):

| Key                | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| `GROQ_API_KEY`     | from console.groq.com → API Keys (AI explanations, fact extraction and voice) |
| `GROQ_MODEL`       | optional, default `llama-3.3-70b-versatile`                          |

4. Deploy. The log should end with `All services running. Public API: port …, path /v1`.
   Check `https://<your-service>.onrender.com/health` in the browser.

## 4. Optional: website on Vercel instead

1. vercel.com → **Add New → Project** → import the same GitHub repo.
2. **Root Directory:** `frontend` (framework preset Vite is detected; build `npm run build`,
   output `dist`).
3. **Environment variables:**
   - `VITE_API_URL` = `https://<your-service>.onrender.com` (no trailing slash)
   - `VITE_USE_MOCK` = `false`
4. Deploy and note the production URL, e.g. `https://rights-checker.vercel.app`.

`frontend/vercel.json` sends every route to `index.html`, so links like `/results` work on reload.

## 5. Only if you split: connect them (CORS)

On Render, set `CORS_ORIGINS` to both origins, comma-separated, without trailing slashes:

```
https://rights-checker.vercel.app,http://localhost:5173
```

Save; Render redeploys. Open the Vercel URL and run through the flow.

Open `https://<your-service>.onrender.com` to use the app.

## 6. Keep it awake for the demo

The free Render service sleeps after 15 minutes without traffic and takes about a minute to wake;
the frontend's first calls may time out while it wakes. Either open
`https://<your-service>.onrender.com/ready` a minute before demoing, or create a free job at
[cron-job.org](https://cron-job.org) that calls `/ready` every 10 minutes (this also keeps the
Aiven database active). One service running all month stays within Render's 750 free hours.

## 7. Test the live backend from your PC

```bash
cd backend
# PowerShell:
$env:BASE_URL="https://<your-service>.onrender.com"; $env:ADMIN_EMAIL="<admin e-mail>"; $env:ADMIN_PASSWORD="<admin password>"; npm run smoke
# bash:
BASE_URL=https://<your-service>.onrender.com ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run smoke
```

## Updating

Every `git push` to `main` redeploys Render automatically (and Vercel, if you use it).

## Limits to know

- Never commit `.env` files or secrets; set them only in the Render/Vercel dashboards.
- The free Render filesystem is temporary; all data lives in Aiven MySQL and Redis Cloud.
- Free Redis Cloud has no backups; losing it only loses in-flight events and OCR jobs.
- Staff tokens live in browser memory, so reloading the page logs staff out.
