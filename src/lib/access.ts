import "server-only";

import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db, type Executor } from "@/db";
import { patients, referrals, type Patient } from "@/db/schema";
import { accessibleFacilityIds, can, type AuthContext } from "@/lib/auth/context";
import { NotFoundError } from "@/lib/errors";

/**
 * Record level access.
 *
 * A user may read a patient record when either of the following holds:
 *
 *  1. The patient is registered at a facility they work in, or
 *  2. A referral links the patient to a facility they work in, as either the
 *     referring or the receiving side.
 *
 * Nothing else grants access. A clinician at one hospital never sees unrelated
 * patients at another, even inside the same organisation, unless their role is
 * explicitly organisation wide.
 *
 * Access failures are reported as "not found" so that the interface cannot be
 * used to confirm whether a particular person has a record.
 */

export type PatientAccess = {
  patient: Patient;
  /** Facility through which access was granted. */
  viaFacilityId: string;
  /** True when the user holds the record at their own facility. */
  isHomeFacility: boolean;
};

export async function findPatientAccess(
  ctx: AuthContext,
  patientId: string,
  executor: Executor = db,
): Promise<PatientAccess | null> {
  const readableFacilityIds = accessibleFacilityIds(ctx, "patient:read");
  if (readableFacilityIds.length === 0 && !ctx.isPlatformAdmin) return null;

  const [patient] = await executor
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
    .limit(1);

  if (!patient) return null;

  if (ctx.isPlatformAdmin) {
    return { patient, viaFacilityId: patient.homeFacilityId, isHomeFacility: true };
  }

  if (readableFacilityIds.includes(patient.homeFacilityId)) {
    return { patient, viaFacilityId: patient.homeFacilityId, isHomeFacility: true };
  }

  const [linked] = await executor
    .select({
      referringFacilityId: referrals.referringFacilityId,
      receivingFacilityId: referrals.receivingFacilityId,
    })
    .from(referrals)
    .where(
      and(
        eq(referrals.patientId, patientId),
        or(
          inArray(referrals.referringFacilityId, readableFacilityIds),
          inArray(referrals.receivingFacilityId, readableFacilityIds),
        ),
      ),
    )
    .limit(1);

  if (!linked) return null;

  const viaFacilityId = readableFacilityIds.includes(linked.receivingFacilityId)
    ? linked.receivingFacilityId
    : linked.referringFacilityId;

  return { patient, viaFacilityId, isHomeFacility: false };
}

export async function requirePatientAccess(
  ctx: AuthContext,
  patientId: string,
  executor: Executor = db,
): Promise<PatientAccess> {
  const access = await findPatientAccess(ctx, patientId, executor);
  if (!access) {
    throw new NotFoundError("That patient record is not available to you.");
  }
  return access;
}

/** Facility identifiers used to scope referral list queries. */
export function referralScopeFacilityIds(ctx: AuthContext): string[] {
  return accessibleFacilityIds(ctx, "referral:read");
}

/** True when the user may act on a referral at all. */
export function canSeeReferral(
  ctx: AuthContext,
  referral: { referringFacilityId: string; receivingFacilityId: string },
): boolean {
  if (ctx.isPlatformAdmin) return true;
  return (
    can(ctx, "referral:read", { facilityId: referral.referringFacilityId }) ||
    can(ctx, "referral:read", { facilityId: referral.receivingFacilityId })
  );
}
