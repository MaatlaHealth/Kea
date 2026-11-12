import "server-only";

import { and, asc, count, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  contactAttempts,
  escalations,
  facilities,
  followUpTasks,
  messages,
  patients,
  referrals,
  users,
  type TaskKind,
  type TaskStatus,
} from "@/db/schema";
import { accessibleFacilityIds, type AuthContext } from "@/lib/auth/context";
import { NotFoundError } from "@/lib/errors";
import { ACTIVE_STATUSES } from "@/lib/referrals/state-machine";

/**
 * Coordination queries.
 *
 * Every query is scoped to the facilities the user may work tasks at. A
 * coordinator never sees a queue entry for a facility they have no role at.
 */

export type TaskFilters = {
  kinds?: TaskKind[];
  statuses?: TaskStatus[];
  assignment?: "any" | "mine" | "unassigned";
  facilityId?: string | null;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export async function listTasks(ctx: AuthContext, filters: TaskFilters = {}) {
  const scopeIds = accessibleFacilityIds(ctx, "task:read");
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));

  if (scopeIds.length === 0) return { rows: [], total: 0, page, pageSize };

  const conditions = [
    inArray(followUpTasks.facilityId, filters.facilityId ? [filters.facilityId] : scopeIds),
    inArray(followUpTasks.status, filters.statuses ?? ["open", "in_progress"]),
  ];

  if (filters.kinds?.length) conditions.push(inArray(followUpTasks.kind, filters.kinds));
  if (filters.assignment === "mine") {
    conditions.push(eq(followUpTasks.assignedToUserId, ctx.userId));
  } else if (filters.assignment === "unassigned") {
    conditions.push(isNull(followUpTasks.assignedToUserId));
  }
  if (filters.overdueOnly) conditions.push(lte(followUpTasks.dueAt, new Date()));

  const where = and(...conditions);

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: followUpTasks.id,
        kind: followUpTasks.kind,
        status: followUpTasks.status,
        title: followUpTasks.title,
        detail: followUpTasks.detail,
        dueAt: followUpTasks.dueAt,
        createdAt: followUpTasks.createdAt,
        referralId: followUpTasks.referralId,
        referralReference: referrals.reference,
        referralStatus: referrals.status,
        patientId: followUpTasks.patientId,
        patientName: sql<string>`${patients.firstName} || ' ' || ${patients.lastName}`,
        patientRecordNumber: patients.recordNumber,
        facilityName: facilities.name,
        assignedToUserId: followUpTasks.assignedToUserId,
        assigneeName: users.fullName,
        contactAttemptCount: sql<number>`(
          select count(*)::int from contact_attempts ca where ca.task_id = ${followUpTasks.id}
        )`,
      })
      .from(followUpTasks)
      .innerJoin(patients, eq(patients.id, followUpTasks.patientId))
      .innerJoin(facilities, eq(facilities.id, followUpTasks.facilityId))
      .leftJoin(referrals, eq(referrals.id, followUpTasks.referralId))
      .leftJoin(users, eq(users.id, followUpTasks.assignedToUserId))
      .where(where)
      .orderBy(
        sql`case when ${followUpTasks.dueAt} is null then 1 else 0 end`,
        asc(followUpTasks.dueAt),
        desc(followUpTasks.createdAt),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(followUpTasks).where(where),
  ]);

  return { rows, total: totalRow[0]?.value ?? 0, page, pageSize };
}

export async function openTasksForUser(ctx: AuthContext, limit = 6) {
  const scopeIds = accessibleFacilityIds(ctx, "task:read");
  if (scopeIds.length === 0) return [];

  return db
    .select({
      id: followUpTasks.id,
      title: followUpTasks.title,
      dueAt: followUpTasks.dueAt,
      kind: followUpTasks.kind,
    })
    .from(followUpTasks)
    .where(
      and(
        inArray(followUpTasks.facilityId, scopeIds),
        inArray(followUpTasks.status, ["open", "in_progress"]),
        or(eq(followUpTasks.assignedToUserId, ctx.userId), isNull(followUpTasks.assignedToUserId)),
      ),
    )
    .orderBy(
      sql`case when ${followUpTasks.dueAt} is null then 1 else 0 end`,
      asc(followUpTasks.dueAt),
    )
    .limit(limit);
}

export async function getTaskDetail(ctx: AuthContext, taskId: string) {
  const scopeIds = accessibleFacilityIds(ctx, "task:read");
  if (scopeIds.length === 0) throw new NotFoundError("That task is not available to you.");

  const [row] = await db
    .select({
      task: followUpTasks,
      patient: patients,
      facilityName: facilities.name,
      referralReference: referrals.reference,
      referralStatus: referrals.status,
      referringFacilityId: referrals.referringFacilityId,
      receivingFacilityId: referrals.receivingFacilityId,
    })
    .from(followUpTasks)
    .innerJoin(patients, eq(patients.id, followUpTasks.patientId))
    .innerJoin(facilities, eq(facilities.id, followUpTasks.facilityId))
    .leftJoin(referrals, eq(referrals.id, followUpTasks.referralId))
    .where(and(eq(followUpTasks.id, taskId), inArray(followUpTasks.facilityId, scopeIds)))
    .limit(1);

  if (!row) throw new NotFoundError("That task is not available to you.");

  const [attempts, relatedMessages, appointmentRows, escalationRows] = await Promise.all([
    db
      .select({
        id: contactAttempts.id,
        channel: contactAttempts.channel,
        outcome: contactAttempts.outcome,
        note: contactAttempts.note,
        attemptedAt: contactAttempts.attemptedAt,
        attemptedByName: users.fullName,
      })
      .from(contactAttempts)
      .leftJoin(users, eq(users.id, contactAttempts.attemptedByUserId))
      .where(eq(contactAttempts.taskId, taskId))
      .orderBy(desc(contactAttempts.attemptedAt)),
    row.task.referralId
      ? db
          .select({
            id: messages.id,
            channel: messages.channel,
            status: messages.status,
            templateKey: messages.templateKey,
            createdAt: messages.createdAt,
            errorDetail: messages.errorDetail,
          })
          .from(messages)
          .where(eq(messages.referralId, row.task.referralId))
          .orderBy(desc(messages.createdAt))
          .limit(10)
      : Promise.resolve([]),
    row.task.referralId
      ? db
          .select()
          .from(appointments)
          .where(eq(appointments.referralId, row.task.referralId))
          .orderBy(desc(appointments.scheduledFor))
      : Promise.resolve([]),
    row.task.referralId
      ? db
          .select()
          .from(escalations)
          .where(eq(escalations.referralId, row.task.referralId))
          .orderBy(desc(escalations.createdAt))
      : Promise.resolve([]),
  ]);

  return {
    task: row.task,
    patient: row.patient,
    facilityName: row.facilityName,
    referralReference: row.referralReference,
    referralStatus: row.referralStatus,
    referringFacilityId: row.referringFacilityId,
    receivingFacilityId: row.receivingFacilityId,
    contactAttempts: attempts,
    messages: relatedMessages,
    appointments: appointmentRows,
    escalations: escalationRows,
  };
}

