import "server-only";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db, type Executor } from "@/db";
import { facilities, memberships, notifications, users } from "@/db/schema";
import type { NotificationKind } from "./notification-kinds";
import { ROLE_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type { UserRole } from "@/db/schema";

/**
 * In application notifications.
 *
 * Recipients are resolved from role assignments rather than a stored
 * subscription list, so a staff change takes effect immediately. Notification
 * titles and bodies never carry clinical detail or a patient name: they carry
 * the referral reference, which is meaningless without access to the record.
 */

function rolesWith(permission: Permission): UserRole[] {
  return (Object.keys(ROLE_PERMISSIONS) as UserRole[]).filter((role) =>
    ROLE_PERMISSIONS[role].includes(permission),
  );
}

export async function recipientsAtFacility(
  facilityId: string,
  permission: Permission,
  executor: Executor = db,
): Promise<string[]> {
  const [facility] = await executor
    .select({ organisationId: facilities.organisationId })
    .from(facilities)
    .where(eq(facilities.id, facilityId))
    .limit(1);
  if (!facility) return [];

  const roles = rolesWith(permission);
  if (roles.length === 0) return [];

  const rows = await executor
    .selectDistinct({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.isActive, true),
        eq(users.status, "active"),
        eq(memberships.organisationId, facility.organisationId),
        inArray(memberships.role, roles),
        or(eq(memberships.facilityId, facilityId), isNull(memberships.facilityId)),
      ),
    );

  return rows.map((row) => row.userId);
}

export type NotifyInput = {
  organisationId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  referralId?: string | null;
  taskId?: string | null;
};

export async function notifyUsers(
  userIds: string[],
  input: NotifyInput,
  executor: Executor = db,
): Promise<number> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return 0;
  await executor.insert(notifications).values(
    unique.map((userId) => ({
      organisationId: input.organisationId,
      userId,
      kind: input.kind,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 400) ?? null,
      referralId: input.referralId ?? null,
      taskId: input.taskId ?? null,
    })),
  );
  return unique.length;
}

export async function notifyFacility(
  facilityId: string,
  permission: Permission,
  input: NotifyInput,
  options: { excludeUserId?: string | null } = {},
  executor: Executor = db,
): Promise<number> {
  const recipients = (await recipientsAtFacility(facilityId, permission, executor)).filter(
    (id) => id !== options.excludeUserId,
  );
  return notifyUsers(recipients, input, executor);
}

export async function listNotifications(userId: string, limit = 25) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const condition = ids?.length
    ? and(eq(notifications.userId, userId), inArray(notifications.id, ids))
    : and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() }).where(condition);
}
