import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink, PageHeader } from "@/components/app/app-shell";
import {
  ClaimTaskButton,
  ContactAttemptForm,
  ResolveTaskForm,
} from "@/components/app/task-controls";
import {
  AppointmentStatusBadge,
  ReferralStatusBadge,
  TaskStatusBadge,
} from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { can } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { getTaskDetail } from "@/lib/coordination/queries";
import { resolvePolicy } from "@/lib/coordination/policies";
import { TASK_KIND_LABELS } from "@/lib/coordination/tasks";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatDateTime, formatRelative, humanise, maskPhone } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Coordination task",
  robots: { index: false, follow: false },
};

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAuth();

  let detail;
  try {
    detail = await getTaskDetail(ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { task, patient } = detail;
  const canManage = can(ctx, "task:manage", { facilityId: task.facilityId });
  const policy = await resolvePolicy(task.organisationId, task.facilityId);
  const unsuccessful = detail.contactAttempts.filter(
    (attempt) => attempt.outcome !== "reached" && attempt.outcome !== "message_sent",
  ).length;
  const isClosed = task.status === "resolved" || task.status === "cancelled";

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href="/app/coordination">Coordination workspace</BackLink>}
        title={task.title}
        description={`${TASK_KIND_LABELS[task.kind]} at ${detail.facilityName}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            {canManage && !isClosed ? (
              <ClaimTaskButton
                taskId={task.id}
                currentUserId={ctx.userId}
                assignedToUserId={task.assignedToUserId}
              />
            ) : null}
          </div>
        }
      />

      {unsuccessful >= policy.contactAttemptsBeforeEscalation && !isClosed ? (
        <Alert variant="warning" title="Escalation threshold reached" className="mb-6">
          <p>
            There have been {unsuccessful} unsuccessful contact attempts. This facility&rsquo;s
            policy allows {policy.contactAttemptsBeforeEscalation} before escalation. Consider
            escalating the referral or recording that the patient could not be reached.
          </p>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {task.detail ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Why this task exists</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {task.detail}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {isClosed ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Resolution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium text-foreground">
                  {task.resolutionOutcome ? humanise(task.resolutionOutcome) : "Closed"}
                </p>
                {task.resolutionNote ? (
                  <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                    {task.resolutionNote}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Closed {formatDateTime(task.resolvedAt)}
                </p>
              </CardContent>
            </Card>
          ) : canManage ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Record a contact attempt</CardTitle>
                  <CardDescription>
                    Every attempt is kept, successful or not. This is the record of what was tried.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ContactAttemptForm taskId={task.id} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Resolve this task</CardTitle>
                  <CardDescription>
                    Close the task once the outcome is known. The note stays on the record.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResolveTaskForm taskId={task.id} />
                </CardContent>
              </Card>
            </>
          ) : (
            <Alert variant="info" title="Read only">
              <p>Your role allows you to see this task but not to work it.</p>
            </Alert>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Contact attempts</CardTitle>
              <CardDescription>
                {detail.contactAttempts.length === 0
                  ? "Nothing recorded yet."
                  : `${detail.contactAttempts.length} recorded, ${unsuccessful} unsuccessful.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detail.contactAttempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No contact attempts have been recorded for this task.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {detail.contactAttempts.map((attempt) => (
                    <li key={attempt.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            attempt.outcome === "reached"
                              ? "positive"
                              : attempt.outcome === "wrong_number"
                                ? "critical"
                                : "warning"
                          }
                        >
                          {humanise(attempt.outcome)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {humanise(attempt.channel)} &middot;{" "}
                          {attempt.attemptedByName ?? "Unknown"} &middot;{" "}
                          {formatRelative(attempt.attemptedAt)}
                        </span>
                      </div>
                      {attempt.note ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {attempt.note}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Patient</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Link
                href={`/app/patients/${patient.id}`}
                className="font-medium text-plum-700 hover:text-plum-900"
              >
                {patient.firstName} {patient.lastName}
              </Link>
              <p className="text-xs text-muted-foreground">{patient.recordNumber}</p>
              <dl className="space-y-2 border-t border-border pt-3 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Mobile</dt>
                  <dd className="font-medium text-foreground">{maskPhone(patient.phone)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Alternative</dt>
                  <dd className="font-medium text-foreground">
                    {maskPhone(patient.alternatePhone)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Language</dt>
                  <dd className="font-medium text-foreground">
                    {patient.preferredLanguage.toUpperCase()}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Area</dt>
                  <dd className="font-medium text-foreground">
                    {patient.residentialArea ?? "Not recorded"}
                  </dd>
                </div>
              </dl>
              <p className="pt-2 text-xs text-muted-foreground">
                Full numbers are shown on the patient record, which records every view.
              </p>
            </CardContent>
          </Card>

          {task.referralId ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Referral</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Link
                  href={`/app/referrals/${task.referralId}`}
                  className="font-mono text-xs font-medium text-plum-700 hover:text-plum-900"
                >
                  {detail.referralReference}
                </Link>
                {detail.referralStatus ? (
                  <div>
                    <ReferralStatusBadge status={detail.referralStatus} />
                  </div>
                ) : null}
                {detail.appointments.length > 0 ? (
                  <ul className="space-y-2 border-t border-border pt-3">
                    {detail.appointments.slice(0, 4).map((appointment) => (
                      <li key={appointment.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(appointment.scheduledFor)}
                        </span>
                        <AppointmentStatusBadge status={appointment.status} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Task detail</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium text-foreground">{formatDate(task.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Due</dt>
                  <dd className="font-medium text-foreground">
                    {task.dueAt ? formatDateTime(task.dueAt) : "No due time"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Raised by</dt>
                  <dd className="font-medium text-foreground">
                    {task.createdBySystem ? "Automatic rule" : "A member of staff"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Attempts before escalation</dt>
                  <dd className="font-medium text-foreground">
                    {policy.contactAttemptsBeforeEscalation}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {detail.messages.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Recent messages</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-xs">
                  {detail.messages.map((message) => (
                    <li key={message.id} className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground">
                        {message.templateKey ? humanise(message.templateKey) : "Message"}
                      </span>
                      <Badge
                        variant={
                          message.status === "delivered" || message.status === "read"
                            ? "positive"
                            : message.status === "failed" || message.status === "undeliverable"
                              ? "critical"
                              : "neutral"
                        }
                      >
                        {humanise(message.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
