import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";

import { BackLink, PageHeader } from "@/components/app/app-shell";
import { NoteForm } from "@/components/app/note-form";
import {
  ConsentControls,
  PatientEditDialog,
} from "@/components/app/patient-detail-controls";
import {
  AppointmentStatusBadge,
  DemoBadge,
  ReferralStatusBadge,
  TaskStatusBadge,
} from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isAiEnabled } from "@/lib/ai/gemini";
import { can } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { getPatientProfile } from "@/lib/patients/queries";
import { formatDate, formatDateTime, formatRelative, humanise, maskPhone } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Patient record",
  robots: { index: false, follow: false },
};

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAuth();

  let profile;
  try {
    profile = await getPatientProfile(ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { patient, viaFacilityId, isHomeFacility, homeFacility } = profile;
  const canUpdate = can(ctx, "patient:update", { facilityId: viaFacilityId });
  const canRefer = can(ctx, "referral:create", { facilityId: patient.homeFacilityId });
  const activeEpisode = profile.pregnancyEpisodes.find((episode) => episode.isActive);

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href="/app/patients">All patients</BackLink>}
        title={`${patient.firstName} ${patient.lastName}`}
        description={`${patient.recordNumber} · ${homeFacility?.name ?? "Unknown facility"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {patient.isSynthetic ? <DemoBadge /> : null}
            {canUpdate ? (
              <PatientEditDialog
                patient={{
                  id: patient.id,
                  firstName: patient.firstName,
                  lastName: patient.lastName,
                  dateOfBirth: patient.dateOfBirth,
                  phone: patient.phone,
                  alternatePhone: patient.alternatePhone,
                  preferredLanguage: patient.preferredLanguage,
                  preferredChannel: patient.preferredChannel,
                  residentialArea: patient.residentialArea,
                  emergencyContactName: patient.emergencyContactName,
                  emergencyContactPhone: patient.emergencyContactPhone,
                  notes: patient.notes,
                }}
              />
            ) : null}
            {canRefer ? (
              <Button asChild>
                <Link href={`/app/referrals/new?patientId=${patient.id}`}>
                  <Plus />
                  New referral
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {!isHomeFacility ? (
        <Alert variant="info" title="Access through a referral" className="mb-6">
          <p>
            This patient is registered at another facility. You can see this record because a
            referral links them to a facility you work in.
          </p>
        </Alert>
      ) : null}

      {patient.mergedIntoPatientId ? (
        <Alert variant="warning" title="Marked as a duplicate" className="mb-6">
          <p>
            This record has been linked to a primary record.{" "}
            <Link
              href={`/app/patients/${patient.mergedIntoPatientId}`}
              className="font-medium underline underline-offset-4"
            >
              Open the primary record
            </Link>
            .
          </p>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Care timeline</TabsTrigger>
              <TabsTrigger value="referrals">Referrals</TabsTrigger>
              <TabsTrigger value="appointments">Appointments</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Care timeline</CardTitle>
                  <CardDescription>
                    Every recorded event for this patient, newest first.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {profile.timeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
                  ) : (
                    <ol className="relative space-y-4 border-l border-border pl-5">
                      {profile.timeline.map((entry) => (
                        <li key={entry.id} className="relative">
                          <span
                            className={`absolute -left-[1.4rem] top-1.5 size-2 rounded-full ring-4 ring-card ${
                              entry.tone === "positive"
                                ? "bg-teal-600"
                                : entry.tone === "warning"
                                  ? "bg-amber-500"
                                  : entry.tone === "critical"
                                    ? "bg-coral-500"
                                    : "bg-muted-foreground/50"
                            }`}
                            aria-hidden
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{entry.title}</p>
                            <Badge variant="neutral">{humanise(entry.kind)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(entry.occurredAt)}
                            {entry.detail ? ` · ${entry.detail}` : ""}
                          </p>
                          {entry.referralId ? (
                            <Link
                              href={`/app/referrals/${entry.referralId}`}
                              className="mt-0.5 inline-block text-xs font-medium text-plum-700 hover:text-plum-900"
                            >
                              Open referral
                            </Link>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="referrals">
              <Card>
                <CardContent className="p-5">
                  {profile.referrals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No referrals for this patient.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {profile.referrals.map((referral) => (
                        <li
                          key={referral.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div>
                            <Link
                              href={`/app/referrals/${referral.id}`}
                              className="font-mono text-xs font-medium text-plum-700 hover:text-plum-900"
                            >
                              {referral.reference}
                            </Link>
                            <p className="text-sm text-foreground">{referral.reasonCategory}</p>
                            <p className="text-xs text-muted-foreground">
                              To {referral.receivingFacilityName} &middot;{" "}
                              {formatDate(referral.createdAt)}
                            </p>
                          </div>
                          <ReferralStatusBadge status={referral.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appointments">
              <Card>
                <CardContent className="p-5">
                  {profile.appointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No appointments recorded.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {profile.appointments.map((appointment) => (
                        <li
                          key={appointment.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {formatDateTime(appointment.scheduledFor)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {appointment.facilityName}
                            </p>
                          </div>
                          <AppointmentStatusBadge status={appointment.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes">
              <Card>
                <CardContent className="space-y-5 p-5">
                  {can(ctx, "note:create", { facilityId: viaFacilityId }) ? (
                    <NoteForm patientId={patient.id} aiEnabled={isAiEnabled()} />
                  ) : null}
                  {profile.notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No notes recorded.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {profile.notes.map((note) => (
                        <li key={note.id} className="py-4 first:pt-0 last:pb-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {note.authorName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(note.createdAt)}
                            </span>
                            {note.aiAssisted ? (
                              <Badge variant="warning">AI assisted draft</Badge>
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
            </TabsContent>

            <TabsContent value="messages">
              <Card>
                <CardContent className="p-5">
                  {profile.messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No messages have been created for this patient.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {profile.messages.map((message) => (
                        <li key={message.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                message.status === "delivered" || message.status === "read"
                                  ? "positive"
                                  : message.status === "failed" ||
                                      message.status === "undeliverable"
                                    ? "critical"
                                    : "neutral"
                              }
                            >
                              {humanise(message.status)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {message.direction === "outbound" ? "Sent" : "Received"} by{" "}
                              {message.channel.toUpperCase()} &middot;{" "}
                              {formatRelative(message.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {message.body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5 text-sm">
                <Row label="Record number" value={patient.recordNumber} />
                <Row label="Date of birth" value={formatDate(patient.dateOfBirth)} />
                <Row label="Mobile" value={maskPhone(patient.phone)} />
                <Row label="Alternative" value={maskPhone(patient.alternatePhone)} />
                <Row label="Language" value={patient.preferredLanguage.toUpperCase()} />
                <Row label="Contact method" value={humanise(patient.preferredChannel)} />
                <Row label="Area" value={patient.residentialArea ?? "Not recorded"} />
                <Row
                  label="Emergency contact"
                  value={
                    patient.emergencyContactName
                      ? `${patient.emergencyContactName} ${maskPhone(patient.emergencyContactPhone)}`
                      : "Not recorded"
                  }
                />
                <Row label="Registered" value={formatDate(patient.createdAt)} />
              </dl>
              {patient.notes ? (
                <div className="mt-4 rounded-lg bg-muted/60 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Notes for staff
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {patient.notes}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {activeEpisode ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Current pregnancy</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2.5 text-sm">
                  <Row label="Estimated due date" value={formatDate(activeEpisode.estimatedDueDate)} />
                  <Row
                    label="Last menstrual period"
                    value={formatDate(activeEpisode.lastMenstrualPeriod)}
                  />
                  <Row label="Booking visit" value={formatDate(activeEpisode.bookingDate)} />
                  <Row
                    label="Gravidity and parity"
                    value={`${activeEpisode.gravidity ?? "-"} / ${activeEpisode.parity ?? "-"}`}
                  />
                </dl>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Consent</CardTitle>
              <CardDescription>
                Messages are only sent where the matching consent is granted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConsentControls
                patientId={patient.id}
                canEdit={canUpdate}
                consents={profile.consents.map((consent) => ({
                  type: consent.type,
                  status: consent.status,
                  capturedAt: consent.capturedAt.toISOString(),
                  method: consent.method,
                }))}
              />
            </CardContent>
          </Card>

          {profile.tasks.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Coordination tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {profile.tasks.slice(0, 6).map((task) => (
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
