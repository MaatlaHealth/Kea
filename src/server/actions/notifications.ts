"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { listNotifications, markNotificationsRead, unreadNotificationCount } from "@/lib/notifications";
import { toActionError, type ActionState } from "../action-result";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  referralId: string | null;
  taskId: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function fetchNotifications(): Promise<{
  items: NotificationItem[];
  unread: number;
}> {
  const ctx = await requireAuth();
  const [rows, unread] = await Promise.all([
    listNotifications(ctx.userId, 20),
    unreadNotificationCount(ctx.userId),
  ]);
  return {
    unread,
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      referralId: row.referralId,
      taskId: row.taskId,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    await markNotificationsRead(ctx.userId);
    revalidatePath("/app");
    return { status: "success", message: "All notifications marked as read." };
  } catch (error) {
    return toActionError(error);
  }
}
