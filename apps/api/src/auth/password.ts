import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [salt, value] = encoded.split(':');
  if (!salt || !value || !/^[a-f0-9]{128}$/.test(value)) return false;
  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(candidate, Buffer.from(value, 'hex'));
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
