import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Kea. For authorised healthcare staff only.",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const ctx = await getAuthContext();
  if (ctx) redirect("/app");

  const params = await searchParams;
  const redirectTo =
    params.redirectTo && params.redirectTo.startsWith("/") && !params.redirectTo.startsWith("//")
      ? params.redirectTo
      : undefined;

  return (
    <Card className="shadow-raised">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Sign in to Kea</CardTitle>
        <CardDescription>
          Accounts are issued by your organisation administrator. Access to patient records is
          logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SignInForm redirectTo={redirectTo} />
        <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
          Are you a patient?{" "}
          <Link href="/portal/sign-in" className="font-medium text-plum-700 hover:text-plum-900">
            Go to the patient portal
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
