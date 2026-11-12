import "server-only";

import { aliasedTable, and, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  facilities,
  followUpTasks,
  referralStatusEvents,
  referrals,
} from "@/db/schema";
import { accessibleFacilityIds, type AuthContext } from "@/lib/auth/context";

/**
 * Analytics.
 *
 * Every figure here is derived from stored referral events. The calculation for
 * each one is documented beside it and repeated in `docs/analytics.md`, so a
 * programme manager can reconcile a number without reading the query.
 *
 * Disclosure control: any breakdown row whose denominator is below
 * SMALL_CELL_THRESHOLD is suppressed rather than shown, because a rate over a
 * handful of referrals can identify an individual.
 */

export const SMALL_CELL_THRESHOLD = 5;

export type AnalyticsRange = { from: Date; to: Date };

export function defaultRange(now = new Date()): AnalyticsRange {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 90);
  return { from, to };
}

export function rangeFromDays(days: number, now = new Date()): AnalyticsRange {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from, to };
}

export type HeadlineMetrics = {
  created: number;
  submitted: number;
  acknowledged: number;
  appointmentsBooked: number;
  attended: number;
  completed: number;
  closed: number;
  /** closed or follow up completed divided by submitted. */
  completionRate: number | null;
  /** acknowledged divided by submitted. */
  acknowledgementRate: number | null;
  /** Median hours from submission to acknowledgement. */
  medianAcknowledgementHours: number | null;
  /** missed divided by (missed plus attended). */
  missedAppointmentRate: number | null;
  /** Resolved follow up tasks divided by all follow up tasks created. */
  followUpCompletionRate: number | null;
  suppressed: boolean;
};

function scope(ctx: AuthContext) {
  return accessibleFacilityIds(ctx, "analytics:read").length > 0
    ? accessibleFacilityIds(ctx, "analytics:read")
    : accessibleFacilityIds(ctx, "referral:read");
}

function inScope(facilityIds: string[]) {
  return or(
    inArray(referrals.referringFacilityId, facilityIds),
    inArray(referrals.receivingFacilityId, facilityIds),
  );
}

export async function headlineMetrics(
  ctx: AuthContext,
  range: AnalyticsRange,
  facilityId?: string | null,
): Promise<HeadlineMetrics> {
  const facilityIds = facilityId ? [facilityId] : scope(ctx);
  const empty: HeadlineMetrics = {
    created: 0,
    submitted: 0,
    acknowledged: 0,
    appointmentsBooked: 0,
    attended: 0,
    completed: 0,
    closed: 0,
    completionRate: null,
    acknowledgementRate: null,
    medianAcknowledgementHours: null,
    missedAppointmentRate: null,
    followUpCompletionRate: null,
    suppressed: false,
  };
  if (facilityIds.length === 0) return empty;

  const window = and(
    inScope(facilityIds),
    gte(referrals.createdAt, range.from),
    lte(referrals.createdAt, range.to),
  );

  const [totals] = await db
    .select({
      created: count(),
      submitted: sql<number>`count(*) filter (where ${referrals.submittedAt} is not null)::int`,
      acknowledged: sql<number>`count(*) filter (where ${referrals.acknowledgedAt} is not null)::int`,
      booked: sql<number>`count(*) filter (where ${referrals.firstAppointmentAt} is not null)::int`,
      attended: sql<number>`count(*) filter (where ${referrals.attendedAt} is not null)::int`,
      careCompleted: sql<number>`count(*) filter (where ${referrals.careCompletedAt} is not null)::int`,
      closed: sql<number>`count(*) filter (where ${referrals.status} in ('closed','follow_up_completed'))::int`,
      medianAckHours: sql<number | null>`
        percentile_cont(0.5) within group (
          order by extract(epoch from (${referrals.acknowledgedAt} - ${referrals.submittedAt})) / 3600.0
        ) filter (where ${referrals.acknowledgedAt} is not null and ${referrals.submittedAt} is not null)
      `,
    })
    .from(referrals)
    .where(window);

  const [appointmentTotals] = await db
    .select({
      missed: sql<number>`count(*) filter (where ${appointments.status} = 'missed')::int`,
      attended: sql<number>`count(*) filter (where ${appointments.status} = 'attended')::int`,
    })
    .from(appointments)
    .innerJoin(referrals, eq(referrals.id, appointments.referralId))
    .where(
      and(
        inScope(facilityIds),
        gte(appointments.scheduledFor, range.from),
        lte(appointments.scheduledFor, range.to),
      ),
    );

  const [followUpTotals] = await db
    .select({
      total: count(),
      resolved: sql<number>`count(*) filter (where ${followUpTasks.status} = 'resolved')::int`,
    })
    .from(followUpTasks)
    .where(
      and(
        inArray(followUpTasks.facilityId, facilityIds),
        inArray(followUpTasks.kind, ["follow_up_due", "clinical_follow_up"]),
        gte(followUpTasks.createdAt, range.from),
        lte(followUpTasks.createdAt, range.to),
      ),
    );

  const submitted = totals?.submitted ?? 0;
  const resolvedAppointments =
    (appointmentTotals?.missed ?? 0) + (appointmentTotals?.attended ?? 0);
  const followUpCreated = followUpTotals?.total ?? 0;

  return {
    created: totals?.created ?? 0,
    submitted,
    acknowledged: totals?.acknowledged ?? 0,
    appointmentsBooked: totals?.booked ?? 0,
    attended: totals?.attended ?? 0,
    completed: totals?.careCompleted ?? 0,
    closed: totals?.closed ?? 0,
    completionRate: submitted >= SMALL_CELL_THRESHOLD ? (totals?.closed ?? 0) / submitted : null,
    acknowledgementRate:
      submitted >= SMALL_CELL_THRESHOLD ? (totals?.acknowledged ?? 0) / submitted : null,
    medianAcknowledgementHours:
      totals?.medianAckHours !== null && totals?.medianAckHours !== undefined
        ? Number(Number(totals.medianAckHours).toFixed(2))
        : null,
    missedAppointmentRate:
      resolvedAppointments >= SMALL_CELL_THRESHOLD
        ? (appointmentTotals?.missed ?? 0) / resolvedAppointments
        : null,
    followUpCompletionRate:
      followUpCreated >= SMALL_CELL_THRESHOLD
        ? (followUpTotals?.resolved ?? 0) / followUpCreated
        : null,
    suppressed: submitted > 0 && submitted < SMALL_CELL_THRESHOLD,
  };
}

