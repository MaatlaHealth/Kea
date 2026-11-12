import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db, type Executor } from "@/db";
import {
  appointments,
  clinicalNotes,
  escalations,
  facilities,
  patients,
  referralPathways,
  referralStatusEvents,
  referrals,
  type Referral,
  type ReferralPriority,
  type ReferralStatus,
} from "@/db/schema";
import { requirePatientAccess } from "@/lib/access";
import { assertCan, assertFacilityAccess, type AuthContext } from "@/lib/auth/context";
import { generateReference } from "@/lib/auth/tokens";
import { acknowledgementDeadline, resolvePolicy } from "@/lib/coordination/policies";
import { createAndAnnounceTask, resolveTasksForReferral } from "@/lib/coordination/tasks";
import { recordAudit } from "@/lib/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { deliverMessage, queueMessage } from "@/lib/messaging/dispatch";
import { notifyFacility, notifyUsers } from "@/lib/notifications";
import { formatDate, formatTime } from "@/lib/utils";
import { assertTransition, STATUS_LABELS } from "./state-machine";

/**
 * Referral service.
 *
 * Every status change runs inside one transaction that updates the referral,
 * appends an immutable status event, applies the workflow side effects and
 * writes the audit entry. If any part fails, none of it is applied.
 *
 * Provider calls are deliberately kept outside the transaction: messages are
 * recorded as queued inside it and handed to the provider after commit, so a
 * rolled back transition can never result in a message already sent.
 */

export type CreateReferralInput = {
  patientId: string;
  receivingFacilityId: string;
  receivingDepartmentId?: string | null;
  priority: ReferralPriority;
  reasonCategory: string;
  reasonDetail?: string | null;
  clinicalObservations?: string | null;
  requestedActions?: string | null;
  requestedDate?: string | null;
  pregnancyEpisodeId?: string | null;
  /** When true the referral is submitted immediately rather than left as a draft. */
  submit: boolean;
};

async function allocateReference(executor: Executor): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const reference = generateReference("KEA", 6);
    const [existing] = await executor
      .select({ id: referrals.id })
      .from(referrals)
      .where(eq(referrals.reference, reference))
      .limit(1);
    if (!existing) return reference;
  }
  throw new ConflictError("Could not allocate a referral reference. Please try again.");
}

