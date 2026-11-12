import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PortalSignIn } from "@/components/portal/sign-in";
import { getPatientSession } from "@/lib/auth/patient-session";

export const metadata: Metadata = {
  title: "Patient sign in",
  robots: { index: false, follow: false },
};

export default async function PortalSignInPage() {
  const patient = await getPatientSession();
  if (patient) redirect("/portal");
  return <PortalSignIn />;
}