export type TrendPoint = {
  period: string;
  created: number;
  acknowledged: number;
  completed: number;
};

/** Referral volume by week, used for the trend chart. */
export async function referralTrend(
  ctx: AuthContext,
  range: AnalyticsRange,
  facilityId?: string | null,
): Promise<TrendPoint[]> {
  const facilityIds = facilityId ? [facilityId] : scope(ctx);
  if (facilityIds.length === 0) return [];

  const rows = await db
    .select({
      period: sql<string>`to_char(date_trunc('week', ${referrals.createdAt}), 'YYYY-MM-DD')`,
      created: count(),
      acknowledged: sql<number>`count(*) filter (where ${referrals.acknowledgedAt} is not null)::int`,
      completed: sql<number>`count(*) filter (where ${referrals.status} in ('closed','follow_up_completed'))::int`,
    })
    .from(referrals)
    .where(
      and(
        inScope(facilityIds),
        gte(referrals.createdAt, range.from),
        lte(referrals.createdAt, range.to),
      ),
    )
    .groupBy(sql`date_trunc('week', ${referrals.createdAt})`)
    .orderBy(sql`date_trunc('week', ${referrals.createdAt})`);

  return rows;
}

export type FacilityBreakdown = {
  facilityId: string;
  facilityName: string;
  submitted: number;
  acknowledged: number;
  completed: number;
  medianAcknowledgementHours: number | null;
  completionRate: number | null;
  suppressed: boolean;
};

/** Referral volume and performance by receiving facility. */
export async function facilityBreakdown(
  ctx: AuthContext,
  range: AnalyticsRange,
): Promise<FacilityBreakdown[]> {
  const facilityIds = scope(ctx);
  if (facilityIds.length === 0) return [];

  const receiving = aliasedTable(facilities, "analytics_receiving");

  const rows = await db
    .select({
      facilityId: receiving.id,
      facilityName: receiving.name,
      submitted: sql<number>`count(*) filter (where ${referrals.submittedAt} is not null)::int`,
      acknowledged: sql<number>`count(*) filter (where ${referrals.acknowledgedAt} is not null)::int`,
      completed: sql<number>`count(*) filter (where ${referrals.status} in ('closed','follow_up_completed'))::int`,
      medianAckHours: sql<number | null>`
        percentile_cont(0.5) within group (
          order by extract(epoch from (${referrals.acknowledgedAt} - ${referrals.submittedAt})) / 3600.0
        ) filter (where ${referrals.acknowledgedAt} is not null and ${referrals.submittedAt} is not null)
      `,
    })
    .from(referrals)
    .innerJoin(receiving, eq(receiving.id, referrals.receivingFacilityId))
    .where(
      and(
        inScope(facilityIds),
        gte(referrals.createdAt, range.from),
        lte(referrals.createdAt, range.to),
      ),
    )
    .groupBy(receiving.id, receiving.name)
    .orderBy(desc(sql`count(*)`));

  return rows.map((row) => {
    const suppressed = row.submitted < SMALL_CELL_THRESHOLD;
    return {
      facilityId: row.facilityId,
      facilityName: row.facilityName,
      submitted: row.submitted,
      acknowledged: row.acknowledged,
      completed: row.completed,
      medianAcknowledgementHours:
        suppressed || row.medianAckHours === null
          ? null
          : Number(Number(row.medianAckHours).toFixed(2)),
      completionRate: suppressed ? null : row.completed / Math.max(1, row.submitted),
      suppressed,
    };
  });
}