export async function createReferral(
  ctx: AuthContext,
  input: CreateReferralInput,
): Promise<{ id: string; reference: string; status: ReferralStatus }> {
  const { patient } = await requirePatientAccess(ctx, input.patientId);
  const referringFacilityId = patient.homeFacilityId;

  assertFacilityAccess(ctx, referringFacilityId);
  assertCan(ctx, "referral:create", { facilityId: referringFacilityId });
  if (input.submit) {
    assertCan(ctx, "referral:submit", { facilityId: referringFacilityId });
  }

  if (input.receivingFacilityId === referringFacilityId) {
    throw new ValidationError("Choose a receiving facility other than the referring facility.", {
      receivingFacilityId: ["A referral must be sent to a different facility."],
    });
  }

  const [receiving] = await db
    .select({
      id: facilities.id,
      name: facilities.name,
      organisationId: facilities.organisationId,
      isActive: facilities.isActive,
    })
    .from(facilities)
    .where(eq(facilities.id, input.receivingFacilityId))
    .limit(1);

  if (!receiving || !receiving.isActive) {
    throw new ValidationError("That receiving facility is not available.", {
      receivingFacilityId: ["Choose an active facility."],
    });
  }
  if (receiving.organisationId !== patient.organisationId) {
    throw new ValidationError("Referrals cannot cross organisations in this deployment.", {
      receivingFacilityId: ["Choose a facility inside your organisation."],
    });
  }

  const [pathway] = await db
    .select({ id: referralPathways.id })
    .from(referralPathways)
    .where(
      and(
        eq(referralPathways.referringFacilityId, referringFacilityId),
        eq(referralPathways.receivingFacilityId, input.receivingFacilityId),
        eq(referralPathways.isActive, true),
      ),
    )
    .limit(1);

  if (!pathway) {
    throw new ValidationError("That facility is not on your referral pathway list.", {
      receivingFacilityId: ["Ask an administrator to add this pathway."],
    });
  }

  const result = await db.transaction(async (tx) => {
    const reference = await allocateReference(tx);
    const now = new Date();
    const status: ReferralStatus = input.submit ? "submitted" : "draft";

    const [created] = await tx
      .insert(referrals)
      .values({
        reference,
        organisationId: patient.organisationId,
        patientId: patient.id,
        pregnancyEpisodeId: input.pregnancyEpisodeId ?? null,
        referringFacilityId,
        receivingFacilityId: input.receivingFacilityId,
        receivingDepartmentId: input.receivingDepartmentId ?? null,
        status,
        priority: input.priority,
        reasonCategory: input.reasonCategory,
        reasonDetail: input.reasonDetail ?? null,
        clinicalObservations: input.clinicalObservations ?? null,
        requestedActions: input.requestedActions ?? null,
        requestedDate: input.requestedDate ?? null,
        createdByUserId: ctx.userId,
        submittedAt: input.submit ? now : null,
        isSynthetic: patient.isSynthetic,
      })
      .returning();

    await tx.insert(referralStatusEvents).values({
      referralId: created.id,
      organisationId: created.organisationId,
      fromStatus: null,
      toStatus: status,
      actorUserId: ctx.userId,
      facilityId: referringFacilityId,
      note: input.submit ? "Referral created and submitted." : "Referral created as a draft.",
    });

    let queuedMessageId: string | null = null;

    if (input.submit) {
      await notifyFacility(
        input.receivingFacilityId,
        "referral:acknowledge",
        {
          organisationId: created.organisationId,
          kind: "referral_submitted",
          title: `New referral ${created.reference}`,
          body: `${input.priority === "routine" ? "Routine" : "Priority"} referral awaiting acknowledgement.`,
          referralId: created.id,
        },
        { excludeUserId: ctx.userId },
        tx,
      );

      const outcome = await queueMessage(
        {
          organisationId: created.organisationId,
          patientId: patient.id,
          referralId: created.id,
          templateKey: "referral_confirmation",
          variables: { facilityName: receiving.name, reference: created.reference },
          idempotencyKey: `referral_confirmation:${created.id}`,
        },
        tx,
      );
      if (outcome.status === "queued" || outcome.status === "sent") {
        queuedMessageId = outcome.messageId;
      }

      const policy = await resolvePolicy(created.organisationId, created.receivingFacilityId, tx);
      const deadline = acknowledgementDeadline(policy, created.priority, now);
      await createAndAnnounceTask(
        {
          organisationId: created.organisationId,
          patientId: patient.id,
          facilityId: created.receivingFacilityId,
          kind: "acknowledgement_overdue",
          title: `Acknowledge referral ${created.reference}`,
          detail: `Acknowledgement is expected by ${formatDate(deadline)}.`,
          referralId: created.id,
          dueAt: deadline,
          createdByUserId: ctx.userId,
          dedupeKey: `acknowledge:${created.id}`,
        },
        {
          title: `Acknowledge referral ${created.reference}`,
          body: `Expected by ${formatDate(deadline)}.`,
        },
        tx,
      );
    }

    await recordAudit(
      {
        organisationId: created.organisationId,
        actorUserId: ctx.userId,
        action: input.submit ? "referral.submit" : "referral.create",
        resourceType: "referral",
        resourceId: created.id,
        metadata: {
          referralReference: created.reference,
          referringFacilityId,
          receivingFacilityId: input.receivingFacilityId,
          toStatus: status,
        },
      },
      tx,
    );

    return { referral: created, queuedMessageId };
  });

  if (result.queuedMessageId) {
    await deliverMessage(result.queuedMessageId).catch((error) => {
      console.error("[kea] message delivery failed after referral creation", error);
    });
  }

  return {
    id: result.referral.id,
    reference: result.referral.reference,
    status: result.referral.status,
  };
}

export type AppointmentInput = {
  scheduledFor: Date;
  durationMinutes?: number;
  departmentId?: string | null;
  locationNote?: string | null;
};

