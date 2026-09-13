import bcrypt from 'bcryptjs';

export const DUMMY_PASSWORD_HASH = '$2b$12$3DURwPvKjvcmc41gQgZN0eodeYx8b9hV2.oPIgsdNUnC05kdTeYba';

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
