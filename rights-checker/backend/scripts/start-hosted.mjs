// Runs all seven services inside ONE Node process, for small free hosts such as Render's free
// web service (512 MB RAM, one public port). Each service keeps its own Express app, port,
// database and Redis streams; only the gateway listens on the public $PORT. The others listen on
// fixed internal ports and talk over 127.0.0.1, exactly like the multi-container setup.
//
// Order: check config -> create the four databases if missing -> run Sequelize CLI migrations and
// seeders -> start the services (scheme, session, eligibility, ai, voice, ocr, gateway).
// Usage: npm run start:hosted   (env vars come from the hosting dashboard; see DEPLOY.md)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mysqlSslOptions } from '@rec/common';
import mysql from 'mysql2/promise';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SEQUELIZE_CLI = join(dirname(require.resolve('sequelize-cli/package.json')), 'lib/sequelize');

const REQUIRED = [
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'REDIS_URL',
  'SERVICE_TOKEN',
  'JWT_SECRET',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASSWORD',
];
// One-service deploy: if the frontend was built (npm run build at the repo root), serve it too.
const BUILT_FRONTEND = resolve(ROOT, '../frontend/dist');
if (!process.env.FRONTEND_DIST && existsSync(join(BUILT_FRONTEND, 'index.html'))) {
  process.env.FRONTEND_DIST = BUILT_FRONTEND;
}
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')} (see DEPLOY.md)`);
  process.exit(1);
}

process.env.NODE_ENV ??= 'production';
const PUBLIC_PORT = process.env.PORT ?? '4000';
const INTERNAL = {
  session: 4101,
  eligibility: 4102,
  scheme: 4103,
  ai: 4104,
  voice: 4105,
  ocr: 4106,
};
const local = (port) => `http://127.0.0.1:${port}`;
const URLS = {
  SESSION_SERVICE_URL: local(INTERNAL.session),
  ELIGIBILITY_SERVICE_URL: local(INTERNAL.eligibility),
  SCHEME_SERVICE_URL: local(INTERNAL.scheme),
  AI_SERVICE_URL: local(INTERNAL.ai),
  VOICE_SERVICE_URL: local(INTERNAL.voice),
  OCR_SERVICE_URL: local(INTERNAL.ocr),
};

/** Per-service overrides on top of the shared environment. `db` = database name, if any. */
const SERVICES = [
  { dir: 'scheme-service', db: 'scheme_db', env: { PORT: INTERNAL.scheme } },
  { dir: 'session-service', db: 'session_db', env: { PORT: INTERNAL.session } },
  {
    dir: 'eligibility-service',
    db: 'eligibility_db',
    env: { PORT: INTERNAL.eligibility, ...URLS },
  },
  { dir: 'ai-service', env: { PORT: INTERNAL.ai, ...URLS } },
  { dir: 'voice-service', env: { PORT: INTERNAL.voice } },
  { dir: 'ocr-service', env: { PORT: INTERNAL.ocr } },
  { dir: 'api-gateway', db: 'auth_db', env: { PORT: PUBLIC_PORT, ...URLS } },
];

const envFor = (service) => ({
  ...process.env,
  ...Object.fromEntries(Object.entries(service.env).map(([k, v]) => [k, String(v)])),
  ...(service.db ? { DB_NAME: service.db } : {}),
});

async function createDatabases() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: mysqlSslOptions({
      DB_SSL: process.env.DB_SSL === 'true',
      DB_SSL_CA: process.env.DB_SSL_CA,
    }),
  });
  for (const { db } of SERVICES.filter((s) => s.db)) {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  }
  await connection.end();
  console.log('databases ready');
}

function runCli(service, command) {
  const run = spawnSync(process.execPath, [SEQUELIZE_CLI, command], {
    cwd: join(ROOT, 'services', service.dir),
    env: envFor(service),
    stdio: 'inherit',
  });
  if (run.status !== 0) {
    console.error(`${service.dir}: sequelize-cli ${command} failed`);
    process.exit(1);
  }
}

try {
  await createDatabases();
} catch (err) {
  console.error(`Could not prepare databases on ${process.env.DB_HOST}: ${err.message}`);
  console.error('Check DB_HOST/DB_PORT/DB_USER/DB_PASSWORD and set DB_SSL=true for cloud MySQL.');
  process.exit(1);
}

for (const service of SERVICES.filter((s) => s.db)) {
  runCli(service, 'db:migrate');
  runCli(service, 'db:seed:all');
}

// Each server.js reads its configuration when it is imported, so set that service's environment
// right before importing it. Values already read by earlier services are not affected.
for (const service of SERVICES) {
  Object.assign(process.env, envFor(service));
  await import(pathToFileURL(join(ROOT, 'services', service.dir, 'src/server.js')).href);
  console.log(`started ${service.dir} on port ${service.env.PORT}`);
}
console.log(`All services running. Public API: port ${PUBLIC_PORT}, path /v1`);