export type TransitionInput = {
  referralId: string;
  to: ReferralStatus;
  note?: string | null;
  appointment?: AppointmentInput;
  outcomeSummary?: string | null;
  /** Recorded on the referral for rejected and cancelled transitions. */
  reason?: string | null;
};

export type TransitionResult = {
  referral: Referral;
  previousStatus: ReferralStatus;
};

async function loadReferralForUpdate(referralId: string, tx: Executor): Promise<Referral> {
  const rows = await tx
    .select()
    .from(referrals)
    .where(eq(referrals.id, referralId))
    .limit(1)
    .for("update");
  const referral = rows[0];
  if (!referral) throw new NotFoundError("That referral could not be found.");
  return referral;
}

export async function transitionReferral(
  ctx: AuthContext,
  input: TransitionInput,
): Promise<TransitionResult> {
  const outcome = await db.transaction(async (tx) => {
    const referral = await loadReferralForUpdate(input.referralId, tx);

    // Confirms the actor may see this patient at all before anything else.
    await requirePatientAccess(ctx, referral.patientId, tx);

    const definition = assertTransition(
      ctx,
      {
        referringFacilityId: referral.referringFacilityId,
        receivingFacilityId: referral.receivingFacilityId,
      },
      referral.status,
      input.to,
      input.note ?? input.reason ?? null,
    );

    const now = new Date();
    const patch: Partial<typeof referrals.$inferInsert> = {
      status: input.to,
      updatedAt: now,
    };

    const [receivingFacility] = await tx
      .select({ name: facilities.name, phone: facilities.phone })
      .from(facilities)
      .where(eq(facilities.id, referral.receivingFacilityId))
      .limit(1);

    const [referringFacility] = await tx
      .select({ name: facilities.name, phone: facilities.phone })
      .from(facilities)
      .where(eq(facilities.id, referral.referringFacilityId))
      .limit(1);

    const policy = await resolvePolicy(
      referral.organisationId,
      referral.receivingFacilityId,
      tx,
    );

    const queuedMessageIds: string[] = [];
    const noteText = input.note?.trim() || null;

    switch (input.to) {
      case "submitted": {
        patch.submittedAt = now;
        await notifyFacility(
          referral.receivingFacilityId,
          "referral:acknowledge",
          {
            organisationId: referral.organisationId,
            kind: "referral_submitted",
            title: `New referral ${referral.reference}`,
            body: "Awaiting acknowledgement.",
            referralId: referral.id,
          },
          { excludeUserId: ctx.userId },
          tx,
        );
        const queued = await queueMessage(
          {
            organisationId: referral.organisationId,
            patientId: referral.patientId,
            referralId: referral.id,
            templateKey: "referral_confirmation",
            variables: {
              facilityName: receivingFacility?.name ?? "the receiving facility",
              reference: referral.reference,
            },
            idempotencyKey: `referral_confirmation:${referral.id}`,
          },
          tx,
        );
        if ("messageId" in queued) queuedMessageIds.push(queued.messageId);
        break;
      }

      case "acknowledged": {
        patch.acknowledgedAt = now;
        patch.acknowledgedByUserId = ctx.userId;
        await resolveTasksForReferral(
          referral.id,
          ["acknowledgement_overdue"],
          "acknowledged",
          "Referral acknowledged by the receiving facility.",
          ctx.userId,
          tx,
        );
        await notifyUsers(
          [referral.createdByUserId],
          {
            organisationId: referral.organisationId,
            kind: "referral_acknowledged",
            title: `Referral ${referral.reference} acknowledged`,
            body: `${receivingFacility?.name ?? "The receiving facility"} has accepted the referral.`,
            referralId: referral.id,
          },
          tx,
        );
        break;
      }

      case "rejected": {
        patch.rejectionReason = (input.reason ?? noteText ?? "").slice(0, 300);
        await notifyFacility(
          referral.referringFacilityId,
          "referral:read",
          {
            organisationId: referral.organisationId,
            kind: "referral_rejected",
            title: `Referral ${referral.reference} was rejected`,
            body: "Open the referral to read the reason and decide the next step.",
            referralId: referral.id,
          },
          { excludeUserId: ctx.userId },
          tx,
        );
        await createAndAnnounceTask(
          {
            organisationId: referral.organisationId,
            patientId: referral.patientId,
            facilityId: referral.referringFacilityId,
            kind: "manual_review",
            title: `Rejected referral ${referral.reference} needs a decision`,
            detail: patch.rejectionReason,
            referralId: referral.id,
            createdByUserId: ctx.userId,
            dedupeKey: `rejected:${referral.id}`,
          },
          {
            title: `Rejected referral ${referral.reference}`,
            body: "Decide whether to refer elsewhere or close the pathway.",
          },
          tx,
        );
        break;
      }

      case "cancelled": {
        patch.cancellationReason = (input.reason ?? noteText ?? "").slice(0, 300);
        patch.closedAt = now;
        await tx
          .update(appointments)
          .set({ status: "cancelled", updatedAt: now })
          .where(
            and(
              eq(appointments.referralId, referral.id),
              inArray(appointments.status, ["scheduled", "rescheduled"]),
            ),
          );
        await resolveTasksForReferral(
          referral.id,
          ["acknowledgement_overdue", "missed_appointment", "follow_up_due", "manual_review"],
          "referral_cancelled",
          "Referral cancelled.",
          ctx.userId,
          tx,
        );
        break;
      }

      case "appointment_scheduled": {
        if (!input.appointment) {
          throw new ValidationError("An appointment date and time is required.", {
            scheduledFor: ["Choose when the patient should attend."],
          });
        }
        if (input.appointment.scheduledFor.getTime() < now.getTime() - 3_600_000) {
          throw new ValidationError("Choose an appointment time that is not in the past.", {
            scheduledFor: ["The appointment must be in the future."],
          });
        }

        const previous = await tx
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.referralId, referral.id),
              inArray(appointments.status, ["scheduled", "rescheduled"]),
            ),
          );

        const [appointment] = await tx
          .insert(appointments)
          .values({
            referralId: referral.id,
            organisationId: referral.organisationId,
            patientId: referral.patientId,
            facilityId: referral.receivingFacilityId,
            departmentId:
              input.appointment.departmentId ?? referral.receivingDepartmentId ?? null,
            scheduledFor: input.appointment.scheduledFor,
            durationMinutes: input.appointment.durationMinutes ?? 30,
            locationNote: input.appointment.locationNote ?? null,
            status: previous.length > 0 ? "rescheduled" : "scheduled",
            scheduledByUserId: ctx.userId,
          })
          .returning({ id: appointments.id });

        if (previous.length > 0) {
          await tx
            .update(appointments)
            .set({
              status: "cancelled",
              supersededByAppointmentId: appointment.id,
              updatedAt: now,
            })
            .where(
              inArray(
                appointments.id,
                previous.map((row) => row.id),
              ),
            );
        }

        patch.firstAppointmentAt = referral.firstAppointmentAt ?? input.appointment.scheduledFor;

        await resolveTasksForReferral(
          referral.id,
          ["missed_appointment"],
          "rebooked",
          "A new appointment was scheduled.",
          ctx.userId,
          tx,
        );

        await notifyFacility(
          referral.referringFacilityId,
          "referral:read",
          {
            organisationId: referral.organisationId,
            kind: "appointment_scheduled",
            title: `Appointment booked for referral ${referral.reference}`,
            body: `${formatDate(input.appointment.scheduledFor)} at ${formatTime(input.appointment.scheduledFor)}.`,
            referralId: referral.id,
          },
          { excludeUserId: ctx.userId },
          tx,
        );

        const queued = await queueMessage(
          {
            organisationId: referral.organisationId,
            patientId: referral.patientId,
            referralId: referral.id,
            appointmentId: appointment.id,
            templateKey: "appointment_scheduled",
            variables: {
              facilityName: receivingFacility?.name ?? "the hospital",
              date: formatDate(input.appointment.scheduledFor),
              time: formatTime(input.appointment.scheduledFor),
            },
            idempotencyKey: `appointment_scheduled:${appointment.id}`,
          },
          tx,
        );
        if ("messageId" in queued) queuedMessageIds.push(queued.messageId);
        break;
      }

      case "patient_attended": {
        patch.attendedAt = now;
        await tx
          .update(appointments)
          .set({
            status: "attended",
            attendanceRecordedAt: now,
            attendanceRecordedByUserId: ctx.userId,
            updatedAt: now,
          })
          .where(
            and(
              eq(appointments.referralId, referral.id),
              inArray(appointments.status, ["scheduled", "rescheduled", "missed"]),
            ),
          );
        await resolveTasksForReferral(
          referral.id,
          ["missed_appointment"],
          "patient_attended",
          "The patient attended.",
          ctx.userId,
          tx,
        );
        break;
      }

      case "missed_appointment": {
        await tx
          .update(appointments)
          .set({
            status: "missed",
            attendanceRecordedAt: now,
            attendanceRecordedByUserId: ctx.userId,
            updatedAt: now,
          })
          .where(
            and(
              eq(appointments.referralId, referral.id),
              inArray(appointments.status, ["scheduled", "rescheduled"]),
            ),
          );

        await createAndAnnounceTask(
          {
            organisationId: referral.organisationId,
            patientId: referral.patientId,
            facilityId: referral.referringFacilityId,
            kind: "missed_appointment",
            title: `Missed appointment on referral ${referral.reference}`,
            detail:
              noteText ??
              "The patient did not attend the booked appointment. Contact the patient and record the outcome.",
            referralId: referral.id,
            dueAt: new Date(now.getTime() + policy.missedAppointmentGraceHours * 3_600_000),
            createdByUserId: ctx.userId,
            dedupeKey: `missed:${referral.id}:${referral.firstAppointmentAt?.toISOString() ?? now.toISOString()}`,
          },
          {
            title: `Missed appointment on ${referral.reference}`,
            body: "Coordinator follow up is required.",
          },
          tx,
        );

        const queued = await queueMessage(
          {
            organisationId: referral.organisationId,
            patientId: referral.patientId,
            referralId: referral.id,
            templateKey: "appointment_missed",
            variables: { facilityName: referringFacility?.name ?? "your clinic" },
            idempotencyKey: `appointment_missed:${referral.id}:${now.toISOString().slice(0, 10)}`,
          },
          tx,
        );
        if ("messageId" in queued) queuedMessageIds.push(queued.messageId);
        break;
      }

      case "care_completed": {
        patch.careCompletedAt = now;
        patch.outcomeSummary = input.outcomeSummary?.trim() || referral.outcomeSummary;
        if (!patch.outcomeSummary) {
          throw new ValidationError("Record what care was provided.", {
            outcomeSummary: ["A short outcome summary is required."],
          });
        }
        await notifyFacility(
          referral.referringFacilityId,
          "referral:read",
          {
            organisationId: referral.organisationId,
            kind: "care_completed",
            title: `Care outcome recorded for ${referral.reference}`,
            body: "The receiving facility has documented the outcome.",
            referralId: referral.id,
          },
          { excludeUserId: ctx.userId },
          tx,
        );
        break;
      }

      case "follow_up_required": {
        const dueAt = new Date(now.getTime() + policy.followUpDueDays * 86_400_000);
        await createAndAnnounceTask(
          {
            organisationId: referral.organisationId,
            patientId: referral.patientId,
            facilityId: referral.referringFacilityId,
            kind: "follow_up_due",
            title: `Follow up due for referral ${referral.reference}`,
            detail: noteText ?? "The receiving facility has asked for follow up at the clinic.",
            referralId: referral.id,
            dueAt,
            createdByUserId: ctx.userId,
            dedupeKey: `follow_up:${referral.id}`,
          },
          {
            title: `Follow up due for ${referral.reference}`,
            body: `Due by ${formatDate(dueAt)}.`,
          },
          tx,
        );
        const queued = await queueMessage(
          {
            organisationId: referral.organisationId,
            patientId: referral.patientId,
            referralId: referral.id,
            templateKey: "follow_up_reminder",
            variables: { facilityName: referringFacility?.name ?? "your clinic" },
            idempotencyKey: `follow_up_reminder:${referral.id}`,
          },
          tx,
        );
        if ("messageId" in queued) queuedMessageIds.push(queued.messageId);
        break;
      }

      case "follow_up_completed": {
        await resolveTasksForReferral(
          referral.id,
          ["follow_up_due", "clinical_follow_up"],
          "follow_up_completed",
          noteText ?? "Follow up completed.",
          ctx.userId,
          tx,
        );
        break;
      }

      case "unable_to_contact": {
        await createAndAnnounceTask(
          {
            organisationId: referral.organisationId,
            patientId: referral.patientId,
            facilityId: referral.referringFacilityId,
            kind: "manual_review",
            title: `Unable to contact patient on referral ${referral.reference}`,
            detail: noteText,
            referralId: referral.id,
            createdByUserId: ctx.userId,
            dedupeKey: `unreachable:${referral.id}`,
          },
          {
            title: `Unable to contact patient on ${referral.reference}`,
            body: "Decide whether to escalate or close the pathway.",
          },
          tx,
        );
        break;
      }

      case "escalated": {
        const task = await createAndAnnounceTask(
          {
            organisationId: referral.organisationId,
            patientId: referral.patientId,
            facilityId: referral.referringFacilityId,
            kind: "manual_review",
            title: `Escalated referral ${referral.reference}`,
            detail: noteText,
            referralId: referral.id,
            createdByUserId: ctx.userId,
            dedupeKey: `escalation:${referral.id}:${now.toISOString().slice(0, 10)}`,
          },
          {
            title: `Referral ${referral.reference} escalated`,
            body: noteText ?? "Coordinator review required.",
          },
          tx,
        );
        await tx.insert(escalations).values({
          organisationId: referral.organisationId,
          referralId: referral.id,
          taskId: task.id,
          reason: (noteText ?? "Escalated for coordinator review.").slice(0, 200),
          raisedByUserId: ctx.userId,
        });
        break;
      }

      case "closed": {
        patch.closedAt = now;
        await resolveTasksForReferral(
          referral.id,
          [
            "acknowledgement_overdue",
            "missed_appointment",
            "follow_up_due",
            "manual_review",
            "clinical_follow_up",
            "communication_failure",
          ],
          "referral_closed",
          noteText ?? "Referral closed.",
          ctx.userId,
          tx,
        );
        await tx
          .update(escalations)
          .set({ resolvedAt: now, resolvedByUserId: ctx.userId, resolutionNote: noteText })
          .where(and(eq(escalations.referralId, referral.id)));
        break;
      }

      default:
        break;
    }

    const [updated] = await tx
      .update(referrals)
      .set(patch)
      .where(eq(referrals.id, referral.id))
      .returning();

    await tx.insert(referralStatusEvents).values({
      referralId: referral.id,
      organisationId: referral.organisationId,
      fromStatus: referral.status,
      toStatus: input.to,
      actorUserId: ctx.userId,
      facilityId:
        definition.actorSide === "referring"
          ? referral.referringFacilityId
          : referral.receivingFacilityId,
      note: noteText ?? input.reason ?? null,
      metadata: input.appointment
        ? { scheduledFor: input.appointment.scheduledFor.toISOString() }
        : {},
    });

    if (input.to === "submitted" && receivingFacility) {
      const deadline = acknowledgementDeadline(policy, referral.priority, now);
      await createAndAnnounceTask(
        {
          organisationId: referral.organisationId,
          patientId: referral.patientId,
          facilityId: referral.receivingFacilityId,
          kind: "acknowledgement_overdue",
          title: `Acknowledge referral ${referral.reference}`,
          detail: `Acknowledgement is expected by ${formatDate(deadline)}.`,
          referralId: referral.id,
          dueAt: deadline,
          createdByUserId: ctx.userId,
          dedupeKey: `acknowledge:${referral.id}`,
        },
        {
          title: `Acknowledge referral ${referral.reference}`,
          body: `Expected by ${formatDate(deadline)}.`,
        },
        tx,
      );
    }

    await recordAudit(
      {
        organisationId: referral.organisationId,
        actorUserId: ctx.userId,
        action: "referral.transition",
        resourceType: "referral",
        resourceId: referral.id,
        metadata: {
          referralReference: referral.reference,
          fromStatus: referral.status,
          toStatus: input.to,
        },
      },
      tx,
    );

    return { referral: updated, previousStatus: referral.status, queuedMessageIds };
  });

  for (const messageId of outcome.queuedMessageIds) {
    await deliverMessage(messageId).catch((error) => {
      console.error("[kea] message delivery failed after transition", error);
    });
  }

  return { referral: outcome.referral, previousStatus: outcome.previousStatus };
}

