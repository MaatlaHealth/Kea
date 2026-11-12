import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";

import { AcceptInvitationForm } from "@/components/auth/password-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { db } from "@/db";
import { facilities, invitations, organisations } from "@/db/schema";
import { hashToken } from "@/lib/auth/tokens";
import { ROLE_LABELS } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Accept your invitation",
  robots: { index: false, follow: false },
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Alert variant="destructive" title="Missing invitation link">
        <p>Open the link from your invitation email to set up your account.</p>
      </Alert>
    );
  }

  const [invitation] = await db
    .select({
      email: invitations.email,
      fullName: invitations.fullName,
      role: invitations.role,
      organisationName: organisations.name,
      facilityName: facilities.name,
    })
    .from(invitations)
    .innerJoin(organisations, eq(organisations.id, invitations.organisationId))
    .leftJoin(facilities, eq(facilities.id, invitations.facilityId))
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invitation) {
    return (
      <Alert variant="destructive" title="This invitation is no longer valid">
        <p>
          It may have expired or already been used. Ask your administrator to send a new
          invitation, or{" "}
          <Link href="/sign-in" className="font-medium underline underline-offset-4">
            sign in
          </Link>{" "}
          if your account already exists.
        </p>
      </Alert>
    );
  }

  return (
    <Card className="shadow-raised">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Set up your Kea account</CardTitle>
        <CardDescription>
          Check the details below are correct, then choose a password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInvitationForm
          token={token}
          email={invitation.email}
          fullName={invitation.fullName}
          organisationName={invitation.organisationName}
          roleLabel={ROLE_LABELS[invitation.role]}
          facilityName={invitation.facilityName}
        />
      </CardContent>
    </Card>
  );
}
