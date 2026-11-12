import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Inbox,
  LifeBuoy,
  Plus,
  Timer,
} from "lucide-react";

import { PageHeader } from "@/components/app/app-shell";
import { MetricCard } from "@/components/app/metric-card";
import { ReferralStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { canAnywhere } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { openTasksForUser } from "@/lib/coordination/queries";
import { dashboardMetrics, recentActivity, upcomingAppointments } from "@/lib/referrals/queries";
import { describeStatusEvent } from "@/lib/referrals/service";
import { formatDateTime, formatRelative } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const ctx = await requireAuth();

  // A programme analyst holds no clinical permissions and belongs on the
  // analytics screen instead of an operational dashboard.
  if (!canAnywhere(ctx, "referral:read")) {
    if (canAnywhere(ctx, "analytics:read")) redirect("/app/analytics");
    redirect("/app/settings");
  }

  const [metrics, activity, appointments, tasks] = await Promise.all([
    dashboardMetrics(ctx),
    recentActivity(ctx, 10),
    upcomingAppointments(ctx, 7, 6),
    openTasksForUser(ctx, 6),
  ]);

  const canCreate = canAnywhere(ctx, "referral:create");

  return (
    <>
      <PageHeader
        title={`Good day, ${ctx.fullName.split(" ")[0]}`}
        description="Your referral activity across the facilities you work in."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/app/referrals/new">
                <Plus />
                New referral
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Active referrals"
          value={metrics.activeReferrals}
          icon={Activity}
          href="/app/referrals"
          hint="Open pathways across your facilities"
        />
        <MetricCard
          label="Awaiting acknowledgement"
          value={metrics.awaitingAcknowledgement}
          icon={Inbox}
          href="/app/inbox"
          tone={metrics.awaitingAcknowledgement > 0 ? "attention" : "neutral"}
          hint="Submitted but not yet accepted"
        />
        <MetricCard
          label="Upcoming appointments"
          value={metrics.upcomingAppointments}
          icon={CalendarClock}
          href="/app/appointments"
          hint="Booked in the next seven days"
        />
        <MetricCard
          label="Overdue follow-ups"
          value={metrics.overdueFollowUps}
          icon={Timer}
          href="/app/coordination"
          tone={metrics.overdueFollowUps > 0 ? "attention" : "neutral"}
          hint="Tasks past their due time"
        />
        <MetricCard
          label="Coordinator review"
          value={metrics.awaitingCoordinatorReview}
          icon={LifeBuoy}
          href="/app/coordination"
          tone={metrics.awaitingCoordinatorReview > 0 ? "attention" : "neutral"}
          hint="Missed visits and manual review"
        />
        <MetricCard
          label="Completed pathways"
          value={metrics.completedPathways}
          icon={CheckCircle2}
          tone="positive"
          hint="Reached an outcome in the last 30 days"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Referral status changes across the facilities you work in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Referral changes will appear here as your team works."
              />
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((event) => (
                  <li key={event.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        <Link
                          href={`/app/referrals/${event.referralId}`}
                          className="font-medium text-foreground hover:text-plum-700"
                        >
                          {event.reference}
                        </Link>
                        <span className="text-muted-foreground">
                          {" "}
                          {describeStatusEvent(event).toLowerCase()}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {event.actorName ?? event.actorSystem ?? "System"} &middot;{" "}
                        {formatRelative(event.occurredAt)}
                      </p>
                    </div>
                    <ReferralStatusBadge status={event.toStatus} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Next appointments</CardTitle>
              <CardDescription>At the facilities you work in.</CardDescription>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No appointments booked in the next seven days.
                </p>
              ) : (
                <ul className="space-y-3">
                  {appointments.map((appointment) => (
                    <li key={appointment.id} className="text-sm">
                      <Link
                        href={`/app/referrals/${appointment.referralId}`}
                        className="font-medium text-foreground hover:text-plum-700"
                      >
                        {appointment.patientName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(appointment.scheduledFor)} &middot;{" "}
                        {appointment.facilityName}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Your open tasks</CardTitle>
              <CardDescription>Assigned to you or unassigned at your facility.</CardDescription>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">Nothing is waiting on you.</p>
              ) : (
                <ul className="space-y-3">
                  {tasks.map((task) => (
                    <li key={task.id} className="text-sm">
                      <Link
                        href={`/app/coordination/${task.id}`}
                        className="font-medium text-foreground hover:text-plum-700"
                      >
                        {task.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {task.dueAt ? `Due ${formatRelative(task.dueAt)}` : "No due time"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
                <Link href="/app/coordination">
                  <ClipboardList />
                  Open coordination workspace
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
