import "server-only";

import { aliasedTable, and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  clinicalNotes,
  documents,
  facilities,
  followUpTasks,
  messages,
  modelVersions,
  patients,
  predictions,
  referralStatusEvents,
  referrals,
  users,
  type ReferralPriority,
  type ReferralStatus,
} from "@/db/schema";
import { canSeeReferral, requirePatientAccess } from "@/lib/access";
import { accessibleFacilityIds, type AuthContext } from "@/lib/auth/context";
import { NotFoundError } from "@/lib/errors";
import { ACTIVE_STATUSES, availableTransitions } from "./state-machine";

const referringFacility = aliasedTable(facilities, "referring_facility");
const receivingFacility = aliasedTable(facilities, "receiving_facility");

export type ReferralDirection = "all" | "outgoing" | "incoming";

export type ReferralListFilters = {
  direction?: ReferralDirection;
  statuses?: ReferralStatus[];
  priorities?: ReferralPriority[];
  facilityId?: string | null;
  search?: string | null;
  from?: Date | null;
  to?: Date | null;
  assignedToMe?: boolean;
  sort?: "newest" | "oldest" | "priority" | "status";
  page?: number;
  pageSize?: number;
};

export type ReferralListRow = {
  id: string;
  reference: string;
  status: ReferralStatus;
  priority: ReferralPriority;
  reasonCategory: string;
  createdAt: Date;
  submittedAt: Date | null;
  acknowledgedAt: Date | null;
  firstAppointmentAt: Date | null;
  patientId: string;
  patientName: string;
  patientRecordNumber: string;
  referringFacilityId: string;
  referringFacilityName: string;
  receivingFacilityId: string;
  receivingFacilityName: string;
  assignedCoordinatorId: string | null;
};

/**
 * Lists referrals the user is allowed to see.
 *
 * The facility predicate is applied in SQL rather than filtered afterwards, so
 * a user never receives rows outside their scope even in a paginated response.
 */
