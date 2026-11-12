import "server-only";

import { and, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  clinicalNotes,
  consentRecords,
  encounters,
  facilities,
  followUpTasks,
  messages,
  patientRecordChanges,
  patients,
  pregnancyEpisodes,
  referrals,
  users,
  type ConsentType,
} from "@/db/schema";
import { requirePatientAccess } from "@/lib/access";
import { accessibleFacilityIds, type AuthContext } from "@/lib/auth/context";
import { recordAudit } from "@/lib/audit";

export type PatientListFilters = {
  search?: string | null;
  facilityId?: string | null;
  page?: number;
  pageSize?: number;
};

/**
 * Patient search.
 *
 * Results are restricted to facilities the user works at. Patients linked only
 * through a referral are reachable from that referral, not from this list, so
 * that a general search never widens a user's view of the population.
 */
export async function listPatients(ctx: AuthContext, filters: PatientListFilters = {}) {
  const scopeIds = accessibleFacilityIds(ctx, "patient:read");
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));

  if (scopeIds.length === 0) {
    return { rows: [], total: 0, page, pageSize };
  }

  const conditions: (SQL | undefined)[] = [
    inArray(patients.homeFacilityId, filters.facilityId ? [filters.facilityId] : scopeIds),
    isNull(patients.deletedAt),
    isNull(patients.mergedIntoPatientId),
  ];

  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${search.replace(/[%_]/g, (match) => `\\${match}`)}%`;
    conditions.push(
      or(
        ilike(patients.recordNumber, pattern),
        ilike(patients.firstName, pattern),
        ilike(patients.lastName, pattern),
        ilike(patients.phone, pattern),
        sql`(${patients.firstName} || ' ' || ${patients.lastName}) ilike ${pattern}`,
      ),
    );
  }

  const where = and(...conditions);

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: patients.id,
        recordNumber: patients.recordNumber,
        firstName: patients.firstName,
        lastName: patients.lastName,
        dateOfBirth: patients.dateOfBirth,
        phone: patients.phone,
        preferredChannel: patients.preferredChannel,
        preferredLanguage: patients.preferredLanguage,
        createdAt: patients.createdAt,
        facilityName: facilities.name,
        facilityId: facilities.id,
        estimatedDueDate: pregnancyEpisodes.estimatedDueDate,
        openReferrals: sql<number>`(
          select count(*)::int from referrals r
          where r.patient_id = ${patients.id}
            and r.status not in ('closed', 'cancelled', 'draft')
        )`,
      })
      .from(patients)
      .innerJoin(facilities, eq(facilities.id, patients.homeFacilityId))
      .leftJoin(
        pregnancyEpisodes,
        and(
          eq(pregnancyEpisodes.patientId, patients.id),
          eq(pregnancyEpisodes.isActive, true),
        ),
      )
      .where(where)
      .orderBy(desc(patients.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(patients).where(where),
  ]);

  return { rows, total: totalRow[0]?.value ?? 0, page, pageSize };
}

export type TimelineEntry = {
  id: string;
  kind:
    | "registration"
    | "encounter"
    | "referral"
    | "appointment"
    | "message"
    | "note"
    | "task"
    | "consent"
    | "record_change";
  title: string;
  detail: string | null;
  occurredAt: Date;
  referralId?: string | null;
  tone?: "neutral" | "positive" | "warning" | "critical";
};

/**
 * Builds the longitudinal care timeline for one patient by merging every event
 * source. Each source is already scoped to the patient, and access was checked
 * before this function runs.
 */
export async function getPatientProfile(ctx: AuthContext, patientId: string) {
  const { patient, viaFacilityId, isHomeFacility } = await requirePatientAccess(ctx, patientId);

  const [
    homeFacility,
    episodes,
    referralRows,
    appointmentRows,
    noteRows,
    encounterRows,
    messageRows,
    taskRows,
    consentRows,
    changeRows,
  ] = await Promise.all([
    db
      .select({ id: facilities.id, name: facilities.name, type: facilities.type })
      .from(facilities)
      .where(eq(facilities.id, patient.homeFacilityId))
      .limit(1),
    db
      .select()
      .from(pregnancyEpisodes)
      .where(eq(pregnancyEpisodes.patientId, patientId))
      .orderBy(desc(pregnancyEpisodes.createdAt)),
    db
      .select({
        id: referrals.id,
        reference: referrals.reference,
        status: referrals.status,
        priority: referrals.priority,
        reasonCategory: referrals.reasonCategory,
        createdAt: referrals.createdAt,
        receivingFacilityName: facilities.name,
      })
      .from(referrals)
      .innerJoin(facilities, eq(facilities.id, referrals.receivingFacilityId))
      .where(eq(referrals.patientId, patientId))
      .orderBy(desc(referrals.createdAt)),
    db
      .select({
        id: appointments.id,
        scheduledFor: appointments.scheduledFor,
        status: appointments.status,
        referralId: appointments.referralId,
        facilityName: facilities.name,
      })
      .from(appointments)
      .innerJoin(facilities, eq(facilities.id, appointments.facilityId))
      .where(eq(appointments.patientId, patientId))
      .orderBy(desc(appointments.scheduledFor)),
    db
      .select({
        id: clinicalNotes.id,
        body: clinicalNotes.body,
        createdAt: clinicalNotes.createdAt,
        referralId: clinicalNotes.referralId,
        aiAssisted: clinicalNotes.aiAssisted,
        authorName: users.fullName,
      })
      .from(clinicalNotes)
      .innerJoin(users, eq(users.id, clinicalNotes.authorUserId))
      .where(eq(clinicalNotes.patientId, patientId))
      .orderBy(desc(clinicalNotes.createdAt)),
    db
      .select({
        id: encounters.id,
        kind: encounters.kind,
        summary: encounters.summary,
        occurredAt: encounters.occurredAt,
        facilityName: facilities.name,
      })
      .from(encounters)
      .innerJoin(facilities, eq(facilities.id, encounters.facilityId))
      .where(eq(encounters.patientId, patientId))
      .orderBy(desc(encounters.occurredAt)),
    db
      .select({
        id: messages.id,
        direction: messages.direction,
        channel: messages.channel,
        templateKey: messages.templateKey,
        status: messages.status,
        createdAt: messages.createdAt,
        referralId: messages.referralId,
        body: messages.body,
      })
      .from(messages)
      .where(eq(messages.patientId, patientId))
      .orderBy(desc(messages.createdAt))
      .limit(50),
    db
      .select()
      .from(followUpTasks)
      .where(eq(followUpTasks.patientId, patientId))
      .orderBy(desc(followUpTasks.createdAt)),
    db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.patientId, patientId))
      .orderBy(desc(consentRecords.capturedAt)),
    db
      .select({
        id: patientRecordChanges.id,
        changedFields: patientRecordChanges.changedFields,
        reason: patientRecordChanges.reason,
        createdAt: patientRecordChanges.createdAt,
        changedByName: users.fullName,
      })
      .from(patientRecordChanges)
      .leftJoin(users, eq(users.id, patientRecordChanges.changedByUserId))
      .where(eq(patientRecordChanges.patientId, patientId))
      .orderBy(desc(patientRecordChanges.createdAt))
      .limit(30),
  ]);

  const timeline: TimelineEntry[] = [
    ...referralRows.map<TimelineEntry>((row) => ({
      id: `referral-${row.id}`,
      kind: "referral",
      title: `Referral ${row.reference} to ${row.receivingFacilityName}`,
      detail: row.reasonCategory,
      occurredAt: row.createdAt,
      referralId: row.id,
      tone: row.priority === "routine" ? "neutral" : "warning",
    })),
    ...appointmentRows.map<TimelineEntry>((row) => ({
      id: `appointment-${row.id}`,
      kind: "appointment",
      title: `Appointment at ${row.facilityName}`,
      detail: row.status,
      occurredAt: row.scheduledFor,
      referralId: row.referralId,
      tone:
        row.status === "attended"
          ? "positive"
          : row.status === "missed"
            ? "warning"
            : "neutral",
    })),
    ...encounterRows.map<TimelineEntry>((row) => ({
      id: `encounter-${row.id}`,
      kind: "encounter",
      title: row.summary,
      detail: `${row.kind.replace(/_/g, " ")} at ${row.facilityName}`,
      occurredAt: row.occurredAt,
    })),
    ...noteRows.map<TimelineEntry>((row) => ({
      id: `note-${row.id}`,
      kind: "note",
      title: `Clinical note by ${row.authorName}`,
      detail: row.body.slice(0, 220),
      occurredAt: row.createdAt,
      referralId: row.referralId,
    })),
    ...messageRows.map<TimelineEntry>((row) => ({
      id: `message-${row.id}`,
      kind: "message",
      title:
        row.direction === "outbound"
          ? `Message sent by ${row.channel}`
          : `Message received by ${row.channel}`,
      detail: row.status,
      occurredAt: row.createdAt,
      referralId: row.referralId,
      tone:
        row.status === "delivered" || row.status === "read"
          ? "positive"
          : row.status === "failed" || row.status === "undeliverable"
            ? "critical"
            : "neutral",
    })),
    ...taskRows.map<TimelineEntry>((row) => ({
      id: `task-${row.id}`,
      kind: "task",
      title: row.title,
      detail: row.status,
      occurredAt: row.createdAt,
      referralId: row.referralId,
      tone: row.status === "resolved" ? "positive" : "warning",
    })),
    ...consentRows.map<TimelineEntry>((row) => ({
      id: `consent-${row.id}`,
      kind: "consent",
      title: `Consent ${row.status}: ${row.type.replace(/_/g, " ")}`,
      detail: row.method,
      occurredAt: row.capturedAt,
    })),
    ...changeRows.map<TimelineEntry>((row) => ({
      id: `change-${row.id}`,
      kind: "record_change",
      title:
        row.changedFields.includes("record_created")
          ? "Patient record created"
          : `Record updated: ${row.changedFields.join(", ")}`,
      detail: row.changedByName ? `by ${row.changedByName}` : null,
      occurredAt: row.createdAt,
    })),
  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const latestConsents = new Map<ConsentType, (typeof consentRows)[number]>();
  for (const row of consentRows) {
    if (!latestConsents.has(row.type)) latestConsents.set(row.type, row);
  }

  await recordAudit({
    organisationId: patient.organisationId,
    actorUserId: ctx.userId,
    action: "patient.view",
    resourceType: "patient",
    resourceId: patientId,
    metadata: { facilityId: viaFacilityId },
  });

  return {
    patient,
    viaFacilityId,
    isHomeFacility,
    homeFacility: homeFacility[0] ?? null,
    pregnancyEpisodes: episodes,
    referrals: referralRows,
    appointments: appointmentRows,
    notes: noteRows,
    messages: messageRows,
    tasks: taskRows,
    consents: Array.from(latestConsents.values()),
    timeline,
  };
}
