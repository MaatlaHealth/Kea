"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { contactAttempts, contactOutcomeEnum, followUpTasks } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { assertCan, type AuthContext } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { resolvePolicy } from "@/lib/coordination/policies";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { notifyFacility } from "@/lib/notifications";
import { errorState, parseForm, successState, toActionError, type ActionState } from "../action-result";

async function loadTask(ctx: AuthContext, taskId: string) {
  const [task] = await db.select().from(followUpTasks).where(eq(followUpTasks.id, taskId)).limit(1);
  if (!task) throw new NotFoundError("That task could not be found.");
  assertCan(ctx, "task:manage", { facilityId: task.facilityId });
  return task;
}

const assignSchema = z.object({
  taskId: z.string().uuid(),
  /** Empty string clears the assignment. */
  assigneeUserId: z.string().uuid().optional().or(z.literal("")),
});

export async function assignTaskAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(assignSchema, formData);
    const task = await loadTask(ctx, input.taskId);

    await db
      .update(followUpTasks)
      .set({
        assignedToUserId: input.assigneeUserId || null,
        status: input.assigneeUserId ? "in_progress" : task.status,
        updatedAt: new Date(),
      })
      .where(eq(followUpTasks.id, task.id));

    await recordAudit({
      organisationId: task.organisationId,
      actorUserId: ctx.userId,
      action: "task.assign",
      resourceType: "follow_up_task",
      resourceId: task.id,
      metadata: { targetUserId: input.assigneeUserId || undefined, taskKind: task.kind },
    });

    revalidatePath("/app/coordination");
    revalidatePath(`/app/coordination/${task.id}`);
    return successState(input.assigneeUserId ? "Task assigned." : "Assignment cleared.");
  } catch (error) {
    return toActionError(error);
  }
}

export async function claimTaskAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuth();
  const data = new FormData();
  data.set("taskId", String(formData.get("taskId") ?? ""));
  data.set("assigneeUserId", ctx.userId);
  return assignTaskAction(_previous, data);
}

const attemptSchema = z.object({
  taskId: z.string().uuid(),
  channel: z.enum(["phone_call", "sms", "whatsapp", "home_visit", "community_worker", "other"]),
  outcome: z.enum(contactOutcomeEnum.enumValues),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function recordContactAttemptAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(attemptSchema, formData);
    const task = await loadTask(ctx, input.taskId);

    const policy = await resolvePolicy(task.organisationId, task.facilityId);

    const result = await db.transaction(async (tx) => {
      await tx.insert(contactAttempts).values({
        organisationId: task.organisationId,
        taskId: task.id,
        referralId: task.referralId,
        patientId: task.patientId,
        channel: input.channel,
        outcome: input.outcome,
        note: input.note || null,
        attemptedByUserId: ctx.userId,
      });

      if (task.status === "open") {
        await tx
          .update(followUpTasks)
          .set({ status: "in_progress", updatedAt: new Date() })
          .where(eq(followUpTasks.id, task.id));
      }

      const attempts = await tx
        .select({ outcome: contactAttempts.outcome })
        .from(contactAttempts)
        .where(eq(contactAttempts.taskId, task.id));

      const unsuccessful = attempts.filter(
        (attempt) => attempt.outcome !== "reached" && attempt.outcome !== "message_sent",
      ).length;

      return { unsuccessful, threshold: policy.contactAttemptsBeforeEscalation };
    });

    await recordAudit({
      organisationId: task.organisationId,
      actorUserId: ctx.userId,
      action: "task.contact_attempt",
      resourceType: "follow_up_task",
      resourceId: task.id,
      metadata: { channel: input.channel, result: input.outcome },
    });

    revalidatePath(`/app/coordination/${task.id}`);

    if (result.unsuccessful >= result.threshold) {
      await notifyFacility(
        task.facilityId,
        "task:manage",
        {
          organisationId: task.organisationId,
          kind: "escalation_raised",
          title: `Contact threshold reached on ${task.title}`,
          body: `${result.unsuccessful} unsuccessful attempts. The escalation policy allows ${result.threshold}.`,
          referralId: task.referralId,
          taskId: task.id,
        },
        { excludeUserId: ctx.userId },
      );
      return successState(
        `Attempt recorded. This case has reached the escalation threshold of ${result.threshold} unsuccessful attempts.`,
      );
    }

    return successState("Contact attempt recorded.");
  } catch (error) {
    return toActionError(error);
  }
}

