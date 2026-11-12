import "server-only";

import { and, eq, isNull, or } from "drizzle-orm";

import { db, type Executor } from "@/db";
import { escalationPolicies, type EscalationPolicy } from "@/db/schema";

/**
 * Escalation policy resolution.
 *
 * Deadlines are configuration, not constants in the workflow code. A facility
 * level policy overrides the organisation default; the built in defaults below
 * apply only until an administrator saves a policy.
 */

export type ResolvedPolicy = {
  acknowledgementDueHours: number;
  urgentAcknowledgementDueHours: number;
  missedAppointmentGraceHours: number;
  followUpDueDays: number;
  contactAttemptsBeforeEscalation: number;
  appointmentReminderLeadHours: number;
  source: "facility" | "organisation" | "default";
};

export const DEFAULT_POLICY: ResolvedPolicy = {
  acknowledgementDueHours: 48,
  urgentAcknowledgementDueHours: 6,
  missedAppointmentGraceHours: 24,
  followUpDueDays: 14,
  contactAttemptsBeforeEscalation: 3,
  appointmentReminderLeadHours: 48,
  source: "default",
};

function fromRow(row: EscalationPolicy, source: "facility" | "organisation"): ResolvedPolicy {
  return {
    acknowledgementDueHours: row.acknowledgementDueHours,
    urgentAcknowledgementDueHours: row.urgentAcknowledgementDueHours,
    missedAppointmentGraceHours: row.missedAppointmentGraceHours,
    followUpDueDays: row.followUpDueDays,
    contactAttemptsBeforeEscalation: row.contactAttemptsBeforeEscalation,
    appointmentReminderLeadHours: row.appointmentReminderLeadHours,
    source,
  };
}

export async function resolvePolicy(
  organisationId: string,
  facilityId: string | null,
  executor: Executor = db,
): Promise<ResolvedPolicy> {
  const rows = await executor
    .select()
    .from(escalationPolicies)
    .where(
      and(
        eq(escalationPolicies.organisationId, organisationId),
        facilityId
          ? or(eq(escalationPolicies.facilityId, facilityId), isNull(escalationPolicies.facilityId))
          : isNull(escalationPolicies.facilityId),
      ),
    );

  const facilityRow = rows.find((row) => row.facilityId === facilityId && facilityId !== null);
  if (facilityRow) return fromRow(facilityRow, "facility");

  const organisationRow = rows.find((row) => row.facilityId === null);
  if (organisationRow) return fromRow(organisationRow, "organisation");

  return DEFAULT_POLICY;
}

/** Deadline by which a referral of the given priority should be acknowledged. */
export function acknowledgementDeadline(
  policy: ResolvedPolicy,
  priority: "routine" | "urgent" | "emergency",
  submittedAt: Date,
): Date {
  const hours =
    priority === "routine" ? policy.acknowledgementDueHours : policy.urgentAcknowledgementDueHours;
  return new Date(submittedAt.getTime() + hours * 3_600_000);
}