/** Assigns or clears the coordinator responsible for a referral. */
export async function assignCoordinator(
  ctx: AuthContext,
  referralId: string,
  coordinatorUserId: string | null,
) {
  const [referral] = await db.select().from(referrals).where(eq(referrals.id, referralId)).limit(1);
  if (!referral) throw new NotFoundError("That referral could not be found.");
  await requirePatientAccess(ctx, referral.patientId);
  assertCan(ctx, "referral:assign_coordinator", { facilityId: referral.referringFacilityId });

  await db
    .update(referrals)
    .set({ assignedCoordinatorId: coordinatorUserId, updatedAt: new Date() })
    .where(eq(referrals.id, referralId));

  if (coordinatorUserId) {
    await notifyUsers([coordinatorUserId], {
      organisationId: referral.organisationId,
      kind: "task_assigned",
      title: `You are now coordinating referral ${referral.reference}`,
      referralId: referral.id,
    });
  }

  await recordAudit({
    organisationId: referral.organisationId,
    actorUserId: ctx.userId,
    action: "referral.assign_coordinator",
    resourceType: "referral",
    resourceId: referral.id,
    metadata: { referralReference: referral.reference, targetUserId: coordinatorUserId },
  });
}

export type AddNoteInput = {
  referralId?: string | null;
  patientId: string;
  body: string;
  visibleToPatient?: boolean;
  aiAssisted?: boolean;
};

