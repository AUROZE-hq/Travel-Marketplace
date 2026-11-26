import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * OWASP-recommended Argon2id parameters:
 * Memory: 64 MB (65536 KB)
 * Iterations (timeCost): 3
 * Parallelism: 4
 * Output length: 32 bytes
 */
const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
};

/**
 * Hash a password using Argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a password against either an Argon2id hash or legacy scrypt hash.
 * If legacy scrypt hash is matched, returns `needsRehash: true` so the caller
 * can transparently upgrade the hash to Argon2id.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!storedHash || storedHash === '!disabled') {
    return { valid: false, needsRehash: false };
  }

  // 1. Argon2 hash format ($argon2id$ / $argon2i$ / $argon2d$)
  if (storedHash.startsWith('$argon2')) {
    try {
      const valid = await argonVerify(storedHash, password);
      return { valid, needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // 2. Legacy scrypt format from seed.ts:
  //    scrypt$N=16384,r=8,p=1$<salt base64>$<hash base64>
  if (storedHash.startsWith('scrypt$')) {
    try {
      const parts = storedHash.split('$');
      if (parts.length === 5) {
        const saltB64 = parts[3];
        const hashB64 = parts[4];
        if (saltB64 && hashB64) {
          const salt = Buffer.from(saltB64, 'base64');
          const expectedHash = Buffer.from(hashB64, 'base64');
          const computedHash = scryptSync(password, salt, expectedHash.length, {
            N: 16384,
            r: 8,
            p: 1,
          });

          if (
            computedHash.length === expectedHash.length &&
            timingSafeEqual(computedHash, expectedHash)
          ) {
            return { valid: true, needsRehash: true };
          }
        }
      }
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  return { valid: false, needsRehash: false };
}

/**
 * Dummy password verification to prevent timing discrepancies when a user is not found.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRmb3JkdW1teQ$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function dummyPasswordVerification(password: string): Promise<void> {
  try {
    await argonVerify(DUMMY_HASH, password);
  } catch {
    // Intentionally suppressed
  }
}
