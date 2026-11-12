import type { Metadata } from "next";
import Link from "next/link";

import { Section, SectionHeading } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/misc";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "For healthcare providers",
  description:
    "What Kea gives nurses, receiving clinicians, referral coordinators and healthcare managers, and what a pilot requires from your service.",
};

const AUDIENCES = [
  {
    role: "Nurses and midwives",
    gets: [
      "Register a patient once and reuse the record for every referral.",
      "Submit a referral with the reason, observations, requested actions and attachments.",
      "See acknowledgement and appointment updates without telephoning the hospital.",
      "Keep follow-up tasks in one queue instead of a paper register.",
    ],
  },
  {
    role: "Receiving clinicians",
    gets: [
      "Work an incoming queue ordered by priority and waiting time.",
      "Acknowledge, reject with a reason, or schedule an appointment in one place.",
      "Record attendance and the care outcome so the referring clinic is informed.",
      "See the clinical context the referring clinician recorded, and nothing unrelated.",
    ],
  },
  {
    role: "Referral coordinators",
    gets: [
      "A single workspace for unacknowledged referrals, missed visits and overdue follow-up.",
      "Contact attempt logging with channel, outcome and notes.",
      "Escalation thresholds set by your service rather than fixed by the software.",
      "A recorded resolution for every case that leaves the queue.",
    ],
  },
  {
    role: "Programme managers",
    gets: [
      "Completion rates, acknowledgement times and missed appointment rates from stored events.",
      "Referral volumes and bottlenecks by facility and period.",
      "Aggregate exports with small cell suppression applied.",
      "An analyst role that reads reporting without any access to patient records.",
    ],
  },
];

const REQUIREMENTS = [
  {
    heading: "Information governance",
    body: "Your institution needs a lawful basis for processing, a data processing agreement with whoever hosts the deployment, and a completed privacy impact assessment. Kea documents what data it holds and why, which is the input to that assessment, but it cannot perform it for you.",
  },
  {
    heading: "Clinical governance",
    body: "A named clinical lead should sign off the referral reason categories, the escalation thresholds and the message templates before go live. The experimental prediction service should stay disabled unless your governance process has specifically approved its use in a research setting.",
  },
  {
    heading: "Technical readiness",
    body: "A managed PostgreSQL database, a hosting environment for the application, and a Twilio account with an approved sender for SMS or WhatsApp. Messaging templates must be approved by the provider before any WhatsApp message can be sent outside a session window.",
  },
  {
    heading: "Operational readiness",
    body: "Named referral coordinators, agreed acknowledgement deadlines per facility, and a defined escalation route for cases the software surfaces. Kea identifies coordination gaps; it does not replace a clinical emergency response.",
  },
  {
    heading: "Security approvals",
    body: "Kea has not been independently penetration tested. An institution should commission its own security review, configure backups and retention, and agree an incident response process before any real patient data is entered.",
  },
];

export default function ForProvidersPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="For healthcare providers"
          title="What your team gets, and what a pilot asks of you."
          description="Kea is built for services that already run maternal referrals and want to see where they break down. This page sets out the value by role and the approvals a responsible deployment needs."
        />
      </Section>

      <Section>
        <div className="grid gap-5 md:grid-cols-2">
          {AUDIENCES.map((audience) => (
            <div
              key={audience.role}
              className="rounded-xl border border-border bg-card p-6 shadow-subtle"
            >
              <h3 className="font-display text-base font-semibold text-foreground">
                {audience.role}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {audience.gets.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section muted>
        <SectionHeading
          eyebrow="Roles and access"
          title="Access follows the job, and is enforced on the server."
          description="Each role carries a fixed set of permissions. Roles are granted either across an organisation or at one facility, and a facility role grants nothing at any other facility."
        />
        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Role
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  What it allows
                </th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((role) => (
                <tr key={role} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-foreground">
                    {ROLE_LABELS[role]}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Before a pilot"
          title="What a responsible deployment requires."
          description="These are the conditions we expect a partner institution to meet. We would rather set them out now than discover them during implementation."
        />
        <div className="mt-8 max-w-3xl">
          <Accordion type="single" collapsible className="w-full">
            {REQUIREMENTS.map((item) => (
              <AccordionItem key={item.heading} value={item.heading}>
                <AccordionTrigger>{item.heading}</AccordionTrigger>
                <AccordionContent>
                  <p className="leading-relaxed">{item.body}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
        <div className="mt-10">
          <Button asChild>
            <Link href="/request-a-pilot">Start a pilot conversation</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