export async function addClinicalNote(ctx: AuthContext, input: AddNoteInput) {
  const { patient, viaFacilityId } = await requirePatientAccess(ctx, input.patientId);
  assertCan(ctx, "note:create", { facilityId: viaFacilityId });

  const body = input.body.trim();
  if (body.length < 3) {
    throw new ValidationError("Write a note before saving.", { body: ["The note is too short."] });
  }

  const [note] = await db
    .insert(clinicalNotes)
    .values({
      organisationId: patient.organisationId,
      patientId: patient.id,
      referralId: input.referralId ?? null,
      facilityId: viaFacilityId,
      authorUserId: ctx.userId,
      body,
      aiAssisted: input.aiAssisted ?? false,
      visibleToPatient: input.visibleToPatient ?? false,
    })
    .returning({ id: clinicalNotes.id });

  await recordAudit({
    organisationId: patient.organisationId,
    actorUserId: ctx.userId,
    action: "note.create",
    resourceType: "clinical_note",
    resourceId: note.id,
    metadata: { facilityId: viaFacilityId },
  });

  return note.id;
}

/** Human readable summary used in activity feeds. */
export function describeStatusEvent(event: {
  fromStatus: ReferralStatus | null;
  toStatus: ReferralStatus;
}): string {
  if (!event.fromStatus) return `Referral created as ${STATUS_LABELS[event.toStatus].toLowerCase()}`;
  return `${STATUS_LABELS[event.fromStatus]} to ${STATUS_LABELS[event.toStatus]}`;
}

/** Most recent status events for a referral, newest first. */
export async function referralTimeline(referralId: string, limit = 50) {
  return db
    .select()
    .from(referralStatusEvents)
    .where(eq(referralStatusEvents.referralId, referralId))
    .orderBy(desc(referralStatusEvents.occurredAt))
    .limit(limit);
}

/** Loads the patient row behind a referral, used after an access check. */
export async function referralPatient(referralId: string) {
  const [row] = await db
    .select({ patient: patients })
    .from(referrals)
    .innerJoin(patients, eq(patients.id, referrals.patientId))
    .where(eq(referrals.id, referralId))
    .limit(1);
  return row?.patient ?? null;
}
