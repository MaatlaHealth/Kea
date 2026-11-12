import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  CalendarDays,
  FileText,
  MessageSquare,
  Paperclip,
  UserRound,
} from "lucide-react";

import { BackLink, PageHeader } from "@/components/app/app-shell";
import { NoteForm } from "@/components/app/note-form";
import { PathwayProgress } from "@/components/app/pathway-progress";
import { PredictionPanel } from "@/components/app/prediction-panel";
import { ReferralActions } from "@/components/app/referral-actions";
import {
  AppointmentStatusBadge,
  DemoBadge,
  PriorityBadge,
  ReferralStatusBadge,
  TaskStatusBadge,
} from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { isAiEnabled } from "@/lib/ai/gemini";
import { canAnywhere } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { isPredictionEnabled } from "@/lib/prediction/client";
import { getReferralDetail } from "@/lib/referrals/queries";
import { describeStatusEvent } from "@/lib/referrals/service";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatDateTime, formatRelative, humanise, maskPhone } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Referral",
  robots: { index: false, follow: false },
};

export default async function ReferralDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAuth();

  let detail;
  try {
    detail = await getReferralDetail(ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const {
    referral,
    patient,
    referringFacility,
    receivingFacility,
    timeline,
    appointments,
    notes,
    documents,
    tasks,
    messages,
    prediction,
    transitions,
  } = detail;

  const departmentOptions = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.facilityId, referral.receivingFacilityId));

  const activeAppointment = appointments.find(
    (appointment) => appointment.status === "scheduled" || appointment.status === "rescheduled",
  );

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href="/app/referrals">All referrals</BackLink>}
        title={referral.reference}
        description={`${referringFacility.name} to ${receivingFacility.name}`}
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge priority={referral.priority} />
            <ReferralStatusBadge status={referral.status} />
            {referral.isSynthetic ? <DemoBadge /> : null}
          </div>
        }
      />

      <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-subtle">
        <PathwayProgress status={referral.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Actions available to you</CardTitle>
              <CardDescription>
                Only transitions your role allows at your facility are shown. Every change is
                recorded against your name.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReferralActions
                referralId={referral.id}
                transitions={transitions.map((transition) => ({
                  to: transition.to,
                  label: transition.label,
                  description: transition.description,
                  requiresNote: transition.requiresNote,
                }))}
                departments={departmentOptions}
                defaultDepartmentId={referral.receivingDepartmentId}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Referral details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Reason for referral" value={referral.reasonCategory} />
                <Field
                  label="Requested date"
                  value={referral.requestedDate ? formatDate(referral.requestedDate) : "Not set"}
                />
                <Field label="Submitted" value={formatDateTime(referral.submittedAt)} />
                <Field label="Acknowledged" value={formatDateTime(referral.acknowledgedAt)} />
              </dl>

              {referral.reasonDetail ? (
                <LongField label="Further detail" value={referral.reasonDetail} />
              ) : null}
              {referral.clinicalObservations ? (
                <LongField label="Clinical observations" value={referral.clinicalObservations} />
              ) : null}
              {referral.requestedActions ? (
                <LongField label="Requested actions" value={referral.requestedActions} />
              ) : null}
              {referral.outcomeSummary ? (
                <LongField label="Care outcome" value={referral.outcomeSummary} />
              ) : null}
              {referral.rejectionReason ? (
                <Alert variant="destructive" title="Rejected">
                  <p>{referral.rejectionReason}</p>
                </Alert>
              ) : null}
              {referral.cancellationReason ? (
                <Alert variant="warning" title="Cancelled">
                  <p>{referral.cancellationReason}</p>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-4" />
                Appointments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No appointment has been booked yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {appointments.map((appointment) => (
                    <li
                      key={appointment.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {formatDateTime(appointment.scheduledFor)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {appointment.durationMinutes} minutes
                          {appointment.locationNote ? ` · ${appointment.locationNote}` : ""}
                        </p>
                        {appointment.patientConfirmedAt ? (
                          <p className="mt-0.5 text-xs text-teal-700">
                            Patient confirmed {formatRelative(appointment.patientConfirmedAt)}
                          </p>
                        ) : null}
                        {appointment.patientAssistanceRequestedAt ? (
                          <p className="mt-0.5 text-xs text-amber-700">
                            Patient asked for help{" "}
                            {formatRelative(appointment.patientAssistanceRequestedAt)}
                          </p>
                        ) : null}
                      </div>
                      <AppointmentStatusBadge status={appointment.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" />
                Clinical notes
              </CardTitle>
              <CardDescription>
                Notes are permanent and attributed. They are not shown to the patient unless you
                choose to share them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {canAnywhere(ctx, "note:create") ? (
                <NoteForm
                  patientId={patient.id}
                  referralId={referral.id}
                  aiEnabled={isAiEnabled()}
                />
              ) : null}

              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes on this referral yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {notes.map((note) => (
                    <li key={note.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {note.authorName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(note.createdAt)}
                        </span>
                        {note.aiAssisted ? <Badge variant="warning">AI assisted draft</Badge> : null}
                        {note.visibleToPatient ? (
                          <Badge variant="progress">Shared with patient</Badge>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {note.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Referral history</CardTitle>
              <CardDescription>Every status change, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-border pl-5">
                {timeline.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      className="absolute -left-[1.4rem] top-1.5 size-2 rounded-full bg-teal-600 ring-4 ring-card"
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-foreground">
                      {describeStatusEvent(event)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.actorName ?? event.actorSystem ?? "System"} &middot;{" "}
                      {formatDateTime(event.occurredAt)}
                    </p>
                    {event.note ? (
                      <p className="mt-1 whitespace-pre-wrap rounded bg-muted/60 p-2 text-xs leading-relaxed text-muted-foreground">
                        {event.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-4" />
                Patient
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <Link
                  href={`/app/patients/${patient.id}`}
                  className="font-medium text-plum-700 hover:text-plum-900"
                >
                  {patient.firstName} {patient.lastName}
                </Link>
                <p className="text-xs text-muted-foreground">{patient.recordNumber}</p>
              </div>
              <dl className="space-y-2 border-t border-border pt-3 text-xs">
                <Row label="Date of birth" value={formatDate(patient.dateOfBirth)} />
                <Row label="Phone" value={maskPhone(patient.phone)} />
                <Row label="Preferred language" value={patient.preferredLanguage.toUpperCase()} />
                <Row label="Contact method" value={humanise(patient.preferredChannel)} />
                <Row label="Area" value={patient.residentialArea ?? "Not recorded"} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Facilities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Referring</p>
                <p className="font-medium text-foreground">{referringFacility.name}</p>
                <p className="text-xs text-muted-foreground">
                  {humanise(referringFacility.type)}
                  {referringFacility.district ? ` · ${referringFacility.district}` : ""}
                </p>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Receiving</p>
                <p className="font-medium text-foreground">{receivingFacility.name}</p>
                <p className="text-xs text-muted-foreground">
                  {humanise(receivingFacility.type)}
                  {receivingFacility.district ? ` · ${receivingFacility.district}` : ""}
                </p>
                {receivingFacility.phone ? (
                  <p className="mt-1 text-xs text-muted-foreground">{receivingFacility.phone}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Coordination</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No coordination tasks.</p>
              ) : (
                <ul className="space-y-3">
                  {tasks.map((task) => (
                    <li key={task.id} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/app/coordination/${task.id}`}
                          className="font-medium text-foreground hover:text-plum-700"
                        >
                          {task.title}
                        </Link>
                        <TaskStatusBadge status={task.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {task.dueAt ? `Due ${formatDate(task.dueAt)}` : "No due time"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-4" />
                Messages
              </CardTitle>
              <CardDescription>What the patient was sent, and whether it arrived.</CardDescription>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No messages have been created for this referral.
                </p>
              ) : (
                <ul className="space-y-3">
                  {messages.map((message) => (
                    <li key={message.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
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
                        <span className="text-xs text-muted-foreground">
                          {message.channel.toUpperCase()} &middot;{" "}
                          {formatRelative(message.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {message.body}
                      </p>
                      {message.errorDetail ? (
                        <p className="mt-1 text-xs text-destructive">{message.errorDetail}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {documents.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Paperclip className="size-4" />
                  Attachments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {documents.map((document) => (
                    <li key={document.id} className="text-sm">
                      <a
                        href={`/api/documents/${document.id}`}
                        className="font-medium text-plum-700 hover:text-plum-900"
                      >
                        {document.fileName}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {(document.byteSize / 1024).toFixed(0)} KB &middot;{" "}
                        {formatDate(document.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <PredictionPanel
            referralId={referral.id}
            enabled={isPredictionEnabled()}
            prediction={
              prediction
                ? {
                    score: prediction.score,
                    band: prediction.band,
                    modelName: prediction.modelName,
                    modelVersion: prediction.modelVersion,
                    clinicallyValidated: prediction.clinicallyValidated,
                    trainedOnRealData: prediction.trainedOnRealData,
                    contributingFactors: prediction.contributingFactors,
                    missingFeatures: prediction.missingFeatures,
                    calculatedAt: prediction.calculatedAt.toISOString(),
                  }
                : null
            }
          />

          {activeAppointment ? null : (
            <p className="text-xs text-muted-foreground">
              Booking an appointment sends the patient a message if their consent and contact
              channel allow it.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function LongField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
        {value}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
