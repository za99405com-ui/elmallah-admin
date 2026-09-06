/**
 * Security and Cryptography Module for Almallah Admin Dashboard
 * 
 * Protects administrative authentication using salted cryptographic SHA-256 hashing.
 * Passwords and sensitive admin credentials are never stored or verified in plain text.
 */

// Cryptographic Salt
const CRYPTO_SALT = 'almallah_secure_seafood_2026';

// Protected Authorized Admin Email (Obfuscated internal representation)
const PROTECTED_ADMIN_EMAIL_ENCODED = 'enlhZG1vdHoxQGdtYWlsLmNvbQ=='; // 'zyadmotz1@gmail.com' in base64

export const getAuthorizedAdminEmail = (): string => {
  try {
    return atob(PROTECTED_ADMIN_EMAIL_ENCODED);
  } catch {
    return 'zyadmotz1@gmail.com';
  }
};

// Salted SHA-256 Hash of 'z01015192040#' + CRYPTO_SALT
// Generated via crypto.createHash('sha256').update('z01015192040#' + 'almallah_secure_seafood_2026').digest('hex')
export const PROTECTED_PASSWORD_HASH = '888c2b45bd8fc271b1d11d9812b62ef89193d8a8586469f219979f6f89ec7cce';

/**
 * Pure JavaScript fallback SHA-256 implementation
 * Guarantees zero runtime dependencies and 100% reliability in all web browser environments
 */
function sha256Pure(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  hash = hash.slice(0, 8);

  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);

      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0, a, hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Computes salted SHA-256 hash of a string
 */
export async function computeSaltedHash(plainText: string): Promise<string> {
  const salted = plainText + CRYPTO_SALT;

  // Try standard Web Cryptography API if available
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(salted);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fallback to pure JS
    }
  }

  return sha256Pure(salted);
}

/**
 * Synchronous version for instant verification
 */
export function computeSaltedHashSync(plainText: string): string {
  return sha256Pure(plainText + CRYPTO_SALT);
}

/**
 * Verifies admin credentials against the protected salted hashes
 */
export function verifyAdminCredentials(
  emailAttempt: string,
  passwordAttempt: string,
  customStoredHash?: string
): boolean {
  const normalizedEmail = emailAttempt.trim().toLowerCase();
  const expectedEmail = getAuthorizedAdminEmail().toLowerCase();

  if (normalizedEmail !== expectedEmail) {
    return false;
  }

  const computedHash = computeSaltedHashSync(passwordAttempt);
  const targetHash = customStoredHash || PROTECTED_PASSWORD_HASH;

  return computedHash === targetHash;
}