/** Counts for the coordination workspace tabs. */
export async function coordinationCounts(ctx: AuthContext, now = new Date()) {
  const scopeIds = accessibleFacilityIds(ctx, "task:read");
  if (scopeIds.length === 0) {
    return {
      unacknowledged: 0,
      missedAppointments: 0,
      overdueFollowUps: 0,
      communicationFailures: 0,
      manualReview: 0,
      assignedToMe: 0,
    };
  }

  const openAt = and(
    inArray(followUpTasks.facilityId, scopeIds),
    inArray(followUpTasks.status, ["open", "in_progress"]),
  );

  const [unack, missed, overdue, comms, manual, mine] = await Promise.all([
    db
      .select({ value: count() })
      .from(referrals)
      .where(
        and(
          inArray(referrals.receivingFacilityId, scopeIds),
          inArray(referrals.status, ["submitted", "received"]),
        ),
      ),
    db
      .select({ value: count() })
      .from(followUpTasks)
      .where(and(openAt, eq(followUpTasks.kind, "missed_appointment"))),
    db
      .select({ value: count() })
      .from(followUpTasks)
      .where(and(openAt, eq(followUpTasks.kind, "follow_up_due"), lte(followUpTasks.dueAt, now))),
    db
      .select({ value: count() })
      .from(followUpTasks)
      .where(and(openAt, eq(followUpTasks.kind, "communication_failure"))),
    db
      .select({ value: count() })
      .from(followUpTasks)
      .where(and(openAt, eq(followUpTasks.kind, "manual_review"))),
    db
      .select({ value: count() })
      .from(followUpTasks)
      .where(and(openAt, eq(followUpTasks.assignedToUserId, ctx.userId))),
  ]);

  return {
    unacknowledged: unack[0]?.value ?? 0,
    missedAppointments: missed[0]?.value ?? 0,
    overdueFollowUps: overdue[0]?.value ?? 0,
    communicationFailures: comms[0]?.value ?? 0,
    manualReview: manual[0]?.value ?? 0,
    assignedToMe: mine[0]?.value ?? 0,
  };
}

/** Referrals that have not been acknowledged, ordered by how long they have waited. */
export async function unacknowledgedReferrals(ctx: AuthContext, limit = 50) {
  const scopeIds = accessibleFacilityIds(ctx, "task:read");
  if (scopeIds.length === 0) return [];

  return db
    .select({
      id: referrals.id,
      reference: referrals.reference,
      status: referrals.status,
      priority: referrals.priority,
      submittedAt: referrals.submittedAt,
      createdAt: referrals.createdAt,
      patientName: sql<string>`${patients.firstName} || ' ' || ${patients.lastName}`,
      patientRecordNumber: patients.recordNumber,
      receivingFacilityName: facilities.name,
    })
    .from(referrals)
    .innerJoin(patients, eq(patients.id, referrals.patientId))
    .innerJoin(facilities, eq(facilities.id, referrals.receivingFacilityId))
    .where(
      and(
        inArray(referrals.receivingFacilityId, scopeIds),
        inArray(referrals.status, ["submitted", "received"]),
      ),
    )
    .orderBy(asc(referrals.submittedAt))
    .limit(limit);
}

/** Referrals whose last outbound message failed to reach the patient. */
export async function failedCommunications(ctx: AuthContext, limit = 50) {
  const scopeIds = accessibleFacilityIds(ctx, "message:read");
  if (scopeIds.length === 0) return [];

  return db
    .select({
      id: messages.id,
      referralId: messages.referralId,
      reference: referrals.reference,
      channel: messages.channel,
      templateKey: messages.templateKey,
      status: messages.status,
      errorDetail: messages.errorDetail,
      createdAt: messages.createdAt,
      patientId: messages.patientId,
      patientName: sql<string>`${patients.firstName} || ' ' || ${patients.lastName}`,
    })
    .from(messages)
    .innerJoin(referrals, eq(referrals.id, messages.referralId))
    .innerJoin(patients, eq(patients.id, messages.patientId))
    .where(
      and(
        inArray(messages.status, ["failed", "undeliverable"]),
        or(
          inArray(referrals.referringFacilityId, scopeIds),
          inArray(referrals.receivingFacilityId, scopeIds),
        ),
        inArray(referrals.status, [...ACTIVE_STATUSES]),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}
