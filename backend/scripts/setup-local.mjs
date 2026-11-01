// Copies every service's .env.example to .env (keeps existing .env files), then runs the
// Sequelize CLI migrations and seeders. Usage: npm run setup:local
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

for (const name of readdirSync('services')) {
  const example = join('services', name, '.env.example');
  const env = join('services', name, '.env');
  if (!existsSync(example)) continue;
  if (existsSync(env)) {
    console.log(`keep    ${env}`);
  } else {
    copyFileSync(example, env);
    console.log(`created ${env}`);
  }
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const script of ['db:migrate', 'db:seed']) {
  console.log(`\n> npm run ${script}`);
  const run = spawnSync(npm, ['run', script], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (run.status !== 0) {
    console.error(
      `\nnpm run ${script} failed. Did you run "npm run db:create" and is MySQL running?`,
    );
    process.exit(run.status ?? 1);
  }
}
console.log('\nSetup done. Start everything with: npm run start:all');
