import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, Inbox, MessageSquareWarning, Timer, UserRoundSearch } from "lucide-react";

import { PageHeader } from "@/components/app/app-shell";
import { NoAccess } from "@/components/app/no-access";
import { MetricCard } from "@/components/app/metric-card";
import { PriorityBadge, ReferralStatusBadge, TaskStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canAnywhere } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import {
  coordinationCounts,
  failedCommunications,
  listTasks,
  unacknowledgedReferrals,
} from "@/lib/coordination/queries";
import { TASK_KIND_LABELS } from "@/lib/coordination/tasks";
import { formatDate, formatRelative, humanise } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Coordination",
  robots: { index: false, follow: false },
};

export default async function CoordinationPage() {
  const ctx = await requireAuth();
  if (!canAnywhere(ctx, "task:read")) {
    return (
      <NoAccess description="The coordination workspace is available to clinical and coordination roles. Your role does not include it." />
    );
  }

  const [counts, missed, overdue, manual, mine, unacknowledged, failures] = await Promise.all([
    coordinationCounts(ctx),
    listTasks(ctx, { kinds: ["missed_appointment"], pageSize: 50 }),
    listTasks(ctx, { kinds: ["follow_up_due", "clinical_follow_up"], pageSize: 50 }),
    listTasks(ctx, { kinds: ["manual_review", "communication_failure"], pageSize: 50 }),
    listTasks(ctx, { assignment: "mine", pageSize: 50 }),
    unacknowledgedReferrals(ctx, 50),
    failedCommunications(ctx, 50),
  ]);

  return (
    <>
      <PageHeader
        title="Coordination workspace"
        description="The cases that need a person. Each one stays here until someone records what happened."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Unacknowledged"
          value={counts.unacknowledged}
          icon={Inbox}
          tone={counts.unacknowledged > 0 ? "attention" : "neutral"}
        />
        <MetricCard
          label="Missed appointments"
          value={counts.missedAppointments}
          icon={UserRoundSearch}
          tone={counts.missedAppointments > 0 ? "attention" : "neutral"}
        />
        <MetricCard
          label="Overdue follow-ups"
          value={counts.overdueFollowUps}
          icon={Timer}
          tone={counts.overdueFollowUps > 0 ? "attention" : "neutral"}
        />
        <MetricCard
          label="Failed messages"
          value={counts.communicationFailures}
          icon={MessageSquareWarning}
        />
        <MetricCard label="Manual review" value={counts.manualReview} icon={ClipboardCheck} />
        <MetricCard label="Assigned to me" value={counts.assignedToMe} icon={ClipboardCheck} />
      </div>

      <div className="mt-6">
        <Tabs defaultValue="unacknowledged">
          <TabsList>
            <TabsTrigger value="unacknowledged">Unacknowledged</TabsTrigger>
            <TabsTrigger value="missed">Missed appointments</TabsTrigger>
            <TabsTrigger value="followup">Follow-up</TabsTrigger>
            <TabsTrigger value="messages">Message failures</TabsTrigger>
            <TabsTrigger value="review">Manual review</TabsTrigger>
            <TabsTrigger value="mine">Assigned to me</TabsTrigger>
          </TabsList>

          <TabsContent value="unacknowledged">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Referrals waiting for acknowledgement</CardTitle>
                <CardDescription>
                  Sent to a facility you work at and not yet accepted. Oldest first.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {unacknowledged.length === 0 ? (
                  <EmptyState
                    icon={Inbox}
                    title="Nothing waiting"
                    description="Every referral sent to your facility has been acknowledged."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Facility</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Waiting</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unacknowledged.map((referral) => (
                        <TableRow key={referral.id}>
                          <TableCell>
                            <Link
                              href={`/app/referrals/${referral.id}`}
                              className="font-mono text-xs font-medium text-plum-700 hover:text-plum-900"
                            >
                              {referral.reference}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <span className="block text-sm">{referral.patientName}</span>
                            <span className="block text-xs text-muted-foreground">
                              {referral.patientRecordNumber}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {referral.receivingFacilityName}
                          </TableCell>
                          <TableCell>
                            <PriorityBadge priority={referral.priority} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatRelative(referral.submittedAt ?? referral.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="missed">
            <TaskTable rows={missed.rows} emptyTitle="No missed appointments to work" />
          </TabsContent>
          <TabsContent value="followup">
            <TaskTable rows={overdue.rows} emptyTitle="No follow-up tasks open" />
          </TabsContent>

          <TabsContent value="messages">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Messages that did not reach the patient</CardTitle>
                <CardDescription>
                  On referrals that are still open. Contact the patient another way.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {failures.length === 0 ? (
                  <EmptyState
                    icon={MessageSquareWarning}
                    title="No delivery failures"
                    description="Every message on an open referral was accepted by the provider."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Problem</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failures.map((failure) => (
                        <TableRow key={failure.id}>
                          <TableCell>
                            <Link
                              href={`/app/referrals/${failure.referralId}`}
                              className="font-mono text-xs font-medium text-plum-700 hover:text-plum-900"
                            >
                              {failure.reference}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">{failure.patientName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {failure.templateKey ? humanise(failure.templateKey) : "Message"} by{" "}
                            {failure.channel.toUpperCase()}
                          </TableCell>
                          <TableCell className="text-xs text-destructive">
                            {failure.errorDetail ?? humanise(failure.status)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatRelative(failure.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="review">
            <TaskTable rows={manual.rows} emptyTitle="Nothing is waiting for manual review" />
          </TabsContent>
          <TabsContent value="mine">
            <TaskTable rows={mine.rows} emptyTitle="No tasks are assigned to you" />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

type TaskRow = Awaited<ReturnType<typeof listTasks>>["rows"][number];

function TaskTable({ rows, emptyTitle }: { rows: TaskRow[]; emptyTitle: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={emptyTitle} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Referral</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <Link
                      href={`/app/coordination/${task.id}`}
                      className="text-sm font-medium text-foreground hover:text-plum-700"
                    >
                      {task.title}
                    </Link>
                    <span className="mt-0.5 block">
                      <Badge variant="neutral">{TASK_KIND_LABELS[task.kind]}</Badge>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/app/patients/${task.patientId}`}
                      className="text-sm text-foreground hover:text-plum-700"
                    >
                      {task.patientName}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {task.patientRecordNumber}
                    </span>
                  </TableCell>
                  <TableCell>
                    {task.referralId ? (
                      <>
                        <Link
                          href={`/app/referrals/${task.referralId}`}
                          className="font-mono text-xs text-plum-700 hover:text-plum-900"
                        >
                          {task.referralReference}
                        </Link>
                        {task.referralStatus ? (
                          <span className="mt-0.5 block">
                            <ReferralStatusBadge status={task.referralStatus} />
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not linked</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {task.dueAt ? (
                      <>
                        <span className="block">{formatDate(task.dueAt)}</span>
                        <span
                          className={
                            new Date(task.dueAt) < new Date() ? "block text-amber-700" : "block"
                          }
                        >
                          {formatRelative(task.dueAt)}
                        </span>
                      </>
                    ) : (
                      "No due time"
                    )}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {task.contactAttemptCount}
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={task.status} />
                    {task.assigneeName ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {task.assigneeName}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
