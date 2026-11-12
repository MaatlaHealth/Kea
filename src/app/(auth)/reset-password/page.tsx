import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/password-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Alert variant="destructive" title="Missing reset link">
        <p>
          This page needs the link from your reset email.{" "}
          <Link href="/forgot-password" className="font-medium underline underline-offset-4">
            Request a new link
          </Link>
          .
        </p>
      </Alert>
    );
  }

  return (
    <Card className="shadow-raised">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Set a new password</CardTitle>
        <CardDescription>
          Choosing a new password signs out every other session on your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm token={token} />
      </CardContent>
    </Card>
  );
}
