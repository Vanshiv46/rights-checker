'use strict';

const { randomBytes, randomUUID, scryptSync } = require('node:crypto');

/** Same self-describing format the gateway verifies: scrypt$N$r$p$saltB64$hashB64 */
function hashPassword(password) {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

/**
 * Creates the first admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (never hard-coded).
 * @type {import('sequelize-cli').Seed}
 */
module.exports = {
  async up(queryInterface) {
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password || password.length < 12) {
      throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ chars) to seed the admin');
    }
    const now = new Date();
    await queryInterface.bulkInsert('operators', [
      {
        id: randomUUID(),
        email: email.toLowerCase(),
        password_hash: hashPassword(password),
        role: 'admin',
        active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },
  async down(queryInterface) {
    const email = process.env.SEED_ADMIN_EMAIL;
    if (email) await queryInterface.bulkDelete('operators', { email: email.toLowerCase() });
  },
};
