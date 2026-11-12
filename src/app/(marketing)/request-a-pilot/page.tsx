import type { Metadata } from "next";

import { PilotForm } from "@/components/marketing/pilot-form";
import { Section, SectionHeading } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Request a pilot",
  description:
    "Tell us about your maternal referral pathways and we will respond about running a Kea pilot in your service.",
};

const WHAT_HAPPENS = [
  {
    step: "A scoping conversation",
    body: "We map your referral pathways, which facilities send to which, and how referrals are tracked today.",
  },
  {
    step: "Governance review",
    body: "Your information governance and clinical teams review what Kea stores, why, and what approvals your institution requires.",
  },
  {
    step: "A limited configuration",
    body: "We configure your organisation, facilities, pathways, escalation thresholds and message templates in a dedicated environment.",
  },
  {
    step: "A bounded pilot",
    body: "A small number of facilities run live referrals with agreed success measures and a defined review point.",
  },
];

export default function RequestPilotPage() {
  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        <div>
          <SectionHeading
            eyebrow="Request a pilot"
            title="Start a conversation about running Kea in your service."
            description="We respond to every enquiry from a healthcare organisation. Please use a work email address so we can confirm who you are."
          />

          <div className="mt-10 space-y-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              What happens next
            </h2>
            <ol className="space-y-4">
              {WHAT_HAPPENS.map((item, index) => (
                <li key={item.step} className="flex gap-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-plum-100 text-xs font-semibold text-plum-800">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.step}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-10 rounded-lg border border-border bg-muted/40 p-5">
            <h2 className="font-display text-sm font-semibold text-foreground">
              How we handle your enquiry
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The details you submit are stored so that we can respond to you about a pilot. They
              are not used for marketing lists and are not shared with third parties. You can ask us
              to delete them at any time.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-subtle sm:p-8">
          <PilotForm />
        </div>
      </div>
    </Section>
  );
}
