import { defineConfig } from 'vitest/config';

/** Adapters that need a live MySQL/Redis are covered by the smoke test, not unit coverage. */
const INFRA_ONLY = [
  'src/server.js',
  'src/config/**',
  'src/models/**',
  'src/repositories/sequelize-*.js',
  'src/db.js',
  'src/lifecycle.js',
  'src/events/redis-event-bus.js',
  'src/jobs/bullmq-*.js',
  'src/index.js',
  'src/**/types.js',
];

/**
 * Shared Vitest config with a coverage threshold.
 * @param {number} threshold minimum % for lines, functions, branches and statements
 */
export function vitestConfig(threshold) {
  return defineConfig({
    test: {
      environment: 'node',
      include: ['test/**/*.test.js'],
      env: { LOG_LEVEL: 'silent' },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.js'],
        exclude: INFRA_ONLY,
        reporter: ['text-summary'],
        thresholds: {
          lines: threshold,
          functions: threshold,
          branches: threshold,
          statements: threshold,
        },
      },
    },
  });
}
