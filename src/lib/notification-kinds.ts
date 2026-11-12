import { notificationKindEnum } from "@/db/schema";

export type NotificationKind = (typeof notificationKindEnum.enumValues)[number];

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  referral_submitted: "New referral",
  referral_acknowledged: "Referral acknowledged",
  referral_rejected: "Referral rejected",
  appointment_scheduled: "Appointment scheduled",
  appointment_missed: "Missed appointment",
  care_completed: "Care outcome recorded",
  task_assigned: "Task assigned",
  escalation_raised: "Escalation raised",
};
