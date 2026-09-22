import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Пароли консультантов. scrypt из стандартной библиотеки: дополнительная
 * зависимость ради этого не нужна, а стойкость к перебору он даёт.
 */

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  if (password.length < 8) throw new Error('Пароль короче восьми символов');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(expected, candidate);
}
