import type { Metadata } from "next";

import { Section, SectionHeading } from "@/components/marketing/section";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Data governance",
  description:
    "What Kea stores and why, the controls that are implemented, and the approvals that remain outstanding before real patient use.",
};

const DATA_CATEGORIES = [
  {
    category: "Patient identity",
    fields: "Name, record number, date of birth",
    purpose: "Identify the correct person across two facilities and prevent duplicate records.",
  },
  {
    category: "Contact details",
    fields: "Phone, alternate phone, preferred channel, preferred language",
    purpose: "Send appointment and follow-up messages and allow coordinator outreach.",
  },
  {
    category: "Locality",
    fields: "Residential area as free text",
    purpose:
      "Give coordinators travel context. No precise home coordinates are stored at any point.",
  },
  {
    category: "Pregnancy episode",
    fields: "Estimated due date, last menstrual period, gravidity, parity, booking date",
    purpose: "Give the receiving facility the context needed to prioritise and prepare.",
  },
  {
    category: "Referral clinical content",
    fields: "Reason, priority, observations, requested actions, notes, documents",
    purpose: "Communicate the clinical question to the receiving team.",
  },
  {
    category: "Workflow events",
    fields: "Status changes, appointments, attendance, tasks, contact attempts, escalations",
    purpose: "Make each handover accountable and allow pathway reporting.",
  },
  {
    category: "Consent",
    fields: "Consent type, status, method, who captured it and when",
    purpose: "Establish a lawful basis for each category of message before it is sent.",
  },
  {
    category: "Staff and audit",
    fields: "Account details, role assignments, sessions, audit events",
    purpose: "Enforce least privilege access and provide an accountable record of actions.",
  },
];

const IMPLEMENTED = [
  "Server side authorisation on every action, with permissions scoped to organisation and facility",
  "Record level access that follows the referral relationship rather than organisation membership alone",
  "Passwords hashed with scrypt; session tokens stored only as SHA-256 digests",
  "Audit events for record views, status changes and administrative actions, excluding clinical content",
  "Message templates that carry no clinical detail, with per category consent and opt out handling",
  "Verified Twilio webhook signatures and idempotent processing of provider callbacks",
  "Rate limiting on sign in, password reset, patient portal codes, enquiries and assisted drafting",
  "Security headers including a content security policy, frame denial and strict transport security",
  "Small cell suppression on analytics breakdowns",
  "Synthetic patient records flagged in the database and labelled in the interface",
];

const OUTSTANDING = [
  {
    item: "Independent penetration test and security review",
    detail: "Not performed. Required before any deployment holding real patient records.",
  },
  {
    item: "Privacy impact assessment by the deploying organisation",
    detail: "Must be completed by the responsible party, informed by the data table above.",
  },
  {
    item: "Data processing agreements",
    detail:
      "Needed with the hosting provider, the database provider and the messaging provider before live use.",
  },
  {
    item: "Clinical sign off of reason categories, thresholds and templates",
    detail: "A named clinical lead must approve these for the service before go live.",
  },
  {
    item: "Clinical validation of the prediction service",
    detail:
      "Not performed. The model is trained on synthetic data and must not inform patient care in its current state.",
  },
  {
    item: "Backup, restore and retention procedures",
    detail:
      "Documented in the repository as guidance. Each deployment must implement and test them.",
  },
  {
    item: "Incident response and breach notification process",
    detail: "Must be defined by the deploying organisation in line with POPIA obligations.",
  },
  {
    item: "Accessibility audit",
    detail:
      "The interface is built to WCAG 2.2 AA patterns and tested in automated checks, but has not been independently audited.",
  },
];

export default function DataGovernancePage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="Data governance"
          title="What Kea stores, why, and what still needs approval."
          description="This page exists so that an information governance officer can assess Kea without reading the source code first. It is also the honest list of what has not been done."
        />
      </Section>

      <Section>
        <h2 className="mb-5 font-display text-lg font-semibold text-foreground">
          Data categories and purpose
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Category
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Fields
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Purpose
                </th>
              </tr>
            </thead>
            <tbody>
              {DATA_CATEGORIES.map((row) => (
                <tr key={row.category} className="border-b border-border align-top last:border-0">
                  <td className="px-5 py-4 font-medium text-foreground">{row.category}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.fields}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Alert variant="info" title="Not collected" className="mt-6">
          <p>
            Kea has no field for a national identity number, race, religion, income, immigration
            status or sexual orientation. None of these are needed to coordinate a maternal referral,
            and the prediction service does not use protected characteristics even where they might
            be predictive.
          </p>
        </Alert>
      </Section>

      <Section muted>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <h2 className="font-display text-lg font-semibold text-foreground">Implemented</h2>
              <Badge variant="positive">In the code today</Badge>
            </div>
            <ul className="space-y-2.5">
              {IMPLEMENTED.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground"
                >
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-5 flex items-center gap-3">
              <h2 className="font-display text-lg font-semibold text-foreground">Outstanding</h2>
              <Badge variant="warning">Before real patient use</Badge>
            </div>
            <ul className="space-y-2.5">
              {OUTSTANDING.map((item) => (
                <li
                  key={item.item}
                  className="rounded-lg border border-border bg-card px-4 py-3 text-sm"
                >
                  <p className="font-medium text-foreground">{item.item}</p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </>
  );
}
