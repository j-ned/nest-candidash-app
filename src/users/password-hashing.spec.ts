import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { hashPassword, verifyPassword } from './password-hashing';

describe('password hashing', () => {
  it('hashes with argon2id in the standard PHC format (OWASP parameters)', async () => {
    const hash = await hashPassword('Mot-de-passe-2026!');

    expect(hash).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
    );
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('verifies an argon2id hash without asking for a rehash', async () => {
    const hash = await hashPassword('Mot-de-passe-2026!');

    await expect(verifyPassword(hash, 'Mot-de-passe-2026!')).resolves.toEqual({
      valid: true,
      needsRehash: false,
    });
    await expect(verifyPassword(hash, 'faux')).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it.each(['$2a$', '$2b$'])(
    'accepts a legacy bcrypt (%s) hash and asks for a rehash',
    async (prefix) => {
      const hash = bcrypt.hashSync('ancien', 4).replace(/^\$2[ab]\$/, prefix);

      await expect(verifyPassword(hash, 'ancien')).resolves.toEqual({
        valid: true,
        needsRehash: true,
      });
      await expect(verifyPassword(hash, 'faux')).resolves.toEqual({
        valid: false,
        needsRehash: false,
      });
    },
  );

  it('accepts a legacy SHA-256 hash and asks for a rehash', async () => {
    const hash = crypto
      .createHash('sha256')
      .update('très-ancien')
      .digest('hex');

    await expect(verifyPassword(hash, 'très-ancien')).resolves.toEqual({
      valid: true,
      needsRehash: true,
    });
    await expect(verifyPassword(hash, 'faux')).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it.each(['', 'garbage', '$argon2id$cassé'])(
    'rejects an unusable stored hash %p',
    async (stored) => {
      await expect(verifyPassword(stored, 'x')).resolves.toEqual({
        valid: false,
        needsRehash: false,
      });
    },
  );
});
