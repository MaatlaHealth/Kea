import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PreferencesForm } from "@/components/portal/preferences-form";
import { getPatientSession } from "@/lib/auth/patient-session";
import { patientOverview } from "@/lib/portal/queries";
import { maskPhone } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Messages and preferences",
  robots: { index: false, follow: false },
};

export default async function PortalPreferencesPage() {
  const patient = await getPatientSession();
  if (!patient) redirect("/portal/sign-in");

  const overview = await patientOverview(patient);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal" className="text-xs font-medium text-muted-foreground hover:text-foreground">
          <span aria-hidden>&larr;</span> Back
        </Link>
        <h1 className="mt-2 font-display text-xl font-semibold text-foreground">
          Messages and preferences
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We use the number {maskPhone(patient.phone)}. To change it, ask your clinic.
        </p>
      </div>

      <PreferencesForm
        preferredChannel={patient.preferredChannel}
        appointmentMessaging={overview.consents.appointmentMessaging}
        followUpMessaging={overview.consents.followUpMessaging}
      />
    </div>
  );
}
