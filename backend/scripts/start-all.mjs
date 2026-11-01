// Starts all seven services in one terminal with prefixed output. Ctrl+C stops them all.
// Usage: npm run start:all   (after npm run setup:local; MySQL and Redis/Memurai must be running)
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

const SERVICES = [
  { name: 'scheme', dir: 'scheme-service', color: 36 },
  { name: 'session', dir: 'session-service', color: 35 },
  { name: 'eligibility', dir: 'eligibility-service', color: 33 },
  { name: 'ai', dir: 'ai-service', color: 32 },
  { name: 'voice', dir: 'voice-service', color: 34 },
  { name: 'ocr', dir: 'ocr-service', color: 90 },
  { name: 'gateway', dir: 'api-gateway', color: 31 },
];

function envValue(dir, key, fallback) {
  const file = join('services', dir, '.env');
  if (!existsSync(file)) return fallback;
  return new RegExp(`^${key}=(.*)$`, 'm').exec(readFileSync(file, 'utf8'))?.[1]?.trim() || fallback;
}

function reachable(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 1500 });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function preflight() {
  const missing = SERVICES.filter((s) => !existsSync(join('services', s.dir, '.env')));
  if (missing.length > 0) {
    console.error('Missing .env files. Run first: npm run setup:local');
    process.exit(1);
  }
  const dbHost = envValue('scheme-service', 'DB_HOST', '127.0.0.1');
  const dbPort = Number(envValue('scheme-service', 'DB_PORT', '3306'));
  const redis = new URL(envValue('scheme-service', 'REDIS_URL', 'redis://127.0.0.1:6379'));
  const checks = [
    ['MySQL', dbHost, dbPort, 'Start the MySQL80 service (services.msc) or your MySQL server.'],
    [
      'Redis',
      redis.hostname,
      Number(redis.port || 6379),
      'Start Redis (Windows: install and start Memurai).',
    ],
  ];
  let ok = true;
  for (const [label, host, port, hint] of checks) {
    if (await reachable(host, port)) {
      console.log(`ok   ${label} on ${host}:${port}`);
    } else {
      console.error(`FAIL ${label} is not reachable on ${host}:${port}. ${hint}`);
      ok = false;
    }
  }
  if (!ok) process.exit(1);
}

const children = [];
let stopping = false;

function prefixLines(prefix, stream, target) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) if (line) target.write(`${prefix} ${line}\n`);
  });
}

function start(service) {
  const prefix = `\x1b[${service.color}m[${service.name.padEnd(11)}]\x1b[0m`;
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: join('services', service.dir),
    env: process.env,
  });
  prefixLines(prefix, child.stdout, process.stdout);
  prefixLines(prefix, child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping)
      console.error(`${prefix} stopped unexpectedly (exit code ${code}). See the lines above.`);
  });
  children.push(child);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForGateway() {
  const port = envValue('api-gateway', 'PORT', '4000');
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ready`);
      if (res.ok) {
        console.log(
          `\n\x1b[32mAll services started. API gateway: http://localhost:${port}/v1\x1b[0m`,
        );
        console.log('Check it with: npm run smoke    Stop with: Ctrl+C\n');
        return;
      }
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  console.error('Gateway did not become ready within 60s. Check the logs above.');
}

function stopAll() {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping services...');
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

await preflight();
for (const service of SERVICES) {
  start(service);
  await sleep(700);
}
await waitForGateway();
