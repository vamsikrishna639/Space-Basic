import bcrypt from 'bcrypt';
import { env } from '../../config/env';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_COST);
}

let dummy: Promise<string> | null = null;

/**
 * Compare a password with a stored hash. When there is no user / no hash, compare against a dummy hash
 * anyway so the response time doesn't reveal whether the account exists.
 */
export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    dummy ??= bcrypt.hash('spacebasic-timing-equaliser', env.BCRYPT_COST);
    await bcrypt.compare(plain, await dummy);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
