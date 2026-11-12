import type { Metadata } from "next";
import { and, desc, eq, isNull } from "drizzle-orm";

import { PageHeader } from "@/components/app/app-shell";
import {
  ChangePasswordForm,
  MfaPanel,
  RevokeSessionsButton,
} from "@/components/app/account-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { facilities, memberships, organisations, sessions, users } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/session";
import { formatDateTime, formatRelative } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My account",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const ctx = await requireAuth();

  const [account] = await db
    .select({
      fullName: users.fullName,
      email: users.email,
      jobTitle: users.jobTitle,
      mfaEnabledAt: users.mfaEnabledAt,
      lastLoginAt: users.lastLoginAt,
      passwordChangedAt: users.passwordChangedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);

  const [roleRows, activeSessions] = await Promise.all([
    db
      .select({
        role: memberships.role,
        organisationName: organisations.name,
        facilityName: facilities.name,
      })
      .from(memberships)
      .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
      .leftJoin(facilities, eq(facilities.id, memberships.facilityId))
      .where(and(eq(memberships.userId, ctx.userId), eq(memberships.isActive, true))),
    db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, ctx.userId), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.lastSeenAt)),
  ]);

  return (
    <>
      <PageHeader
        title="My account"
        description="Your password, multifactor authentication and the devices signed in to Kea."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Password</CardTitle>
              <CardDescription>
                Changing your password signs out every other session on your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Multifactor authentication</CardTitle>
              <CardDescription>
                A time based code from an authenticator application, required at sign in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MfaPanel enabled={Boolean(account?.mfaEnabledAt)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Active sessions</CardTitle>
              <CardDescription>
                Every device currently signed in as you. If you do not recognise one, sign them all
                out and change your password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="divide-y divide-border">
                {activeSessions.map((session) => (
                  <li key={session.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {session.userAgent ?? "Unknown device"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.ipAddress ?? "Unknown address"} &middot; last active{" "}
                        {formatRelative(session.lastSeenAt)}
                      </p>
                    </div>
                    {session.id === ctx.sessionId ? (
                      <Badge variant="progress">This device</Badge>
                    ) : (
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        Expires {formatRelative(session.expiresAt)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {activeSessions.length > 1 ? <RevokeSessionsButton /> : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Your details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5 text-sm">
                <Row label="Name" value={account?.fullName ?? ctx.fullName} />
                <Row label="Email" value={account?.email ?? ctx.email} />
                <Row label="Job title" value={account?.jobTitle ?? "Not recorded"} />
                <Row
                  label="Last sign in"
                  value={account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Not recorded"}
                />
                <Row
                  label="Password changed"
                  value={
                    account?.passwordChangedAt
                      ? formatDateTime(account.passwordChangedAt)
                      : "Not recorded"
                  }
                />
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Your name and email are managed by your organisation administrator.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Your roles</CardTitle>
              <CardDescription>What you can do, and where.</CardDescription>
            </CardHeader>
            <CardContent>
              {roleRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You have no roles yet. An administrator needs to assign one.
                </p>
              ) : (
                <ul className="space-y-3">
                  {roleRows.map((row, index) => (
                    <li key={`${row.role}-${index}`}>
                      <Badge variant="neutral">{ROLE_LABELS[row.role]}</Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.facilityName ?? "Whole organisation"} &middot; {row.organisationName}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
