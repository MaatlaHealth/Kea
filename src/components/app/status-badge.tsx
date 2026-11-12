import type { AppointmentStatus, ReferralPriority, ReferralStatus, TaskStatus } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/referrals/state-machine";
import { cn, humanise } from "@/lib/utils";

export function ReferralStatusBadge({
  status,
  className,
}: {
  status: ReferralStatus;
  className?: string;
}) {
  return (
    <Badge variant={STATUS_TONES[status]} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const PRIORITY_VARIANT: Record<ReferralPriority, "neutral" | "warning" | "critical"> = {
  routine: "neutral",
  urgent: "warning",
  emergency: "critical",
};

export function PriorityBadge({ priority }: { priority: ReferralPriority }) {
  return (
    <Badge variant={PRIORITY_VARIANT[priority]}>
      {priority === "routine" ? "Routine" : priority === "urgent" ? "Urgent" : "Emergency"}
    </Badge>
  );
}

const APPOINTMENT_VARIANT: Record<
  AppointmentStatus,
  "neutral" | "progress" | "positive" | "warning"
> = {
  scheduled: "progress",
  rescheduled: "progress",
  attended: "positive",
  missed: "warning",
  cancelled: "neutral",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge variant={APPOINTMENT_VARIANT[status]}>{humanise(status)}</Badge>;
}

const TASK_VARIANT: Record<TaskStatus, "warning" | "progress" | "positive" | "neutral"> = {
  open: "warning",
  in_progress: "progress",
  resolved: "positive",
  cancelled: "neutral",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={TASK_VARIANT[status]}>{humanise(status)}</Badge>;
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
      Fictional record
    </span>
  );
}
