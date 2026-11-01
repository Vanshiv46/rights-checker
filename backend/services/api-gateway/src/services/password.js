import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

function scrypt(password, salt, options) {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Hashes as `scrypt$N$r$p$saltB64$hashB64` (the seeder writes the same format). */
export async function hashPassword(password) {
  const options = { N: 16384, r: 8, p: 1 };
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, options);
  return [
    'scrypt',
    options.N,
    options.r,
    options.p,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/** Constant-time check of a password against a stored hash; false for malformed hashes. */
export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
