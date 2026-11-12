import type { Metadata } from "next";
import { Github } from "lucide-react";

import { Section, SectionHeading } from "@/components/marketing/section";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { REPOSITORY_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Technology and open source",
  description:
    "The architecture behind Kea, the decisions we made and why, and what is published openly under the Apache License 2.0.",
};

const STACK = [
  {
    layer: "Application",
    choice: "Next.js with TypeScript and React",
    why: "Server rendered pages and server actions keep authorisation on the server. One deployable unit is simpler for a health service to run than a cluster of services.",
  },
  {
    layer: "Database",
    choice: "PostgreSQL with Drizzle ORM",
    why: "Relational integrity matters for referral state. Drizzle keeps the schema in TypeScript and generates versioned SQL migrations that can be reviewed before they run.",
  },
  {
    layer: "Authentication",
    choice: "First party sessions on PostgreSQL",
    why: "Opaque session tokens are stored only as SHA-256 digests, passwords use scrypt from the Node standard library, and the deployment keeps no dependency on an external identity provider.",
  },
  {
    layer: "Validation",
    choice: "Zod at every boundary",
    why: "Form input, webhook payloads, environment variables and model responses are parsed into typed values before anything else touches them.",
  },
  {
    layer: "Messaging",
    choice: "Twilio behind a provider interface",
    why: "SMS and WhatsApp go through one abstraction with consent checks, idempotency keys, retry handling and verified webhook signatures. Another provider can be added without touching the referral engine.",
  },
  {
    layer: "Prediction",
    choice: "Python, scikit-learn, FastAPI",
    why: "A separate service with its own training, evaluation and versioning. The product works fully with the service switched off.",
  },
  {
    layer: "Assisted drafting",
    choice: "Gemini, optional and off by default",
    why: "Used only to propose a structured draft from free text that a clinician then reviews. It is disabled unless an operator enables it, and it never writes to a record directly.",
  },
  {
    layer: "Testing",
    choice: "Vitest and Playwright",
    why: "Unit tests cover the state machine, permissions, templates and webhook verification. A Playwright test walks the full referral journey end to end.",
  },
];

const DECISIONS = [
  {
    title: "Sessions in our own database rather than a hosted auth service",
    body: "The brief suggested Supabase Auth. We kept Supabase as a PostgreSQL and storage option but implemented authentication directly, because referral authorisation already depends on organisation and facility membership rows in the same database. Keeping the session, the membership and the clinical record in one transactional store removes a class of consistency problems and keeps the project deployable on any PostgreSQL host.",
  },
  {
    title: "Drizzle rather than Prisma",
    body: "Drizzle generates plain SQL migrations that a hospital IT team can read and approve, and it does not require a separate query engine binary at runtime. Both were viable; reviewability decided it.",
  },
  {
    title: "The Gemini call is a plain HTTPS request",
    body: "No vendor SDK is bundled. The request body, the response schema and the timeout are all visible in one file, which matters for a feature that must never see identifiable patient data without an explicit legal basis.",
  },
  {
    title: "Rate limiting in PostgreSQL",
    body: "A separate cache would be another thing to run and secure. Fixed window counters in the database are shared across serverless instances and are sufficient for the abuse this guards against.",
  },
];

export default function TechnologyPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="Technology and open source"
          title="Built to be read, run and adapted."
          description="Kea is published under the Apache License 2.0. The architecture favours a small number of well understood parts over a distributed system that a health service would struggle to operate."
        />
        <div className="mt-6">
          <Button variant="outline" asChild>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer noopener">
              <Github />
              View the repository
            </a>
          </Button>
        </div>
      </Section>

      <Section>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Layer
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Choice
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Why
                </th>
              </tr>
            </thead>
            <tbody>
              {STACK.map((row) => (
                <tr key={row.layer} className="border-b border-border last:border-0 align-top">
                  <td className="whitespace-nowrap px-5 py-4 font-medium text-foreground">
                    {row.layer}
                  </td>
                  <td className="px-5 py-4 text-foreground">{row.choice}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section muted>
        <SectionHeading
          eyebrow="Decisions worth explaining"
          title="Where we departed from the obvious choice."
        />
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {DECISIONS.map((item) => (
            <div key={item.title} className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-display text-sm font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="Interoperability"
              title="A path to FHIR without rewriting the engine."
              description="Referral, patient, appointment and encounter data sit behind an adapter boundary. An integration maps between Kea records and an external representation; the referral state machine and the authorisation rules are untouched by that mapping."
            />
            <Alert variant="warning" title="Not certified" className="mt-6">
              <p>
                No formal interoperability certification or conformance testing has been carried
                out. The adapter boundary makes a future integration tractable; it does not claim
                that one exists today.
              </p>
            </Alert>
          </div>

          <div>
            <SectionHeading
              eyebrow="The prediction service"
              title="Experimental, and labelled as such."
              description="The non-attendance model is trained on synthetic data generated in this repository. It exists to prove the engineering path from referral features to a scored, versioned, explainable prediction."
            />
            <Alert variant="destructive" title="Not validated for patient care" className="mt-6">
              <p>
                No performance figure produced from synthetic data is evidence of clinical
                effectiveness. The model does not diagnose, does not predict maternal outcomes and
                never assigns clinical urgency. Predictions are disabled unless an operator turns
                them on, and the whole product works without them.
              </p>
            </Alert>
          </div>
        </div>
      </Section>
    </>
  );
}
