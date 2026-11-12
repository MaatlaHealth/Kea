import "server-only";

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";

import { db } from "@/db";
import { patientAccessCodes, patientSessions, patients, type Patient } from "@/db/schema";
import { env } from "@/lib/env";
import { AuthenticationError } from "@/lib/errors";
import { generateNumericCode, generateToken, hashToken, safeEqualHex } from "./tokens";

/**
 * Patient portal authentication.
 *
 * Patients sign in with a one time code sent to the phone number already on
 * their record. There is no patient password to lose, nothing to remember, and
 * no new identifier to collect.
 *
 * Sessions are deliberately short and are stored, like staff sessions, only as
 * a digest of the token held in the cookie.
 */

const PATIENT_COOKIE = "kea_patient_session";
const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

export function patientCookieName(): string {
  return PATIENT_COOKIE;
}

export type IssuedCode = {
  patientId: string;
  code: string;
  expiresInMinutes: number;
};

/**
 * Issues a code for the patient whose record carries this phone number.
 * Returns null when no record matches, so the caller can respond identically
 * either way and avoid confirming whether a number is registered.
 */
export async function issuePatientCode(normalisedPhone: string): Promise<IssuedCode | null> {
  const [patient] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        eq(patients.phone, normalisedPhone),
        isNull(patients.deletedAt),
        isNull(patients.mergedIntoPatientId),
      ),
    )
    .limit(1);

  if (!patient) return null;

  const code = generateNumericCode(6);
  await db.insert(patientAccessCodes).values({
    patientId: patient.id,
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
  });

  return { patientId: patient.id, code, expiresInMinutes: CODE_TTL_MINUTES };
}

export type VerifyResult =
  | { ok: true; patientId: string }
  | { ok: false; reason: "no_code" | "expired" | "incorrect" | "too_many_attempts" };

export async function verifyPatientCode(
  normalisedPhone: string,
  code: string,
): Promise<VerifyResult> {
  const [patient] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.phone, normalisedPhone), isNull(patients.deletedAt)))
    .limit(1);

  if (!patient) return { ok: false, reason: "incorrect" };

  const [record] = await db
    .select()
    .from(patientAccessCodes)
    .where(
      and(
        eq(patientAccessCodes.patientId, patient.id),
        isNull(patientAccessCodes.consumedAt),
        gt(patientAccessCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(patientAccessCodes.createdAt))
    .limit(1);

  if (!record) return { ok: false, reason: "expired" };
  if (record.attemptCount >= MAX_CODE_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const matches = safeEqualHex(record.codeHash, hashToken(code.trim()));

  if (!matches) {
    await db
      .update(patientAccessCodes)
      .set({ attemptCount: record.attemptCount + 1 })
      .where(eq(patientAccessCodes.id, record.id));
    return { ok: false, reason: "incorrect" };
  }

  await db
    .update(patientAccessCodes)
    .set({ consumedAt: new Date() })
    .where(eq(patientAccessCodes.id, record.id));

  return { ok: true, patientId: patient.id };
}

export async function createPatientSession(patientId: string) {
  const ttlMinutes = env().PATIENT_SESSION_TTL_MINUTES;
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  await db.insert(patientSessions).values({
    patientId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  const store = await cookies();
  store.set(PATIENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/portal",
    maxAge: ttlMinutes * 60,
  });
}

export async function destroyPatientSession() {
  const store = await cookies();
  const token = store.get(PATIENT_COOKIE)?.value;
  store.delete(PATIENT_COOKIE);
  if (!token) return;
  await db
    .update(patientSessions)
    .set({ revokedAt: new Date() })
    .where(eq(patientSessions.tokenHash, hashToken(token)));
}

export const getPatientSession = cache(async (): Promise<Patient | null> => {
  const store = await cookies();
  const token = store.get(PATIENT_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ patient: patients, expiresAt: patientSessions.expiresAt, revokedAt: patientSessions.revokedAt })
    .from(patientSessions)
    .innerJoin(patients, eq(patients.id, patientSessions.patientId))
    .where(eq(patientSessions.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return null;
  if (row.revokedAt || row.expiresAt <= new Date()) return null;
  if (row.patient.deletedAt) return null;

  return row.patient;
});

export async function requirePatientSession(): Promise<Patient> {
  const patient = await getPatientSession();
  if (!patient) throw new AuthenticationError("Please sign in to see your appointments.");
  return patient;
}
