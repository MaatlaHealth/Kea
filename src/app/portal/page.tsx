import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Phone, Settings2 } from "lucide-react";

import { AppointmentResponse } from "@/components/portal/appointment-response";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPatientSession } from "@/lib/auth/patient-session";
import { PATIENT_STATUS_TEXT, patientOverview } from "@/lib/portal/queries";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your appointments",
  robots: { index: false, follow: false },
};

export default async function PortalHomePage() {
  const patient = await getPatientSession();
  if (!patient) redirect("/portal/sign-in");

  const overview = await patientOverview(patient);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-foreground">
          Hello {patient.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your appointments and referral progress.
        </p>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="size-4" />
          Appointments
        </h2>

        {overview.upcoming.length === 0 ? (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                You have no appointments booked at the moment. If you are expecting one, contact
                your clinic.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-4">
            {overview.upcoming.map((appointment) => (
              <li key={appointment.id}>
                <Card className="border-plum-200">
                  <CardContent className="p-5">
                    <p className="font-display text-lg font-semibold text-foreground">
                      {formatDate(appointment.scheduledFor)}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-plum-700">
                      {formatTime(appointment.scheduledFor)}
                    </p>
                    <p className="mt-2 text-sm text-foreground">{appointment.facilityName}</p>
                    {appointment.facilityAddress ? (
                      <p className="text-sm text-muted-foreground">{appointment.facilityAddress}</p>
                    ) : null}
                    {appointment.facilityPhone ? (
                      <a
                        href={`tel:${appointment.facilityPhone}`}
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-plum-700"
                      >
                        <Phone className="size-4" />
                        {appointment.facilityPhone}
                      </a>
                    ) : null}

                    <AppointmentResponse
                      appointmentId={appointment.id}
                      confirmed={Boolean(appointment.confirmedAt)}
                      assistanceRequested={Boolean(appointment.assistanceRequestedAt)}
                    />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Your referrals
        </h2>
        {overview.referrals.length === 0 ? (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                You have no referrals recorded in Kea.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {overview.referrals.map((referral) => {
              const text = PATIENT_STATUS_TEXT[referral.status];
              return (
                <li key={referral.id}>
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {referral.receivingFacilityName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            From {referral.referringFacilityName} &middot;{" "}
                            {formatDate(referral.createdAt)}
                          </p>
                        </div>
                        <Badge variant="progress">{text.label}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {text.detail}
                      </p>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        Reference {referral.reference}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {overview.sharedNotes.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Messages from your care team
          </h2>
          <ul className="space-y-3">
            {overview.sharedNotes.map((note) => (
              <li key={note.id}>
                <Card>
                  <CardContent className="p-5">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {note.body}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(note.createdAt)}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Phone className="size-4" />
              Who to contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contact numbers are on record.</p>
            ) : (
              <ul className="space-y-2">
                {overview.contacts.map((contact) => (
                  <li key={contact.name} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground">{contact.name}</span>
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="text-sm font-medium text-plum-700"
                      >
                        {contact.phone}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">No number on record</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              If this is an emergency, do not wait for a reply here. Go to your nearest healthcare
              facility or call your country&rsquo;s emergency number.
            </p>
          </CardContent>
        </Card>
      </section>

      <Link
        href="/portal/preferences"
        className="flex items-center justify-between rounded-xl border border-border bg-card p-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <span className="flex items-center gap-2">
          <Settings2 className="size-4" />
          Messages and preferences
        </span>
        <span aria-hidden>&rarr;</span>
      </Link>
    </div>
  );
}