export async function listReferrals(
  ctx: AuthContext,
  filters: ReferralListFilters = {},
): Promise<{ rows: ReferralListRow[]; total: number; page: number; pageSize: number }> {
  const scopeIds = accessibleFacilityIds(ctx, "referral:read");
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));

  if (scopeIds.length === 0 && !ctx.isPlatformAdmin) {
    return { rows: [], total: 0, page, pageSize };
  }

  const conditions = [];

  if (!ctx.isPlatformAdmin) {
    const direction = filters.direction ?? "all";
    if (direction === "outgoing") {
      conditions.push(inArray(referrals.referringFacilityId, scopeIds));
    } else if (direction === "incoming") {
      conditions.push(inArray(referrals.receivingFacilityId, scopeIds));
    } else {
      conditions.push(
        or(
          inArray(referrals.referringFacilityId, scopeIds),
          inArray(referrals.receivingFacilityId, scopeIds),
        ),
      );
    }
  } else if (filters.direction === "outgoing" && filters.facilityId) {
    conditions.push(eq(referrals.referringFacilityId, filters.facilityId));
  } else if (filters.direction === "incoming" && filters.facilityId) {
    conditions.push(eq(referrals.receivingFacilityId, filters.facilityId));
  }

  if (filters.facilityId) {
    conditions.push(
      or(
        eq(referrals.referringFacilityId, filters.facilityId),
        eq(referrals.receivingFacilityId, filters.facilityId),
      ),
    );
  }
  if (filters.statuses?.length) {
    conditions.push(inArray(referrals.status, filters.statuses));
  }
  if (filters.priorities?.length) {
    conditions.push(inArray(referrals.priority, filters.priorities));
  }
  if (filters.from) conditions.push(gte(referrals.createdAt, filters.from));
  if (filters.to) conditions.push(lte(referrals.createdAt, filters.to));
  if (filters.assignedToMe) conditions.push(eq(referrals.assignedCoordinatorId, ctx.userId));

  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${search.replace(/[%_]/g, (match) => `\\${match}`)}%`;
    conditions.push(
      or(
        ilike(referrals.reference, pattern),
        ilike(patients.recordNumber, pattern),
        ilike(patients.lastName, pattern),
        ilike(patients.firstName, pattern),
        sql`(${patients.firstName} || ' ' || ${patients.lastName}) ilike ${pattern}`,
      ),
    );
  }

  const where = and(...conditions, isNull(patients.deletedAt));

  const orderBy = (() => {
    switch (filters.sort) {
      case "oldest":
        return [asc(referrals.createdAt)];
      case "priority":
        return [
          sql`case ${referrals.priority} when 'emergency' then 0 when 'urgent' then 1 else 2 end`,
          desc(referrals.createdAt),
        ];
      case "status":
        return [asc(referrals.status), desc(referrals.createdAt)];
      default:
        return [desc(referrals.createdAt)];
    }
  })();

  const rows = await db
    .select({
      id: referrals.id,
      reference: referrals.reference,
      status: referrals.status,
      priority: referrals.priority,
      reasonCategory: referrals.reasonCategory,
      createdAt: referrals.createdAt,
      submittedAt: referrals.submittedAt,
      acknowledgedAt: referrals.acknowledgedAt,
      firstAppointmentAt: referrals.firstAppointmentAt,
      patientId: patients.id,
      firstName: patients.firstName,
      lastName: patients.lastName,
      patientRecordNumber: patients.recordNumber,
      referringFacilityId: referrals.referringFacilityId,
      referringFacilityName: referringFacility.name,
      receivingFacilityId: referrals.receivingFacilityId,
      receivingFacilityName: receivingFacility.name,
      assignedCoordinatorId: referrals.assignedCoordinatorId,
    })
    .from(referrals)
    .innerJoin(patients, eq(patients.id, referrals.patientId))
    .innerJoin(referringFacility, eq(referringFacility.id, referrals.referringFacilityId))
    .innerJoin(receivingFacility, eq(receivingFacility.id, referrals.receivingFacilityId))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totalRow] = await db
    .select({ value: count() })
    .from(referrals)
    .innerJoin(patients, eq(patients.id, referrals.patientId))
    .where(where);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      priority: row.priority,
      reasonCategory: row.reasonCategory,
      createdAt: row.createdAt,
      submittedAt: row.submittedAt,
      acknowledgedAt: row.acknowledgedAt,
      firstAppointmentAt: row.firstAppointmentAt,
      patientId: row.patientId,
      patientName: `${row.firstName} ${row.lastName}`,
      patientRecordNumber: row.patientRecordNumber,
      referringFacilityId: row.referringFacilityId,
      referringFacilityName: row.referringFacilityName,
      receivingFacilityId: row.receivingFacilityId,
      receivingFacilityName: row.receivingFacilityName,
      assignedCoordinatorId: row.assignedCoordinatorId,
    })),
    total: totalRow?.value ?? 0,
    page,
    pageSize,
  };
}

export async function getReferralDetail(ctx: AuthContext, referralId: string) {
  const [row] = await db
    .select({
      referral: referrals,
      patient: patients,
      referringFacility: {
        id: referringFacility.id,
        name: referringFacility.name,
        type: referringFacility.type,
        district: referringFacility.district,
        phone: referringFacility.phone,
      },
      receivingFacility: {
        id: receivingFacility.id,
        name: receivingFacility.name,
        type: receivingFacility.type,
        district: receivingFacility.district,
        phone: receivingFacility.phone,
      },
    })
    .from(referrals)
    .innerJoin(patients, eq(patients.id, referrals.patientId))
    .innerJoin(referringFacility, eq(referringFacility.id, referrals.referringFacilityId))
    .innerJoin(receivingFacility, eq(receivingFacility.id, referrals.receivingFacilityId))
    .where(eq(referrals.id, referralId))
    .limit(1);

  if (!row) throw new NotFoundError("That referral could not be found.");
  if (!canSeeReferral(ctx, row.referral)) {
    throw new NotFoundError("That referral could not be found.");
  }
  await requirePatientAccess(ctx, row.referral.patientId);

  const actor = aliasedTable(users, "actor");

  const [timeline, appointmentRows, noteRows, documentRows, taskRows, messageRows, predictionRow] =
    await Promise.all([
      db
        .select({
          id: referralStatusEvents.id,
          fromStatus: referralStatusEvents.fromStatus,
          toStatus: referralStatusEvents.toStatus,
          note: referralStatusEvents.note,
          occurredAt: referralStatusEvents.occurredAt,
          actorName: actor.fullName,
          actorSystem: referralStatusEvents.actorSystem,
        })
        .from(referralStatusEvents)
        .leftJoin(actor, eq(actor.id, referralStatusEvents.actorUserId))
        .where(eq(referralStatusEvents.referralId, referralId))
        .orderBy(desc(referralStatusEvents.occurredAt)),
      db
        .select()
        .from(appointments)
        .where(eq(appointments.referralId, referralId))
        .orderBy(desc(appointments.scheduledFor)),
      db
        .select({
          id: clinicalNotes.id,
          body: clinicalNotes.body,
          createdAt: clinicalNotes.createdAt,
          aiAssisted: clinicalNotes.aiAssisted,
          visibleToPatient: clinicalNotes.visibleToPatient,
          authorName: users.fullName,
        })
        .from(clinicalNotes)
        .innerJoin(users, eq(users.id, clinicalNotes.authorUserId))
        .where(eq(clinicalNotes.referralId, referralId))
        .orderBy(desc(clinicalNotes.createdAt)),
      db
        .select()
        .from(documents)
        .where(and(eq(documents.referralId, referralId), isNull(documents.deletedAt)))
        .orderBy(desc(documents.createdAt)),
      db
        .select()
        .from(followUpTasks)
        .where(eq(followUpTasks.referralId, referralId))
        .orderBy(desc(followUpTasks.createdAt)),
      db
        .select({
          id: messages.id,
          direction: messages.direction,
          channel: messages.channel,
          templateKey: messages.templateKey,
          status: messages.status,
          body: messages.body,
          createdAt: messages.createdAt,
          errorDetail: messages.errorDetail,
        })
        .from(messages)
        .where(eq(messages.referralId, referralId))
        .orderBy(desc(messages.createdAt))
        .limit(25),
      db
        .select({
          score: predictions.score,
          band: predictions.band,
          contributingFactors: predictions.contributingFactors,
          missingFeatures: predictions.missingFeatures,
          calculatedAt: predictions.calculatedAt,
          modelName: modelVersions.name,
          modelVersion: modelVersions.version,
          modelStatus: modelVersions.status,
          clinicallyValidated: modelVersions.clinicallyValidated,
          trainedOnRealData: modelVersions.trainedOnRealData,
        })
        .from(predictions)
        .innerJoin(modelVersions, eq(modelVersions.id, predictions.modelVersionId))
        .where(eq(predictions.referralId, referralId))
        .orderBy(desc(predictions.calculatedAt))
        .limit(1),
    ]);

  const transitions = availableTransitions(
    ctx,
    {
      referringFacilityId: row.referral.referringFacilityId,
      receivingFacilityId: row.referral.receivingFacilityId,
    },
    row.referral.status,
  );

  return {
    referral: row.referral,
    patient: row.patient,
    referringFacility: row.referringFacility,
    receivingFacility: row.receivingFacility,
    timeline,
    appointments: appointmentRows,
    notes: noteRows,
    documents: documentRows,
    tasks: taskRows,
    messages: messageRows,
    prediction: predictionRow[0] ?? null,
    transitions,
  };
}

export type DashboardMetrics = {
  activeReferrals: number;
  awaitingAcknowledgement: number;
  upcomingAppointments: number;
  overdueFollowUps: number;
  awaitingCoordinatorReview: number;
  completedPathways: number;
};

/** Counts used by the dashboard overview. Every value comes from a live query. */
export async function dashboardMetrics(
  ctx: AuthContext,
  now = new Date(),
): Promise<DashboardMetrics> {
  const scopeIds = accessibleFacilityIds(ctx, "referral:read");
  if (scopeIds.length === 0) {
    return {
      activeReferrals: 0,
      awaitingAcknowledgement: 0,
      upcomingAppointments: 0,
      overdueFollowUps: 0,
      awaitingCoordinatorReview: 0,
      completedPathways: 0,
    };
  }

  const inScope = or(
    inArray(referrals.referringFacilityId, scopeIds),
    inArray(referrals.receivingFacilityId, scopeIds),
  );
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [active, awaiting, upcoming, overdue, review, completed] = await Promise.all([
    db
      .select({ value: count() })
      .from(referrals)
      .where(and(inScope, inArray(referrals.status, [...ACTIVE_STATUSES]))),
    db
      .select({ value: count() })
      .from(referrals)
      .where(and(inScope, inArray(referrals.status, ["submitted", "received"]))),
    db
      .select({ value: count() })
      .from(appointments)
      .where(
        and(
          inArray(appointments.facilityId, scopeIds),
          inArray(appointments.status, ["scheduled", "rescheduled"]),
          gte(appointments.scheduledFor, now),
          lte(appointments.scheduledFor, weekAhead),
        ),
      ),
    db
      .select({ value: count() })
      .from(followUpTasks)
      .where(
        and(
          inArray(followUpTasks.facilityId, scopeIds),
          inArray(followUpTasks.status, ["open", "in_progress"]),
          lte(followUpTasks.dueAt, now),
        ),
      ),
    db
      .select({ value: count() })
      .from(followUpTasks)
      .where(
        and(
          inArray(followUpTasks.facilityId, scopeIds),
          inArray(followUpTasks.status, ["open", "in_progress"]),
          inArray(followUpTasks.kind, ["manual_review", "missed_appointment"]),
        ),
      ),
    db
      .select({ value: count() })
      .from(referrals)
      .where(
        and(
          inScope,
          inArray(referrals.status, ["closed", "follow_up_completed", "care_completed"]),
          gte(referrals.updatedAt, thirtyDaysAgo),
        ),
      ),
  ]);

  return {
    activeReferrals: active[0]?.value ?? 0,
    awaitingAcknowledgement: awaiting[0]?.value ?? 0,
    upcomingAppointments: upcoming[0]?.value ?? 0,
    overdueFollowUps: overdue[0]?.value ?? 0,
    awaitingCoordinatorReview: review[0]?.value ?? 0,
    completedPathways: completed[0]?.value ?? 0,
  };
}

/** Recent referral activity across the user's facilities. */
export async function recentActivity(ctx: AuthContext, limit = 12) {
  const scopeIds = accessibleFacilityIds(ctx, "referral:read");
  if (scopeIds.length === 0) return [];

  const actor = aliasedTable(users, "activity_actor");

  return db
    .select({
      id: referralStatusEvents.id,
      referralId: referralStatusEvents.referralId,
      reference: referrals.reference,
      fromStatus: referralStatusEvents.fromStatus,
      toStatus: referralStatusEvents.toStatus,
      occurredAt: referralStatusEvents.occurredAt,
      actorName: actor.fullName,
      actorSystem: referralStatusEvents.actorSystem,
      patientRecordNumber: patients.recordNumber,
    })
    .from(referralStatusEvents)
    .innerJoin(referrals, eq(referrals.id, referralStatusEvents.referralId))
    .innerJoin(patients, eq(patients.id, referrals.patientId))
    .leftJoin(actor, eq(actor.id, referralStatusEvents.actorUserId))
    .where(
      or(
        inArray(referrals.referringFacilityId, scopeIds),
        inArray(referrals.receivingFacilityId, scopeIds),
      ),
    )
    .orderBy(desc(referralStatusEvents.occurredAt))
    .limit(limit);
}

/** Appointments in the next window at the user's facilities. */
export async function upcomingAppointments(ctx: AuthContext, days = 7, limit = 20) {
  const scopeIds = accessibleFacilityIds(ctx, "referral:read");
  if (scopeIds.length === 0) return [];
  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);

  return db
    .select({
      id: appointments.id,
      scheduledFor: appointments.scheduledFor,
      status: appointments.status,
      facilityName: facilities.name,
      referralId: appointments.referralId,
      reference: referrals.reference,
      patientName: sql<string>`${patients.firstName} || ' ' || ${patients.lastName}`,
      patientRecordNumber: patients.recordNumber,
      patientConfirmedAt: appointments.patientConfirmedAt,
      assistanceRequestedAt: appointments.patientAssistanceRequestedAt,
    })
    .from(appointments)
    .innerJoin(referrals, eq(referrals.id, appointments.referralId))
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(facilities, eq(facilities.id, appointments.facilityId))
    .where(
      and(
        inArray(appointments.facilityId, scopeIds),
        inArray(appointments.status, ["scheduled", "rescheduled"]),
        gte(appointments.scheduledFor, now),
        lte(appointments.scheduledFor, until),
      ),
    )
    .orderBy(asc(appointments.scheduledFor))
    .limit(limit);
}
