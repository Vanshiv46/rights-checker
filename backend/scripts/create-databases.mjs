// Creates the four databases and the `rec` user on a local MySQL (no mysql CLI needed).
// Usage: npm run db:create   (asks for the MySQL root password, or set MYSQL_ROOT_PASSWORD)
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import mysql from 'mysql2/promise';

const DATABASES = ['auth_db', 'session_db', 'eligibility_db', 'scheme_db'];

/** Reads DB_* from the gateway's .env (or .env.example) so passwords stay in one place. */
function dbSettings() {
  for (const file of ['services/api-gateway/.env', 'services/api-gateway/.env.example']) {
    try {
      const text = readFileSync(file, 'utf8');
      const get = (key) => new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1]?.trim();
      return {
        host: get('DB_HOST') ?? '127.0.0.1',
        port: Number(get('DB_PORT') ?? 3306),
        user: get('DB_USER') ?? 'rec',
        password: get('DB_PASSWORD') ?? 'rec-dev-password',
      };
    } catch {
      // try the next file
    }
  }
  throw new Error('services/api-gateway/.env.example not found: run this from the backend folder');
}

async function rootPassword() {
  if (process.env.MYSQL_ROOT_PASSWORD !== undefined) return process.env.MYSQL_ROOT_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('MySQL root password: ');
  rl.close();
  return answer;
}

const app = dbSettings();
const connection = await mysql
  .createConnection({
    host: app.host,
    port: app.port,
    user: process.env.MYSQL_ROOT_USER ?? 'root',
    password: await rootPassword(),
  })
  .catch((err) => {
    console.error(
      `\nCould not connect to MySQL at ${app.host}:${app.port} as root: ${err.message}`,
    );
    console.error('Is the MySQL service running? (Windows: services.msc -> MySQL80 -> Start)');
    process.exit(1);
  });

for (const host of ['localhost', '%']) {
  await connection.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [
    app.user,
    host,
    app.password,
  ]);
}
for (const db of DATABASES) {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  for (const host of ['localhost', '%']) {
    await connection.query(`GRANT ALL PRIVILEGES ON \`${db}\`.* TO ?@?`, [app.user, host]);
  }
}
await connection.query('FLUSH PRIVILEGES');
await connection.end();
console.log(`Databases ready: ${DATABASES.join(', ')} (user "${app.user}")`);