export type BottleneckRow = { status: string; count: number; medianAgeHours: number | null };

/** Where open referrals are currently sitting. */
export async function pathwayBottlenecks(
  ctx: AuthContext,
  facilityId?: string | null,
): Promise<BottleneckRow[]> {
  const facilityIds = facilityId ? [facilityId] : scope(ctx);
  if (facilityIds.length === 0) return [];

  const rows = await db
    .select({
      status: referrals.status,
      count: count(),
      medianAgeHours: sql<number | null>`
        percentile_cont(0.5) within group (
          order by extract(epoch from (now() - ${referrals.updatedAt})) / 3600.0
        )
      `,
    })
    .from(referrals)
    .where(
      and(
        inScope(facilityIds),
        inArray(referrals.status, [
          "submitted",
          "received",
          "acknowledged",
          "appointment_scheduled",
          "patient_attended",
          "care_completed",
          "follow_up_required",
          "missed_appointment",
          "unable_to_contact",
          "escalated",
        ]),
      ),
    )
    .groupBy(referrals.status)
    .orderBy(desc(count()));

  return rows.map((row) => ({
    status: row.status,
    count: row.count,
    medianAgeHours:
      row.medianAgeHours === null ? null : Number(Number(row.medianAgeHours).toFixed(1)),
  }));
}

export type ExceptionBreakdown = { status: string; count: number };

export async function exceptionBreakdown(
  ctx: AuthContext,
  range: AnalyticsRange,
): Promise<ExceptionBreakdown[]> {
  const facilityIds = scope(ctx);
  if (facilityIds.length === 0) return [];

  const rows = await db
    .select({ status: referralStatusEvents.toStatus, count: count() })
    .from(referralStatusEvents)
    .innerJoin(referrals, eq(referrals.id, referralStatusEvents.referralId))
    .where(
      and(
        inScope(facilityIds),
        inArray(referralStatusEvents.toStatus, [
          "rejected",
          "cancelled",
          "missed_appointment",
          "unable_to_contact",
          "escalated",
        ]),
        gte(referralStatusEvents.occurredAt, range.from),
        lte(referralStatusEvents.occurredAt, range.to),
      ),
    )
    .groupBy(referralStatusEvents.toStatus)
    .orderBy(desc(count()));

  return rows;
}

/** Flat rows for the aggregate CSV export. Contains no patient level data. */
export async function aggregateExportRows(ctx: AuthContext, range: AnalyticsRange) {
  const [headline, breakdown, bottlenecks, exceptions] = await Promise.all([
    headlineMetrics(ctx, range),
    facilityBreakdown(ctx, range),
    pathwayBottlenecks(ctx),
    exceptionBreakdown(ctx, range),
  ]);

  const rows: { section: string; label: string; value: string }[] = [
    { section: "period", label: "from", value: range.from.toISOString().slice(0, 10) },
    { section: "period", label: "to", value: range.to.toISOString().slice(0, 10) },
    { section: "headline", label: "referrals_created", value: String(headline.created) },
    { section: "headline", label: "referrals_submitted", value: String(headline.submitted) },
    { section: "headline", label: "referrals_acknowledged", value: String(headline.acknowledged) },
    { section: "headline", label: "appointments_booked", value: String(headline.appointmentsBooked) },
    { section: "headline", label: "patients_attended", value: String(headline.attended) },
    { section: "headline", label: "care_completed", value: String(headline.completed) },
    { section: "headline", label: "pathways_closed", value: String(headline.closed) },
    {
      section: "headline",
      label: "completion_rate",
      value: headline.completionRate === null ? "suppressed" : headline.completionRate.toFixed(4),
    },
    {
      section: "headline",
      label: "median_acknowledgement_hours",
      value:
        headline.medianAcknowledgementHours === null
          ? "not_available"
          : String(headline.medianAcknowledgementHours),
    },
    {
      section: "headline",
      label: "missed_appointment_rate",
      value:
        headline.missedAppointmentRate === null
          ? "suppressed"
          : headline.missedAppointmentRate.toFixed(4),
    },
  ];

  for (const row of breakdown) {
    rows.push({
      section: "facility",
      label: `${row.facilityName} submitted`,
      value: String(row.submitted),
    });
    rows.push({
      section: "facility",
      label: `${row.facilityName} completion_rate`,
      value: row.completionRate === null ? "suppressed" : row.completionRate.toFixed(4),
    });
  }

  for (const row of bottlenecks) {
    rows.push({ section: "open_by_status", label: row.status, value: String(row.count) });
  }

  for (const row of exceptions) {
    rows.push({ section: "exception_events", label: row.status, value: String(row.count) });
  }

  return rows;
}
