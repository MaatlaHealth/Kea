/**
 * Integration test helpers.
 *
 * These tests run against a real PostgreSQL database. They are skipped, not
 * failed, when no database is reachable, so `npm test` is useful on a machine
 * without one. Continuous integration always has one, so they always run there.
 */
import { sql as raw } from "drizzle-orm";

import { db, sql } from "@/db";
import {
  departments,
  facilities,
  memberships,
  organisations,
  referralPathways,
  users,
  type UserRole,
} from "@/db/schema";
import type { AuthContext } from "@/lib/auth/context";
import { hashPassword } from "@/lib/auth/password";

export async function databaseIsReachable(): Promise<boolean> {
  try {
    await db.execute(raw`select 1`);
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase() {
  await sql.end({ timeout: 5 }).catch(() => {});
}

/** Removes every row created by integration tests, in dependency order. */
export async function truncateAll() {
  await db.execute(raw`
    truncate table
      audit_events,
      rate_limit_counters,
      webhook_deliveries,
      message_events,
      messages,
      message_templates,
      opt_outs,
      notifications,
      contact_attempts,
      escalations,
      follow_up_tasks,
      predictions,
      model_versions,
      document_blobs,
      documents,
      clinical_notes,
      appointments,
      referral_status_events,
      referrals,
      consent_records,
      encounters,
      pregnancy_episodes,
      patient_record_changes,
      patient_identifiers,
      patient_sessions,
      patient_access_codes,
      patients,
      escalation_policies,
      referral_pathways,
      invitations,
      password_reset_tokens,
      sessions,
      memberships,
      departments,
      facilities,
      users,
      organisations,
      pilot_enquiries
    restart identity cascade
  `);
}

export type Fixture = {
  organisationId: string;
  otherOrganisationId: string;
  clinicId: string;
  clinicTwoId: string;
  hospitalId: string;
  otherClinicId: string;
  departmentId: string;
  users: Record<string, string>;
};

const PASSWORD = "integration test passphrase 2026";

async function createUser(email: string, fullName: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      email,
      fullName,
      passwordHash: await hashPassword(PASSWORD),
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });
  return row.id;
}

/**
 * Builds two organisations so that cross organisation isolation can be tested,
 * and two clinics inside the first so that cross facility isolation can be
 * tested within one organisation.
 */
export async function seedFixture(): Promise<Fixture> {
  const [org] = await db
    .insert(organisations)
    .values({ name: "Test Health Service", slug: `test-${Date.now()}`, environment: "demonstration", isSynthetic: true })
    .returning({ id: organisations.id });

  const [otherOrg] = await db
    .insert(organisations)
    .values({ name: "Other Health Service", slug: `other-${Date.now()}`, environment: "demonstration", isSynthetic: true })
    .returning({ id: organisations.id });

  const [clinic] = await db
    .insert(facilities)
    .values({
      organisationId: org.id,
      name: "Test Clinic",
      code: "TC",
      type: "primary_health_clinic",
      latitude: "-26.2041",
      longitude: "28.0473",
    })
    .returning({ id: facilities.id });

  const [clinicTwo] = await db
    .insert(facilities)
    .values({
      organisationId: org.id,
      name: "Second Clinic",
      code: "SC",
      type: "primary_health_clinic",
    })
    .returning({ id: facilities.id });

  const [hospital] = await db
    .insert(facilities)
    .values({
      organisationId: org.id,
      name: "Test Hospital",
      code: "TH",
      type: "district_hospital",
      latitude: "-26.1378",
      longitude: "28.2284",
    })
    .returning({ id: facilities.id });

  const [otherClinic] = await db
    .insert(facilities)
    .values({
      organisationId: otherOrg.id,
      name: "Other Clinic",
      code: "OC",
      type: "primary_health_clinic",
    })
    .returning({ id: facilities.id });

  const [department] = await db
    .insert(departments)
    .values({ facilityId: hospital.id, name: "Obstetrics", serviceType: "Obstetrics" })
    .returning({ id: departments.id });

  await db.insert(referralPathways).values([
    {
      organisationId: org.id,
      referringFacilityId: clinic.id,
      receivingFacilityId: hospital.id,
    },
    {
      organisationId: org.id,
      referringFacilityId: clinicTwo.id,
      receivingFacilityId: hospital.id,
    },
  ]);

  const unique = Date.now();
  const ids = {
    nurse: await createUser(`nurse-${unique}@test.invalid`, "Test Nurse"),
    nurseTwo: await createUser(`nurse2-${unique}@test.invalid`, "Second Clinic Nurse"),
    clinician: await createUser(`clinician-${unique}@test.invalid`, "Test Clinician"),
    coordinator: await createUser(`coordinator-${unique}@test.invalid`, "Test Coordinator"),
    analyst: await createUser(`analyst-${unique}@test.invalid`, "Test Analyst"),
    outsider: await createUser(`outsider-${unique}@test.invalid`, "Other Organisation Nurse"),
  };

  const assignments: { userId: string; facilityId: string | null; role: UserRole; organisationId: string }[] = [
    { userId: ids.nurse, facilityId: clinic.id, role: "nurse_midwife", organisationId: org.id },
    { userId: ids.nurseTwo, facilityId: clinicTwo.id, role: "nurse_midwife", organisationId: org.id },
    {
      userId: ids.clinician,
      facilityId: hospital.id,
      role: "receiving_clinician",
      organisationId: org.id,
    },
    {
      userId: ids.coordinator,
      facilityId: null,
      role: "referral_coordinator",
      organisationId: org.id,
    },
    { userId: ids.analyst, facilityId: null, role: "programme_analyst", organisationId: org.id },
    {
      userId: ids.outsider,
      facilityId: otherClinic.id,
      role: "nurse_midwife",
      organisationId: otherOrg.id,
    },
  ];

  await db.insert(memberships).values(assignments);

  return {
    organisationId: org.id,
    otherOrganisationId: otherOrg.id,
    clinicId: clinic.id,
    clinicTwoId: clinicTwo.id,
    hospitalId: hospital.id,
    otherClinicId: otherClinic.id,
    departmentId: department.id,
    users: ids,
  };
}

/** Builds the same authorisation context the web session builds. */
export async function contextFor(userId: string): Promise<AuthContext> {
  const { and, eq } = await import("drizzle-orm");

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("No such user");

  const membershipRows = await db
    .select({
      organisationId: memberships.organisationId,
      facilityId: memberships.facilityId,
      role: memberships.role,
    })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.isActive, true)));

  const organisationIds = Array.from(new Set(membershipRows.map((row) => row.organisationId)));
  const orgWide = new Set(
    membershipRows.filter((row) => row.facilityId === null).map((row) => row.organisationId),
  );
  const explicit = new Set(
    membershipRows.filter((row) => row.facilityId !== null).map((row) => row.facilityId as string),
  );

  const all = await db
    .select({
      id: facilities.id,
      organisationId: facilities.organisationId,
      name: facilities.name,
      code: facilities.code,
      type: facilities.type,
    })
    .from(facilities);

  return {
    userId: user.id,
    sessionId: "integration-test",
    email: user.email,
    fullName: user.fullName,
    isPlatformAdmin: user.isPlatformAdmin,
    mfaEnabled: false,
    memberships: membershipRows,
    facilities: all.filter(
      (facility) => orgWide.has(facility.organisationId) || explicit.has(facility.id),
    ),
    organisationIds,
    activeOrganisationId: organisationIds[0] ?? null,
  };
}

export function inDays(days: number, hour = 9): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

export function isoDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
