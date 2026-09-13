import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;

export const PASSWORD_HASH_INPUT_ERROR =
  'Use `password` for plaintext secrets; `passwordHash` only accepts bcrypt hashes';
export const PASSWORD_UPDATE_ERROR =
  'Password updates must use the dedicated password hashing flow';
export const PASSWORD_REPLACE_ERROR =
  'Replacement documents must preserve a valid passwordHash';

export function isBcryptHash(value: string): boolean {
  if (!BCRYPT_HASH_PATTERN.test(value)) {
    return false;
  }

  try {
    const rounds = bcrypt.getRounds(value);
    return Number.isInteger(rounds) && rounds >= 4 && rounds <= 31;
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}
