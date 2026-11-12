import type { Metadata } from "next";
import Link from "next/link";

import { Section } from "@/components/marketing/section";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What personal information Kea holds, why it holds it, who can see it and how long it is kept.",
};

export default function PrivacyPage() {
  return (
    <Section>
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow mb-3">Privacy</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Privacy policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated 12 November 2026</p>

        <Alert variant="warning" title="Two different roles" className="mt-8">
          <p>
            Kea is software. When a healthcare organisation runs Kea, that organisation is the
            responsible party for the patient information held in its deployment. This policy
            describes how the software handles information and how the Kea project handles
            enquiries submitted on this website. It does not replace the privacy notice your own
            healthcare provider gives you.
          </p>
        </Alert>

        <div className="prose-kea mt-8">
          <h2>Information this website collects</h2>
          <p>
            The public website collects only what you type into the pilot enquiry form: your
            organisation, your name, your work email address, an optional phone number and role, the
            country your service operates in, optional figures about your facilities and referral
            volumes, and your message. These details are stored so that the Kea team can respond to
            you about a pilot. They are not used for marketing lists and are not sold or shared with
            third parties.
          </p>
          <p>
            The website sets one cookie only after you sign in, which holds an opaque session
            identifier. There are no advertising cookies, no third party analytics scripts and no
            tracking pixels.
          </p>

          <h2>Information the application holds</h2>
          <p>
            A deployment of Kea holds the information a referral needs in order to be coordinated
            and completed:
          </p>
          <ul>
            <li>
              <strong>Patient details.</strong> Name, record number, date of birth, contact numbers,
              preferred language, preferred contact channel, residential area, an optional emergency
              contact, and pregnancy episode details such as an estimated due date.
            </li>
            <li>
              <strong>Clinical context for the referral.</strong> The reason for referral, priority,
              clinical observations the referring clinician recorded, requested actions, clinical
              notes and any attached documents.
            </li>
            <li>
              <strong>Workflow events.</strong> Referral status changes, appointments, attendance,
              coordination tasks, contact attempts and escalations, each with the person who
              recorded it and the time.
            </li>
            <li>
              <strong>Communication records.</strong> The messages sent to a patient, their delivery
              status, consent records and any opt out.
            </li>
            <li>
              <strong>Staff account details.</strong> Name, work email address, job title, role
              assignments, sessions and audit events.
            </li>
          </ul>
          <p>
            Kea deliberately does not have a field for a national identity number, race, income or
            any other characteristic that is not needed to coordinate a referral. A deployment that
            adds such a field must do so under its own legal basis.
          </p>

          <h2>Why this information is held</h2>
          <p>
            Each category exists for a stated operational purpose: to identify the right patient, to
            route the referral to the right facility, to let the receiving team prepare, to tell the
            patient when and where to attend, to make sure a missed step is followed up by a named
            person, and to report on where the referral pathway is failing. Information that serves
            none of these purposes is not collected.
          </p>

          <h2>Who can see it</h2>
          <p>
            Access is enforced on the server and follows care relationships, not job titles alone. A
            clinician can see a patient record when the patient is registered at a facility they
            work in, or when a referral links that patient to a facility they work in. A role granted
            at one facility grants nothing at another. A programme analyst can read aggregate
            reporting and has no access to patient records anywhere in the product.
          </p>
          <p>
            Every patient record view, every referral status change and every administrative action
            is recorded in an audit trail. Audit entries record who did what to which record; they
            do not contain patient names, clinical content or message bodies.
          </p>

          <h2>Messages to patients</h2>
          <p>
            Messages are sent only where consent for that category of message is recorded and has
            not been withdrawn. Message templates are fixed and are written so that an intercepted
            message reveals nothing clinical: they may reference a facility name, a date and a time.
            They never reference a diagnosis, a reason for referral or a clinical observation. A
            patient can stop messages at any time by replying with STOP, or by asking staff to
            update their preferences.
          </p>

          <h2>Artificial intelligence</h2>
          <p>
            Kea includes an optional assisted drafting feature. It is disabled by default. When an
            operator enables it, it can turn a clinician&rsquo;s free text into a proposed structured
            draft which that clinician must review and approve before anything is saved. It never
            writes to a record directly, never makes a diagnosis and never recommends treatment.
            Identifiable patient data is not sent to an external AI service unless the deploying
            organisation has established a legal basis, put a processing agreement in place and
            explicitly configured it.
          </p>
          <p>
            The non-attendance prediction service is experimental, is trained on synthetic data in
            this repository, and is not validated for patient care. It uses referral workflow
            features only. It does not use race, income or any other protected characteristic.
          </p>

          <h2>Retention</h2>
          <p>
            Retention is configured by the deploying organisation in line with the record keeping
            rules that apply to it. The software supports deletion of a patient record and
            redaction of the associated contact details while preserving the non identifying
            workflow events needed for aggregate reporting. Enquiries submitted on this website are
            kept for as long as a pilot conversation is active and deleted on request.
          </p>

          <h2>Your rights</h2>
          <p>
            Under South Africa&rsquo;s Protection of Personal Information Act you may ask what
            personal information is held about you, ask for it to be corrected, and object to its
            processing in defined circumstances. If your information is held in a healthcare
            provider&rsquo;s deployment of Kea, direct that request to the provider, which is the
            responsible party. For enquiries submitted on this website, contact the Kea team using
            the address in the repository.
          </p>

          <h2>What we do not claim</h2>
          <p>
            Kea has not been independently audited for POPIA compliance, has not undergone
            independent penetration testing, and holds no clinical certification. Those remain
            necessary steps before any deployment handling real patient records. See{" "}
            <Link href="/data-governance">data governance</Link> for the full list of outstanding
            approvals.
          </p>
        </div>
      </div>
    </Section>
  );
}
