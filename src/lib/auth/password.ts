import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing using scrypt from the Node standard library.
 *
 * scrypt is memory hard and ships with Node, which keeps the deployment free of
 * native build steps. Parameters follow the current OWASP guidance for scrypt
 * (N = 2^17, r = 8, p = 1). The stored format records the parameters so they can
 * be raised later without invalidating existing hashes.
 */

const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY,
  })) as Buffer;
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const derived = (await scrypt(password.normalize("NFKC"), salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: MAX_MEMORY,
  })) as Buffer;

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Returns true when a stored hash uses weaker parameters than the current policy. */
export function needsRehash(stored: string | null): boolean {
  if (!stored) return true;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < SCRYPT_N;
}

export type PasswordPolicyResult = { ok: true } | { ok: false; reason: string };

const COMMON_PATTERNS = [
  "password",
  "123456",
  "qwerty",
  "letmein",
  "welcome",
  "admin",
  "kea",
  "clinic",
  "hospital",
];

/**
 * Password policy: length first, then a small blocklist of obvious choices.
 * Long passphrases are preferred over character class rules.
 */
export function checkPasswordPolicy(password: string, email?: string): PasswordPolicyResult {
  const value = password.normalize("NFKC");
  if (value.length < 12) {
    return { ok: false, reason: "Use at least 12 characters." };
  }
  if (value.length > 200) {
    return { ok: false, reason: "Use fewer than 200 characters." };
  }
  const lower = value.toLowerCase();
  if (COMMON_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return { ok: false, reason: "Avoid common words such as password, admin or the product name." };
  }
  if (email) {
    const local = email.split("@")[0]?.toLowerCase();
    if (local && local.length > 2 && lower.includes(local)) {
      return { ok: false, reason: "Do not include your email address in your password." };
    }
  }
  if (new Set(value).size < 6) {
    return { ok: false, reason: "Use a greater variety of characters." };
  }
  return { ok: true };
}
