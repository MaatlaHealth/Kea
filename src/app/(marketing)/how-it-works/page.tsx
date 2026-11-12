import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Inbox,
  PhoneCall,
  Send,
  UserPlus,
} from "lucide-react";

import { Section, SectionHeading } from "@/components/marketing/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/referrals/state-machine";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The Kea referral pathway from screening to a closed follow-up, and the controls that keep each step accountable.",
};

const STEPS = [
  {
    icon: UserPlus,
    title: "Register the patient once",
    body: "A nurse or midwife registers the patient at the clinic with the details needed to coordinate care: contact number, preferred language, preferred channel and the pregnancy episode. Kea checks for likely duplicates before the record is created and keeps a history of later changes.",
  },
  {
    icon: Send,
    title: "Create and submit the referral",
    body: "The clinician selects the receiving facility from the pathways configured for their clinic, records the reason, priority, observations and requested actions, and attaches supporting documents. Submitting allocates a reference and places the referral in the receiving facility queue.",
  },
  {
    icon: Inbox,
    title: "The receiving facility acknowledges",
    body: "An authorised clinician at the hospital sees the referral in their incoming queue and acknowledges it, which is timestamped and attributed. If acknowledgement passes the facility deadline, a coordination task is raised automatically.",
  },
  {
    icon: CalendarClock,
    title: "An appointment is scheduled",
    body: "Scheduling creates the appointment, informs the referring clinic and, where consent and a channel are on record, sends the patient a message containing the facility, date and time and nothing clinical.",
  },
  {
    icon: AlertTriangle,
    title: "Attendance, or the absence of it, is recorded",
    body: "Hospital staff record whether the patient attended. A missed appointment opens a coordination task at the referring clinic with a due time taken from the escalation policy.",
  },
  {
    icon: PhoneCall,
    title: "A coordinator works the exception",
    body: "The coordinator records each contact attempt with its channel, outcome and notes. They can rebook, escalate, or record that the patient could not be reached. Nothing is resolved without a person recording what happened.",
  },
  {
    icon: FileText,
    title: "The care outcome returns to the clinic",
    body: "The receiving clinician documents the care provided. The referring facility sees the update on the same record, and a follow-up task opens at the clinic if the hospital asked for one.",
  },
  {
    icon: CheckCircle2,
    title: "The pathway closes with a confirmed outcome",
    body: "Once follow-up is complete, the referral is closed. A closed referral has a documented ending rather than an assumed one, and contributes to the facility completion rate.",
  },
];

const PRIMARY_STATES = [
  "draft",
  "submitted",
  "received",
  "acknowledged",
  "appointment_scheduled",
  "patient_attended",
  "care_completed",
  "follow_up_required",
  "follow_up_completed",
  "closed",
] as const;

const EXCEPTION_STATES = [
  "rejected",
  "cancelled",
  "missed_appointment",
  "unable_to_contact",
  "escalated",
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="How it works"
          title="From a concern at a clinic to a closed referral."
          description="Kea makes each handover in the maternal referral pathway explicit. The steps below describe what actually happens in the software, not an idealised process."
        />
      </Section>

      <Section>
        <ol className="grid gap-5 md:grid-cols-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="rounded-xl border border-border bg-card p-6 shadow-subtle"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-plum-50 text-plum-700">
                    <Icon className="size-4.5" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Step {index + 1}
                  </span>
                </div>
                <h3 className="font-display text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section muted>
        <SectionHeading
          eyebrow="The referral state machine"
          title="Every referral has exactly one state, and only valid moves are allowed."
          description="The set of permitted transitions is defined in one module and enforced on the server. A clinician at the referring clinic cannot acknowledge on behalf of the hospital, and a referral cannot skip from submitted to closed."
        />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-4 font-display text-sm font-semibold text-foreground">
              Pathway states
            </h3>
            <div className="flex flex-wrap gap-2">
              {PRIMARY_STATES.map((state) => (
                <Badge key={state} variant="progress">
                  {STATUS_LABELS[state]}
                </Badge>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-4 font-display text-sm font-semibold text-foreground">
              Exception states
            </h3>
            <div className="flex flex-wrap gap-2">
              {EXCEPTION_STATES.map((state) => (
                <Badge key={state} variant="warning">
                  {STATUS_LABELS[state]}
                </Badge>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Exception states are first class. A rejected or missed referral is still visible, still
              measured and still requires a recorded resolution.
            </p>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="What each transition records"
          title="A referral history you can audit."
          align="center"
        />
        <div className="mx-auto mt-8 grid max-w-3xl gap-3">
          {[
            "The previous state and the new state",
            "The person who made the change and the facility they acted for",
            "The time the change was recorded",
            "Any note or reason the action required",
            "An audit event that excludes clinical content and patient names",
            "The notification and message rules that applied as a result",
          ].map((item) => (
            <div
              key={item}
              className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-600" />
              <span className="text-sm text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <Button asChild>
            <Link href="/request-a-pilot">Request a pilot</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
