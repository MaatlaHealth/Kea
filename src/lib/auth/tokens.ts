import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Opaque token helpers.
 *
 * Secrets are generated with a cryptographic random source, handed to the
 * recipient once, and only their SHA-256 digest is written to the database.
 */

/** 256 bits of entropy rendered as url safe base64. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Numeric one time code for the patient portal. Avoids ambiguous leading zeros. */
export function generateNumericCode(digits = 6): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(randomInt(min, max + 1));
}

/** Short, readable reference such as KEA-7F3K2Q. Excludes easily confused glyphs. */
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateReference(prefix = "KEA", length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  }
  return `${prefix}-${out}`;
}
