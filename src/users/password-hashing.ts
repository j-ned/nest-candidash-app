import { hash, verify, type Options } from '@node-rs/argon2';
import * as bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'crypto';

// Paramètres minimaux recommandés par l'OWASP pour argon2id (19 Mio, 2 passes, 1 fil).
// `Algorithm` est un const enum ambiant (inutilisable avec isolatedModules) : 2 = Argon2id.
const ARGON2ID_OPTIONS: Options = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const ARGON2ID_PREFIX = '$argon2id$';
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface PasswordCheck {
  valid: boolean;
  /** Mot de passe correct mais haché avec un ancien algorithme : à re-hacher en argon2id. */
  needsRehash: boolean;
}

const INVALID: PasswordCheck = { valid: false, needsRehash: false };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_OPTIONS);
}

/** Vérifie argon2id, et les anciens hachages bcrypt et SHA-256 pour la migration progressive. */
export async function verifyPassword(
  stored: string,
  password: string,
): Promise<PasswordCheck> {
  try {
    if (stored.startsWith(ARGON2ID_PREFIX)) {
      return { valid: await verify(stored, password), needsRehash: false };
    }
    if (BCRYPT_HASH.test(stored)) {
      return (await bcrypt.compare(password, stored))
        ? { valid: true, needsRehash: true }
        : INVALID;
    }
    if (SHA256_HEX.test(stored)) {
      const candidate = createHash('sha256').update(password).digest();
      const valid = timingSafeEqual(candidate, Buffer.from(stored, 'hex'));
      return valid ? { valid: true, needsRehash: true } : INVALID;
    }
  } catch {
    // Hachage stocké illisible : traité comme un échec, jamais comme une erreur 500
  }
  return INVALID;
}
