import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db, type Executor } from "@/db";
import { followUpTasks, type TaskKind } from "@/db/schema";
import { notifyFacility } from "@/lib/notifications";

/**
 * Coordination tasks.
 *
 * Automatic tasks carry a dedupe key derived from the triggering record so a
 * job that runs twice, or a status that is corrected and re-applied, never
 * produces a duplicate entry in a coordinator's queue.
 */

export type CreateTaskInput = {
  organisationId: string;
  patientId: string;
  facilityId: string;
  kind: TaskKind;
  title: string;
  detail?: string | null;
  referralId?: string | null;
  dueAt?: Date | null;
  assignedToUserId?: string | null;
  createdByUserId?: string | null;
  createdBySystem?: string | null;
  dedupeKey?: string | null;
};

export async function createTask(
  input: CreateTaskInput,
  executor: Executor = db,
): Promise<{ id: string; created: boolean }> {
  const inserted = await executor
    .insert(followUpTasks)
    .values({
      organisationId: input.organisationId,
      patientId: input.patientId,
      facilityId: input.facilityId,
      kind: input.kind,
      title: input.title.slice(0, 200),
      detail: input.detail ?? null,
      referralId: input.referralId ?? null,
      dueAt: input.dueAt ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      createdBySystem: input.createdBySystem ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })
    // The unique index on dedupe_key is partial, so the predicate has to be
    // repeated here for PostgreSQL to accept it as the conflict arbiter.
    .onConflictDoNothing({
      target: followUpTasks.dedupeKey,
      where: sql`dedupe_key is not null`,
    })
    .returning({ id: followUpTasks.id });

  if (inserted.length > 0) {
    return { id: inserted[0].id, created: true };
  }

  if (input.dedupeKey) {
    const [existing] = await executor
      .select({ id: followUpTasks.id })
      .from(followUpTasks)
      .where(eq(followUpTasks.dedupeKey, input.dedupeKey))
      .limit(1);
    if (existing) return { id: existing.id, created: false };
  }
  throw new Error("Task could not be created.");
}

/** Creates a task and notifies staff who can work it at that facility. */
export async function createAndAnnounceTask(
  input: CreateTaskInput,
  notification: { title: string; body?: string | null },
  executor: Executor = db,
) {
  const result = await createTask(input, executor);
  if (result.created) {
    await notifyFacility(
      input.facilityId,
      "task:manage",
      {
        organisationId: input.organisationId,
        kind: "task_assigned",
        title: notification.title,
        body: notification.body ?? null,
        referralId: input.referralId ?? null,
        taskId: result.id,
      },
      { excludeUserId: input.createdByUserId ?? null },
      executor,
    );
  }
  return result;
}

/** Resolves the open tasks of the given kinds for a referral. */
export async function resolveTasksForReferral(
  referralId: string,
  kinds: TaskKind[],
  outcome: string,
  note: string,
  resolvedByUserId: string | null,
  executor: Executor = db,
) {
  const now = new Date();
  await executor
    .update(followUpTasks)
    .set({
      status: "resolved",
      resolutionOutcome: outcome.slice(0, 80),
      resolutionNote: note,
      resolvedAt: now,
      resolvedByUserId,
      updatedAt: now,
    })
    .where(
      and(
        eq(followUpTasks.referralId, referralId),
        inArray(followUpTasks.kind, kinds),
        inArray(followUpTasks.status, ["open", "in_progress"]),
      ),
    );
}

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  acknowledgement_overdue: "Acknowledgement overdue",
  missed_appointment: "Missed appointment",
  follow_up_due: "Follow up due",
  communication_failure: "Message could not be delivered",
  manual_review: "Manual review",
  clinical_follow_up: "Clinical follow up",
};
