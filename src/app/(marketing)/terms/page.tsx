import type { Metadata } from "next";

import { Section } from "@/components/marketing/section";
import { REPOSITORY_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms that apply to this website, the Kea software and a pilot deployment.",
};

export default function TermsPage() {
  return (
    <Section>
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow mb-3">Legal</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Terms of use
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated 12 November 2026</p>

        <div className="prose-kea mt-8">
          <h2>1. Scope</h2>
          <p>
            These terms apply to this website and to the Kea application. The Kea source code is
            separately licensed under the Apache License, Version 2.0, and that licence governs your
            rights to use, modify and redistribute the code. Where these terms and the Apache
            License differ in respect of the code, the Apache License prevails.
          </p>

          <h2>2. Not a medical device, and not clinical advice</h2>
          <p>
            Kea is a coordination and record keeping tool. It does not diagnose, does not recommend
            treatment, does not triage and does not assign clinical urgency. Nothing the software
            displays is clinical advice. Every clinical decision remains the responsibility of a
            qualified healthcare professional exercising their own judgement.
          </p>
          <p>
            Kea is not an emergency system. It must not be relied on to raise or respond to a
            clinical emergency. Facilities must keep their existing emergency escalation routes.
          </p>

          <h2>3. Account holders</h2>
          <p>
            Accounts are issued to named individuals by an administrator at a participating
            organisation. You must not share your credentials, must not attempt to access records
            you have no care relationship with, and must report a suspected compromise immediately.
            Access is logged.
          </p>

          <h2>4. Permitted use</h2>
          <p>You may not use this website or the application to:</p>
          <ul>
            <li>access, copy or extract patient information beyond what your role requires;</li>
            <li>probe, scan or test the security of the service without written authorisation;</li>
            <li>submit false information through the pilot enquiry form; or</li>
            <li>interfere with the availability of the service for others.</li>
          </ul>

          <h2>5. Patient portal</h2>
          <p>
            The patient portal shows a patient appointment and referral progress information that
            their healthcare provider has released for patient view. It does not show staff notes,
            internal scores or clinical detail that has not been shared with the patient. Access is
            by a one time code sent to the phone number on record, and sessions are short lived.
          </p>

          <h2>6. Availability</h2>
          <p>
            A pilot deployment is provided on the basis agreed in writing with the participating
            institution. This public website is provided without any availability commitment and may
            change at any time.
          </p>

          <h2>7. No warranty</h2>
          <p>
            The software is provided on an &ldquo;as is&rdquo; basis without warranties or
            conditions of any kind, as set out in section 7 of the Apache License, Version 2.0. The
            Kea project has not certified the software for clinical use and makes no representation
            that it meets any regulatory standard.
          </p>

          <h2>8. Limitation of liability</h2>
          <p>
            To the extent permitted by law, the Kea project is not liable for any indirect,
            incidental or consequential loss arising from use of the software or this website. This
            does not limit liability that cannot lawfully be limited.
          </p>

          <h2>9. Changes</h2>
          <p>
            These terms may be updated. The date above shows when they last changed. Material
            changes affecting a pilot deployment will be communicated to the participating
            institution.
          </p>

          <h2>10. Contact</h2>
          <p>
            Questions about these terms, including security reports, should be raised through the
            process described in the repository at{" "}
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer noopener">
              {REPOSITORY_URL}
            </a>
            .
          </p>
        </div>
      </div>
    </Section>
  );
}
