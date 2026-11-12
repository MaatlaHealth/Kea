import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  ClipboardCheck,
  Github,
  Lock,
  MessageSquare,
  Network,
  ScanSearch,
  ShieldCheck,
  Users,
} from "lucide-react";

import { PathwayDemo } from "@/components/marketing/pathway-demo";
import { FeatureCard, Section, SectionHeading } from "@/components/marketing/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { REPOSITORY_URL } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-backdrop" aria-hidden />
        <div className="container relative py-16 sm:py-20 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
            <div className="max-w-xl">
              <Badge variant="progress" className="mb-5">
                Maternal referral continuity
              </Badge>
              <h1 className="font-display text-[2.1rem] font-semibold leading-[1.1] tracking-tight text-foreground text-balance sm:text-5xl">
                Every maternal referral deserves a confirmed outcome.
              </h1>
              <p className="mt-5 text-base leading-7 text-muted-foreground text-pretty sm:text-lg sm:leading-8">
                Kea connects clinics, hospitals and patients so maternal healthcare referrals can be
                tracked, coordinated and followed through.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <Link href="/how-it-works">
                    Explore Kea
                    <ArrowRight />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/request-a-pilot">Request a pilot</Link>
                </Button>
              </div>
              <dl className="mt-10 grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
                {[
                  { term: "Built for", detail: "Clinics, district hospitals and coordinators" },
                  { term: "Reaches patients by", detail: "SMS and WhatsApp, no app required" },
                  { term: "Licence", detail: "Apache 2.0, open source" },
                ].map((item) => (
                  <div key={item.term}>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {item.term}
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-snug text-foreground">
                      {item.detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="lg:pl-4">
              <PathwayDemo />
            </div>
          </div>
        </div>
      </section>

      {/* 1. The problem */}
      <Section muted>
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <SectionHeading
            eyebrow="The problem"
            title="A referral is written, and then nobody knows what happened."
            description="In many health systems a pregnant woman can be referred from a clinic to a hospital without reliable confirmation that she arrived, was seen or came back for follow-up. Paper registers, separate systems and informal phone calls leave the referring clinician without an answer."
          />
          <ul className="space-y-4">
            {[
              {
                title: "No confirmation of arrival",
                body: "The referring clinic often has no way to tell whether the patient reached the hospital, short of telephoning a ward.",
              },
              {
                title: "Delays go unnoticed",
                body: "When a referral is not acknowledged, nothing surfaces it. The delay becomes visible only when a complication appears.",
              },
              {
                title: "Follow-up has no owner",
                body: "After hospital care, responsibility returns to the clinic informally. Without a task that stays open, follow-up is assumed rather than recorded.",
              },
              {
                title: "Patterns stay invisible",
                body: "Because the events are not captured in a structured form, managers cannot see where in the pathway cases are being lost.",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="rounded-lg border border-border bg-card p-5 shadow-subtle"
              >
                <h3 className="font-display text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 2. How Kea connects the journey */}
      <Section>
        <SectionHeading
          eyebrow="How Kea connects the care journey"
          title="One referral record that both facilities and the patient can act on."
          description="Kea holds the referral as a single record with an explicit state. Each change is attributed to a person, timestamped and permanent, so the current position of every pathway is a fact rather than a recollection."
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard icon={Network} title="A referral with a defined state">
            Referrals move through a controlled set of states. The system rejects transitions that
            do not make clinical or administrative sense, and records who made each change.
          </FeatureCard>
          <FeatureCard icon={Building2} title="A shared view across facilities">
            The referring clinic and the receiving hospital see the same record. Access follows the
            referral relationship, so neither sees unrelated patients at the other site.
          </FeatureCard>
          <FeatureCard icon={ClipboardCheck} title="Acknowledgement with a clock">
            Each facility sets its own acknowledgement deadline. A referral that passes it becomes a
            coordination task instead of sitting unnoticed in a queue.
          </FeatureCard>
          <FeatureCard icon={Users} title="Follow-up that stays open">
            When the hospital asks for follow-up, a task opens at the referring clinic and remains
            open until a person records the outcome.
          </FeatureCard>
          <FeatureCard icon={MessageSquare} title="The patient is kept informed">
            Where consent and a contact channel are on record, the patient receives appointment and
            follow-up messages that contain no clinical detail.
          </FeatureCard>
          <FeatureCard icon={BarChart3} title="Events become measurable">
            Because each step is stored as an event, completion rates and acknowledgement times are
            calculated from what actually happened.
          </FeatureCard>
        </div>
      </Section>

      {/* 3. Identifying patients who may need more follow-up */}
      <Section muted>
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <SectionHeading
            eyebrow="Prioritising coordination effort"
            title="Identifying referrals that may need additional follow-up."
            description="Coordinators cannot telephone everyone. Kea ranks open referrals using operational signals such as time since submission, lead time to the appointment, prior missed visits and whether messages were delivered."
          />
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6 shadow-subtle">
              <h3 className="font-display text-sm font-semibold text-foreground">
                Operational rules first
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The prioritisation that coordinators rely on every day is rule based and runs
                entirely inside the application. It is transparent, inspectable and does not depend
                on any model being available.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-6">
              <div className="mb-2 flex items-center gap-2">
                <ScanSearch className="size-4 text-amber-800" />
                <h3 className="font-display text-sm font-semibold text-amber-900">
                  An experimental prediction service
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-amber-900/90">
                Kea includes a separate, optional service that estimates the likelihood of
                non-attendance from referral workflow features. It is trained on synthetic data in
                this repository, it is marked experimental throughout the interface, and it has not
                been clinically validated. It never assigns clinical urgency, makes a diagnosis or
                affects a patient facing message.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* 4 and 5. Coordination and patient communication */}
      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <SectionHeading
              eyebrow="Clinical coordination"
              title="A workspace for the people who chase referrals."
              description="Referral coordinators get a queue of exactly the cases that need a person: unacknowledged referrals, missed appointments, overdue follow-up and failed messages."
            />
            <ul className="mt-6 space-y-3">
              {[
                "Contact attempts are recorded with the channel, outcome and a note.",
                "Escalation thresholds are configured per facility rather than fixed in code.",
                "Every resolution is captured, so the reason a case closed is part of the record.",
                "Tasks are deduplicated, so one missed appointment never produces five entries.",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <SectionHeading
              eyebrow="Patient communication"
              title="Reaching patients on the phone they already have."
              description="Messages go out over SMS or WhatsApp. No smartphone application is required, and the patient portal is built for a low-bandwidth connection."
            />
            <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-subtle">
              <p className="eyebrow mb-3">Example message</p>
              <p className="rounded-lg bg-muted p-4 font-mono text-[13px] leading-relaxed text-foreground">
                Hello, this is Kea. You have a healthcare appointment at Riverside District Hospital
                on 14 Mar 2026 at 09:30. Please contact your clinic if you need to change it.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Message templates never carry a diagnosis, a reason for referral or any clinical
                observation. Consent is recorded per message type and a patient can opt out by
                replying.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* 6. Operational intelligence */}
      <Section muted>
        <SectionHeading
          eyebrow="Operational intelligence"
          title="Reporting that managers can act on."
          align="center"
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Completion rate",
              body: "The share of submitted referrals that reach a confirmed outcome, by facility and period.",
            },
            {
              title: "Acknowledgement time",
              body: "Median hours between submission and acknowledgement, measured from stored events.",
            },
            {
              title: "Missed appointment rate",
              body: "Booked visits that were not attended, with the follow-up actions that resulted.",
            },
            {
              title: "Pathway bottlenecks",
              body: "Where open referrals are currently sitting, so attention goes to the right stage.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
          Every figure is calculated from stored referral events using a documented formula. Small
          cell suppression is applied to breakdowns so that reporting cannot identify an individual.
        </p>
      </Section>

      {/* 7. Privacy and open source */}
      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <SectionHeading
            eyebrow="Privacy and openness"
            title="Health information handled carefully, and code anyone can read."
            description="Kea is built with South Africa's Protection of Personal Information Act in mind. Authorisation is enforced on the server, access follows explicit care relationships, and the audit trail records actions without disclosing clinical content."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <FeatureCard icon={Lock} title="Least privilege by default">
              A programme analyst can read aggregate reporting and nothing else. A clinician sees
              only patients at their facility or linked to them by a referral.
            </FeatureCard>
            <FeatureCard icon={ShieldCheck} title="Honest about what is not done">
              Independent security testing, clinical validation and the approvals required before
              real patient use are documented as outstanding, not claimed.
            </FeatureCard>
            <FeatureCard icon={Github} title="Open source under Apache 2.0">
              The platform code, database schema, model documentation and deployment configuration
              are published so health systems can inspect and adapt them.
            </FeatureCard>
            <FeatureCard icon={Network} title="Built to interoperate later">
              Referral data is kept behind an adapter boundary so a future FHIR integration does not
              mean rewriting the referral engine.
            </FeatureCard>
          </div>
        </div>
      </Section>

      {/* 8. Pilot participation */}
      <section className="section bg-plum-700 text-plum-50">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-200">
              Pilot participation
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl">
              Talk to us about running Kea in your service.
            </h2>
            <p className="mt-4 text-[0.975rem] leading-7 text-plum-100 text-pretty">
              We are looking for maternal health services that want to measure and close referral
              gaps. A pilot begins with a scoping conversation about your referral pathways,
              information governance requirements and the approvals your institution needs.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" variant="secondary" asChild>
                <Link href="/request-a-pilot">Request a pilot</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-plum-300/50 bg-transparent text-plum-50 hover:bg-plum-600 hover:text-white"
                asChild
              >
                <a href={REPOSITORY_URL} target="_blank" rel="noreferrer noopener">
                  <Github />
                  Read the code
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