const resolveSchema = z.object({
  taskId: z.string().uuid(),
  outcome: z.enum([
    "contacted_and_rebooked",
    "contacted_no_action_needed",
    "patient_declined",
    "unable_to_contact",
    "referred_elsewhere",
    "duplicate_task",
    "other",
  ]),
  note: z.string().trim().min(3, "Record what happened.").max(2000),
});

export async function resolveTaskAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(resolveSchema, formData);
    const task = await loadTask(ctx, input.taskId);

    if (task.status === "resolved" || task.status === "cancelled") {
      return errorState("That task has already been closed.");
    }

    await db
      .update(followUpTasks)
      .set({
        status: "resolved",
        resolutionOutcome: input.outcome,
        resolutionNote: input.note,
        resolvedAt: new Date(),
        resolvedByUserId: ctx.userId,
        updatedAt: new Date(),
      })
      .where(eq(followUpTasks.id, task.id));

    await recordAudit({
      organisationId: task.organisationId,
      actorUserId: ctx.userId,
      action: "task.resolve",
      resourceType: "follow_up_task",
      resourceId: task.id,
      metadata: { result: input.outcome, taskKind: task.kind },
    });

    revalidatePath("/app/coordination");
    revalidatePath(`/app/coordination/${task.id}`);
    return successState("Task resolved.");
  } catch (error) {
    return toActionError(error);
  }
}

const createTaskSchema = z.object({
  patientId: z.string().uuid(),
  facilityId: z.string().uuid(),
  referralId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(3, "Give the task a short title.").max(200),
  detail: z.string().trim().max(2000).optional().or(z.literal("")),
  dueAt: z.string().optional().or(z.literal("")),
});

export async function createManualTaskAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(createTaskSchema, formData);
    assertCan(ctx, "task:manage", { facilityId: input.facilityId });

    const { requirePatientAccess } = await import("@/lib/access");
    const { patient } = await requirePatientAccess(ctx, input.patientId);

    let dueAt: Date | null = null;
    if (input.dueAt) {
      dueAt = new Date(input.dueAt);
      if (Number.isNaN(dueAt.getTime())) {
        throw new ValidationError("That due date could not be read.", {
          dueAt: ["Use the date and time picker."],
        });
      }
    }

    const [task] = await db
      .insert(followUpTasks)
      .values({
        organisationId: patient.organisationId,
        patientId: patient.id,
        facilityId: input.facilityId,
        referralId: input.referralId || null,
        kind: "manual_review",
        title: input.title,
        detail: input.detail || null,
        dueAt,
        createdByUserId: ctx.userId,
      })
      .returning({ id: followUpTasks.id });

    await recordAudit({
      organisationId: patient.organisationId,
      actorUserId: ctx.userId,
      action: "task.create",
      resourceType: "follow_up_task",
      resourceId: task.id,
      metadata: { facilityId: input.facilityId, taskKind: "manual_review" },
    });

    revalidatePath("/app/coordination");
    return successState("Task created.");
  } catch (error) {
    return toActionError(error);
  }
}

/** Cancels tasks that are no longer relevant, for example a duplicate entry. */
export async function cancelTasksAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const ids = formData.getAll("taskId").map(String).filter(Boolean);
    if (ids.length === 0) return errorState("Choose at least one task.");

    const tasks = await db.select().from(followUpTasks).where(inArray(followUpTasks.id, ids));
    for (const task of tasks) {
      assertCan(ctx, "task:manage", { facilityId: task.facilityId });
    }

    await db
      .update(followUpTasks)
      .set({
        status: "cancelled",
        resolutionOutcome: "cancelled",
        resolvedAt: new Date(),
        resolvedByUserId: ctx.userId,
        updatedAt: new Date(),
      })
      .where(
        and(inArray(followUpTasks.id, ids), inArray(followUpTasks.status, ["open", "in_progress"])),
      );

    revalidatePath("/app/coordination");
    return successState(ids.length === 1 ? "Task cancelled." : `${ids.length} tasks cancelled.`);
  } catch (error) {
    return toActionError(error);
  }
}
