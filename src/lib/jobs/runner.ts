import "server-only";

import { and, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  facilities,
  followUpTasks,
  messages,
  referralStatusEvents,
  referrals,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { resolvePolicy } from "@/lib/coordination/policies";
import { createTask } from "@/lib/coordination/tasks";
import { queueMessage, processPendingMessages } from "@/lib/messaging/dispatch";
import { notifyFacility } from "@/lib/notifications";
import { pruneRateLimits } from "@/lib/rate-limit";
import { pruneSessions } from "@/lib/auth/session";
import { formatDate, formatTime } from "@/lib/utils";

/**
 * Scheduled work.
 *
 * These jobs are the only part of the system that changes a referral without a
 * person acting. They are deliberately conservative: a job may raise a task,
 * send a reminder or mark an elapsed appointment as missed, but it never
 * acknowledges, never schedules, never closes a pathway and never makes a
 * clinical judgement.
 *
 * Every job is idempotent, so running the runner twice in one window changes
 * nothing the second time.
 */

export type JobResult = { job: string; processed: number; detail?: string };

/** Raises a coordinator task when a referral passes its acknowledgement deadline. */
export async function flagOverdueAcknowledgements(now = new Date()): Promise<JobResult> {
  const pending = await db
    .select({
      id: referrals.id,
      reference: referrals.reference,
      organisationId: referrals.organisationId,
      patientId: referrals.patientId,
      priority: referrals.priority,
      submittedAt: referrals.submittedAt,
      receivingFacilityId: referrals.receivingFacilityId,
    })
    .from(referrals)
    .where(
      and(
        inArray(referrals.status, ["submitted", "received"]),
        isNull(referrals.acknowledgedAt),
        lt(referrals.submittedAt, new Date(now.getTime() - 60 * 60_000)),
      ),
    )
    .limit(500);

  let processed = 0;

  for (const referral of pending) {
    if (!referral.submittedAt) continue;
    const policy = await resolvePolicy(
      referral.organisationId,
      referral.receivingFacilityId,
    );
    const hours =
      referral.priority === "routine"
        ? policy.acknowledgementDueHours
        : policy.urgentAcknowledgementDueHours;
    const deadline = new Date(referral.submittedAt.getTime() + hours * 3_600_000);
    if (deadline > now) continue;

    const result = await createTask({
      organisationId: referral.organisationId,
      patientId: referral.patientId,
      facilityId: referral.receivingFacilityId,
      kind: "acknowledgement_overdue",
      title: `Referral ${referral.reference} is not acknowledged`,
      detail: `Acknowledgement was expected by ${formatDate(deadline)}.`,
      referralId: referral.id,
      dueAt: deadline,
      createdBySystem: "job:acknowledgement_overdue",
      dedupeKey: `acknowledge:${referral.id}`,
    });

    if (result.created) {
      processed += 1;
      await notifyFacility(referral.receivingFacilityId, "task:manage", {
        organisationId: referral.organisationId,
        kind: "escalation_raised",
        title: `Referral ${referral.reference} is overdue for acknowledgement`,
        body: `Expected by ${formatDate(deadline)}.`,
        referralId: referral.id,
        taskId: result.id,
      });
    }
  }

  return { job: "acknowledgement_overdue", processed };
}

/**
 * Marks an appointment as missed once its grace period has elapsed with no
 * attendance recorded, and opens a coordination task at the referring facility.
 */
export async function flagMissedAppointments(now = new Date()): Promise<JobResult> {
  const candidates = await db
    .select({
      appointmentId: appointments.id,
      scheduledFor: appointments.scheduledFor,
      facilityId: appointments.facilityId,
      referralId: appointments.referralId,
      organisationId: appointments.organisationId,
      patientId: appointments.patientId,
      reference: referrals.reference,
      referralStatus: referrals.status,
      referringFacilityId: referrals.referringFacilityId,
      referringFacilityName: facilities.name,
    })
    .from(appointments)
    .innerJoin(referrals, eq(referrals.id, appointments.referralId))
    .innerJoin(facilities, eq(facilities.id, referrals.referringFacilityId))
    .where(
      and(
        inArray(appointments.status, ["scheduled", "rescheduled"]),
        lt(appointments.scheduledFor, now),
        eq(referrals.status, "appointment_scheduled"),
      ),
    )
    .limit(500);

  let processed = 0;

  for (const candidate of candidates) {
    const policy = await resolvePolicy(candidate.organisationId, candidate.facilityId);
    const graceEnds = new Date(
      candidate.scheduledFor.getTime() + policy.missedAppointmentGraceHours * 3_600_000,
    );
    if (graceEnds > now) continue;

    await db.transaction(async (tx) => {
      await tx
        .update(appointments)
        .set({ status: "missed", updatedAt: now })
        .where(eq(appointments.id, candidate.appointmentId));

      await tx
        .update(referrals)
        .set({ status: "missed_appointment", updatedAt: now })
        .where(eq(referrals.id, candidate.referralId));

      await tx.insert(referralStatusEvents).values({
        referralId: candidate.referralId,
        organisationId: candidate.organisationId,
        fromStatus: "appointment_scheduled",
        toStatus: "missed_appointment",
        actorSystem: "job:missed_appointment",
        facilityId: candidate.facilityId,
        note: `No attendance was recorded within ${policy.missedAppointmentGraceHours} hours of the appointment.`,
      });

      await recordAudit(
        {
          organisationId: candidate.organisationId,
          actorSystem: "job:missed_appointment",
          action: "referral.transition",
          resourceType: "referral",
          resourceId: candidate.referralId,
          metadata: {
            referralReference: candidate.reference,
            fromStatus: "appointment_scheduled",
            toStatus: "missed_appointment",
          },
        },
        tx,
      );
    });

    const task = await createTask({
      organisationId: candidate.organisationId,
      patientId: candidate.patientId,
      facilityId: candidate.referringFacilityId,
      kind: "missed_appointment",
      title: `Missed appointment on referral ${candidate.reference}`,
      detail:
        "No attendance was recorded within the grace period. Contact the patient and record the outcome.",
      referralId: candidate.referralId,
      dueAt: new Date(now.getTime() + 48 * 3_600_000),
      createdBySystem: "job:missed_appointment",
      dedupeKey: `missed:${candidate.referralId}:${candidate.appointmentId}`,
    });

    if (task.created) {
      await notifyFacility(candidate.referringFacilityId, "task:manage", {
        organisationId: candidate.organisationId,
        kind: "appointment_missed",
        title: `Missed appointment on ${candidate.reference}`,
        body: "Coordinator follow up is required.",
        referralId: candidate.referralId,
        taskId: task.id,
      });
    }

    await queueMessage({
      organisationId: candidate.organisationId,
      patientId: candidate.patientId,
      referralId: candidate.referralId,
      templateKey: "appointment_missed",
      variables: { facilityName: candidate.referringFacilityName },
      idempotencyKey: `appointment_missed:${candidate.appointmentId}`,
    });

    processed += 1;
  }

  return { job: "missed_appointment", processed };
}

/** Queues appointment reminders inside the configured lead time. */
export async function queueAppointmentReminders(now = new Date()): Promise<JobResult> {
  const horizon = new Date(now.getTime() + 7 * 86_400_000);

  const upcoming = await db
    .select({
      appointmentId: appointments.id,
      scheduledFor: appointments.scheduledFor,
      facilityId: appointments.facilityId,
      facilityName: facilities.name,
      organisationId: appointments.organisationId,
      patientId: appointments.patientId,
      referralId: appointments.referralId,
    })
    .from(appointments)
    .innerJoin(facilities, eq(facilities.id, appointments.facilityId))
    .where(
      and(
        inArray(appointments.status, ["scheduled", "rescheduled"]),
        lte(appointments.scheduledFor, horizon),
        sql`${appointments.scheduledFor} > ${now}`,
      ),
    )
    .limit(500);

  let processed = 0;

  for (const appointment of upcoming) {
    const policy = await resolvePolicy(appointment.organisationId, appointment.facilityId);
    const sendFrom = new Date(
      appointment.scheduledFor.getTime() - policy.appointmentReminderLeadHours * 3_600_000,
    );
    if (now < sendFrom) continue;

    const outcome = await queueMessage({
      organisationId: appointment.organisationId,
      patientId: appointment.patientId,
      referralId: appointment.referralId,
      appointmentId: appointment.appointmentId,
      templateKey: "appointment_reminder",
      variables: {
        facilityName: appointment.facilityName,
        date: formatDate(appointment.scheduledFor),
        time: formatTime(appointment.scheduledFor),
      },
      idempotencyKey: `appointment_reminder:${appointment.appointmentId}`,
    });

    if (outcome.status !== "skipped") processed += 1;
  }

  return { job: "appointment_reminders", processed };
}

/** Opens a coordination task when an outbound message could not be delivered. */
export async function flagCommunicationFailures(): Promise<JobResult> {
  const failures = await db
    .select({
      messageId: messages.id,
      organisationId: messages.organisationId,
      patientId: messages.patientId,
      referralId: messages.referralId,
      reference: referrals.reference,
      referringFacilityId: referrals.referringFacilityId,
      errorDetail: messages.errorDetail,
    })
    .from(messages)
    .innerJoin(referrals, eq(referrals.id, messages.referralId))
    .where(
      and(
        inArray(messages.status, ["failed", "undeliverable"]),
        inArray(referrals.status, [
          "submitted",
          "received",
          "acknowledged",
          "appointment_scheduled",
          "missed_appointment",
          "follow_up_required",
          "escalated",
        ]),
      ),
    )
    .limit(300);

  let processed = 0;

  for (const failure of failures) {
    if (!failure.patientId || !failure.referralId) continue;
    const task = await createTask({
      organisationId: failure.organisationId,
      patientId: failure.patientId,
      facilityId: failure.referringFacilityId,
      kind: "communication_failure",
      title: `Message could not be delivered for ${failure.reference}`,
      detail: failure.errorDetail ?? "The provider rejected or failed to deliver the message.",
      referralId: failure.referralId,
      createdBySystem: "job:communication_failure",
      dedupeKey: `comms_failure:${failure.messageId}`,
    });
    if (task.created) processed += 1;
  }

  return { job: "communication_failures", processed };
}

/** Reminds the referring facility when a follow up task passes its due time. */
export async function notifyOverdueFollowUps(now = new Date()): Promise<JobResult> {
  const overdue = await db
    .select({
      id: followUpTasks.id,
      organisationId: followUpTasks.organisationId,
      facilityId: followUpTasks.facilityId,
      title: followUpTasks.title,
      referralId: followUpTasks.referralId,
      dueAt: followUpTasks.dueAt,
    })
    .from(followUpTasks)
    .where(
      and(
        inArray(followUpTasks.status, ["open", "in_progress"]),
        inArray(followUpTasks.kind, ["follow_up_due", "clinical_follow_up"]),
        lt(followUpTasks.dueAt, now),
      ),
    )
    .limit(200);

  for (const task of overdue) {
    await notifyFacility(task.facilityId, "task:manage", {
      organisationId: task.organisationId,
      kind: "escalation_raised",
      title: `Follow up overdue: ${task.title}`,
      body: task.dueAt ? `Was due ${formatDate(task.dueAt)}.` : undefined,
      referralId: task.referralId,
      taskId: task.id,
    });
  }

  return { job: "overdue_follow_ups", processed: overdue.length };
}

export async function runMaintenance(): Promise<JobResult> {
  await pruneSessions();
  await pruneRateLimits();
  return { job: "maintenance", processed: 1 };
}

/** Runs every scheduled job in order and reports what each one did. */
export async function runAllJobs(now = new Date()): Promise<JobResult[]> {
  const results: JobResult[] = [];
  const jobs: Array<() => Promise<JobResult>> = [
    () => flagOverdueAcknowledgements(now),
    () => flagMissedAppointments(now),
    () => queueAppointmentReminders(now),
    () => flagCommunicationFailures(),
    () => notifyOverdueFollowUps(now),
    async () => {
      const dispatch = await processPendingMessages(100, now);
      return {
        job: "message_dispatch",
        processed: dispatch.sent,
        detail: `${dispatch.considered} considered, ${dispatch.stillQueued} still queued, ${dispatch.failed} failed`,
      };
    },
    () => runMaintenance(),
  ];

  for (const job of jobs) {
    try {
      results.push(await job());
    } catch (error) {
      console.error("[kea] scheduled job failed", error);
      results.push({
        job: "unknown",
        processed: 0,
        detail: error instanceof Error ? error.message : "failed",
      });
    }
  }

  return results;
}
