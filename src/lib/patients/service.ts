import "server-only";

import { and, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";

import { db, type Executor } from "@/db";
import {
  consentRecords,
  facilities,
  organisations,
  patientIdentifiers,
  patientRecordChanges,
  patients,
  pregnancyEpisodes,
  type CommunicationChannel,
  type ConsentType,
  type Patient,
} from "@/db/schema";
import { requirePatientAccess } from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { assertCan, assertFacilityAccess, type AuthContext } from "@/lib/auth/context";
import { ConflictError, ValidationError } from "@/lib/errors";
import { normalisePhone } from "@/lib/messaging/provider";

/**
 * Patient registration and maintenance.
 *
 * Only data with a documented clinical or operational purpose is collected. The
 * schema intentionally has no field for a national identity number, race or
 * income: none of those are needed to coordinate a referral.
 */

export type DuplicateCandidate = {
  id: string;
  recordNumber: string;
  fullName: string;
  dateOfBirth: string | null;
  homeFacilityName: string;
  matchedOn: string[];
};

/**
 * Looks for existing records that may be the same person.
 *
 * Matching is deliberately conservative: an exact phone number, or the same
 * surname together with the same date of birth. Staff decide; the system never
 * merges automatically.
 */
export async function findDuplicateCandidates(
  organisationId: string,
  input: { phone?: string | null; firstName: string; lastName: string; dateOfBirth?: string | null },
  excludePatientId?: string,
  executor: Executor = db,
): Promise<DuplicateCandidate[]> {
  const phone = normalisePhone(input.phone);
  const conditions = [];

  if (phone) conditions.push(eq(patients.phone, phone));
  if (input.dateOfBirth) {
    conditions.push(
      and(
        ilike(patients.lastName, input.lastName),
        eq(patients.dateOfBirth, input.dateOfBirth),
      ),
    );
  }
  conditions.push(
    and(ilike(patients.firstName, input.firstName), ilike(patients.lastName, input.lastName)),
  );

  const rows = await executor
    .select({
      id: patients.id,
      recordNumber: patients.recordNumber,
      firstName: patients.firstName,
      lastName: patients.lastName,
      dateOfBirth: patients.dateOfBirth,
      phone: patients.phone,
      facilityName: facilities.name,
    })
    .from(patients)
    .innerJoin(facilities, eq(facilities.id, patients.homeFacilityId))
    .where(
      and(
        eq(patients.organisationId, organisationId),
        isNull(patients.deletedAt),
        isNull(patients.mergedIntoPatientId),
        excludePatientId ? ne(patients.id, excludePatientId) : undefined,
        or(...conditions),
      ),
    )
    .limit(10);

  return rows.map((row) => {
    const matchedOn: string[] = [];
    if (phone && row.phone === phone) matchedOn.push("phone number");
    if (input.dateOfBirth && row.dateOfBirth === input.dateOfBirth) matchedOn.push("date of birth");
    if (
      row.firstName.toLowerCase() === input.firstName.toLowerCase() &&
      row.lastName.toLowerCase() === input.lastName.toLowerCase()
    ) {
      matchedOn.push("name");
    }
    return {
      id: row.id,
      recordNumber: row.recordNumber,
      fullName: `${row.firstName} ${row.lastName}`,
      dateOfBirth: row.dateOfBirth,
      homeFacilityName: row.facilityName,
      matchedOn,
    };
  });
}

export type RegisterPatientInput = {
  homeFacilityId: string;
  recordNumber?: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  preferredLanguage: string;
  preferredChannel: CommunicationChannel;
  residentialArea?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
  pregnancy?: {
    estimatedDueDate?: string | null;
    lastMenstrualPeriod?: string | null;
    gravidity?: number | null;
    parity?: number | null;
    bookingDate?: string | null;
  } | null;
  consents: { type: ConsentType; granted: boolean; method?: string | null }[];
  /** Set when the user has reviewed duplicate candidates and chose to continue. */
  acknowledgedDuplicates?: boolean;
};

async function nextRecordNumber(
  organisationId: string,
  facilityCode: string,
  executor: Executor,
): Promise<string> {
  const [row] = await executor
    .select({ value: sql<number>`count(*)::int` })
    .from(patients)
    .where(eq(patients.organisationId, organisationId));
  const sequence = (row?.value ?? 0) + 1;
  for (let offset = 0; offset < 50; offset += 1) {
    const candidate = `${facilityCode}-${String(sequence + offset).padStart(5, "0")}`;
    const [existing] = await executor
      .select({ id: patients.id })
      .from(patients)
      .where(
        and(eq(patients.organisationId, organisationId), eq(patients.recordNumber, candidate)),
      )
      .limit(1);
    if (!existing) return candidate;
  }
  throw new ConflictError("Could not allocate a record number. Please try again.");
}

export async function registerPatient(
  ctx: AuthContext,
  input: RegisterPatientInput,
): Promise<{ id: string; recordNumber: string; duplicates: DuplicateCandidate[] }> {
  const facility = assertFacilityAccess(ctx, input.homeFacilityId);
  assertCan(ctx, "patient:create", { facilityId: facility.id });

  const phone = normalisePhone(input.phone);
  if (input.preferredChannel !== "none" && !phone) {
    throw new ValidationError("A phone number is needed for the chosen contact method.", {
      phone: ["Add a phone number or set the contact method to none."],
    });
  }

  const duplicates = await findDuplicateCandidates(facility.organisationId, {
    phone,
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
  });

  if (duplicates.length > 0 && !input.acknowledgedDuplicates) {
    return { id: "", recordNumber: "", duplicates };
  }

  const [facilityRow] = await db
    .select({ code: facilities.code, organisationId: facilities.organisationId })
    .from(facilities)
    .where(eq(facilities.id, input.homeFacilityId))
    .limit(1);

  const organisationId = facilityRow.organisationId;
  const [organisationRow] = await db
    .select({ isSynthetic: organisations.isSynthetic })
    .from(organisations)
    .where(eq(organisations.id, organisationId))
    .limit(1);

  const created = await db.transaction(async (tx) => {
    const recordNumber =
      input.recordNumber?.trim() || (await nextRecordNumber(organisationId, facilityRow.code, tx));

    const [existing] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(
        and(eq(patients.organisationId, organisationId), eq(patients.recordNumber, recordNumber)),
      )
      .limit(1);
    if (existing) {
      throw new ValidationError("That record number is already in use.", {
        recordNumber: ["Choose a different record number."],
      });
    }

    const [patient] = await tx
      .insert(patients)
      .values({
        organisationId,
        homeFacilityId: input.homeFacilityId,
        recordNumber,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        dateOfBirth: input.dateOfBirth || null,
        phone,
        alternatePhone: normalisePhone(input.alternatePhone),
        preferredLanguage: input.preferredLanguage,
        preferredChannel: input.preferredChannel,
        residentialArea: input.residentialArea?.trim() || null,
        emergencyContactName: input.emergencyContactName?.trim() || null,
        emergencyContactPhone: normalisePhone(input.emergencyContactPhone),
        notes: input.notes?.trim() || null,
        isSynthetic: Boolean(organisationRow?.isSynthetic),
        createdByUserId: ctx.userId,
      })
      .returning();

    if (input.pregnancy) {
      await tx.insert(pregnancyEpisodes).values({
        patientId: patient.id,
        organisationId,
        estimatedDueDate: input.pregnancy.estimatedDueDate || null,
        lastMenstrualPeriod: input.pregnancy.lastMenstrualPeriod || null,
        gravidity: input.pregnancy.gravidity ?? null,
        parity: input.pregnancy.parity ?? null,
        bookingDate: input.pregnancy.bookingDate || null,
      });
    }

    if (input.consents.length > 0) {
      await tx.insert(consentRecords).values(
        input.consents.map((consent) => ({
          patientId: patient.id,
          organisationId,
          type: consent.type,
          status: consent.granted ? ("granted" as const) : ("not_asked" as const),
          capturedByUserId: ctx.userId,
          method: consent.method ?? "Recorded at registration",
        })),
      );
    }

    await tx.insert(patientRecordChanges).values({
      patientId: patient.id,
      changedByUserId: ctx.userId,
      changedFields: ["record_created"],
      reason: "Patient registered",
    });

    await recordAudit(
      {
        organisationId,
        actorUserId: ctx.userId,
        action: "patient.create",
        resourceType: "patient",
        resourceId: patient.id,
        metadata: { facilityId: input.homeFacilityId },
      },
      tx,
    );

    return patient;
  });

  return { id: created.id, recordNumber: created.recordNumber, duplicates: [] };
}

export type UpdatePatientInput = Partial<
  Pick<
    RegisterPatientInput,
    | "firstName"
    | "lastName"
    | "dateOfBirth"
    | "phone"
    | "alternatePhone"
    | "preferredLanguage"
    | "preferredChannel"
    | "residentialArea"
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "notes"
  >
> & { reason?: string | null };

export async function updatePatient(
  ctx: AuthContext,
  patientId: string,
  input: UpdatePatientInput,
): Promise<Patient> {
  const { patient, viaFacilityId } = await requirePatientAccess(ctx, patientId);
  assertCan(ctx, "patient:update", { facilityId: viaFacilityId });

  const patch: Partial<typeof patients.$inferInsert> = {};
  const changed: string[] = [];

  const assign = <K extends keyof typeof patch>(
    key: K,
    value: (typeof patch)[K],
    current: unknown,
  ) => {
    if (value === undefined) return;
    if (value === current) return;
    patch[key] = value;
    changed.push(String(key));
  };

  assign("firstName", input.firstName?.trim(), patient.firstName);
  assign("lastName", input.lastName?.trim(), patient.lastName);
  assign("dateOfBirth", input.dateOfBirth || null, patient.dateOfBirth);
  assign("phone", input.phone === undefined ? undefined : normalisePhone(input.phone), patient.phone);
  assign(
    "alternatePhone",
    input.alternatePhone === undefined ? undefined : normalisePhone(input.alternatePhone),
    patient.alternatePhone,
  );
  assign("preferredLanguage", input.preferredLanguage, patient.preferredLanguage);
  assign("preferredChannel", input.preferredChannel, patient.preferredChannel);
  assign("residentialArea", input.residentialArea?.trim() || null, patient.residentialArea);
  assign(
    "emergencyContactName",
    input.emergencyContactName?.trim() || null,
    patient.emergencyContactName,
  );
  assign(
    "emergencyContactPhone",
    input.emergencyContactPhone === undefined
      ? undefined
      : normalisePhone(input.emergencyContactPhone),
    patient.emergencyContactPhone,
  );
  assign("notes", input.notes?.trim() || null, patient.notes);

  if (changed.length === 0) return patient;

  patch.updatedAt = new Date();

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(patients)
      .set(patch)
      .where(eq(patients.id, patientId))
      .returning();

    await tx.insert(patientRecordChanges).values({
      patientId,
      changedByUserId: ctx.userId,
      changedFields: changed,
      reason: input.reason?.slice(0, 240) ?? null,
    });

    await recordAudit(
      {
        organisationId: patient.organisationId,
        actorUserId: ctx.userId,
        action: "patient.update",
        resourceType: "patient",
        resourceId: patientId,
        metadata: { changedFields: changed, facilityId: viaFacilityId },
      },
      tx,
    );

    return row;
  });

  return updated;
}

export async function recordConsent(
  ctx: AuthContext,
  patientId: string,
  type: ConsentType,
  granted: boolean,
  method?: string | null,
) {
  const { patient, viaFacilityId } = await requirePatientAccess(ctx, patientId);
  assertCan(ctx, "patient:update", { facilityId: viaFacilityId });

  await db.insert(consentRecords).values({
    patientId,
    organisationId: patient.organisationId,
    type,
    status: granted ? "granted" : "withdrawn",
    capturedByUserId: ctx.userId,
    method: method ?? "Recorded by staff",
  });

  await recordAudit({
    organisationId: patient.organisationId,
    actorUserId: ctx.userId,
    action: "consent.record",
    resourceType: "patient",
    resourceId: patientId,
    metadata: { consentType: type, consentStatus: granted ? "granted" : "withdrawn" },
  });
}

/**
 * Marks one record as a duplicate of another. The duplicate is retained so that
 * existing referrals keep their history, and is excluded from search results.
 */
export async function mergePatientRecords(
  ctx: AuthContext,
  sourcePatientId: string,
  targetPatientId: string,
  reason: string,
) {
  if (sourcePatientId === targetPatientId) {
    throw new ValidationError("Choose two different records to merge.");
  }
  const source = await requirePatientAccess(ctx, sourcePatientId);
  const target = await requirePatientAccess(ctx, targetPatientId);
  assertCan(ctx, "patient:merge", { facilityId: source.viaFacilityId });
  assertCan(ctx, "patient:merge", { facilityId: target.viaFacilityId });

  if (source.patient.organisationId !== target.patient.organisationId) {
    throw new ValidationError("Records from different organisations cannot be merged.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(patients)
      .set({ mergedIntoPatientId: targetPatientId, updatedAt: new Date() })
      .where(eq(patients.id, sourcePatientId));

    await tx
      .update(patientIdentifiers)
      .set({ patientId: targetPatientId })
      .where(eq(patientIdentifiers.patientId, sourcePatientId));

    await tx.insert(patientRecordChanges).values({
      patientId: targetPatientId,
      changedByUserId: ctx.userId,
      changedFields: ["merged_duplicate"],
      reason: reason.slice(0, 240),
    });

    await recordAudit(
      {
        organisationId: target.patient.organisationId,
        actorUserId: ctx.userId,
        action: "patient.merge",
        resourceType: "patient",
        resourceId: targetPatientId,
        metadata: { reason: reason.slice(0, 200) },
      },
      tx,
    );
  });
}
