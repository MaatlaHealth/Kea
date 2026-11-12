import type { Metadata } from "next";
import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { Building2, ClipboardList, Route, ShieldCheck, Users } from "lucide-react";

import { PageHeader } from "@/components/app/app-shell";
import { MetricCard } from "@/components/app/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { db } from "@/db";
import { facilities, memberships, organisations, referralPathways } from "@/db/schema";
import { primaryOrganisationId } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { integrations } from "@/lib/env";
import { AuthorisationError } from "@/lib/errors";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

export default async function AdminOverviewPage() {
  const ctx = await requireAuth();
  const organisationId = primaryOrganisationId(ctx);
  if (!organisationId) throw new AuthorisationError("No organisation is in scope for your account.");

  const [organisation] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, organisationId))
    .limit(1);

  const [facilityCount, staffCount, pathwayCount] = await Promise.all([
    db.select({ value: count() }).from(facilities).where(eq(facilities.organisationId, organisationId)),
    db
      .selectDistinct({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.organisationId, organisationId)),
    db
      .select({ value: count() })
      .from(referralPathways)
      .where(eq(referralPathways.organisationId, organisationId)),
  ]);

  const status = integrations();

  return (
    <>
      <PageHeader
        title={organisation?.name ?? "Organisation"}
        description="Facilities, staff, referral pathways and the policies that drive escalation."
      />

      {organisation?.environment === "demonstration" ? (
        <Alert variant="warning" title="Demonstration organisation" className="mb-6">
          <p>
            Every patient record in this organisation is synthetic and is labelled as fictional in
            the interface. Do not enter real patient information here.
          </p>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Facilities"
          value={facilityCount[0]?.value ?? 0}
          icon={Building2}
          href="/app/admin/facilities"
        />
        <MetricCard
          label="Staff with a role"
          value={staffCount.length}
          icon={Users}
          href="/app/admin/staff"
        />
        <MetricCard
          label="Referral pathways"
          value={pathwayCount[0]?.value ?? 0}
          icon={Route}
          href="/app/admin/pathways"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              Integration status
            </CardTitle>
            <CardDescription>
              What is configured in this deployment. Nothing is simulated: an integration that is
              off does nothing at all.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {[
                { label: "SMS", value: status.sms },
                { label: "WhatsApp", value: status.whatsapp },
                { label: "Assisted drafting", value: status.ai },
                { label: "Prediction service", value: status.prediction },
                { label: "Operational email", value: status.email },
              ].map((row) => (
                <li key={row.label} className="flex items-start justify-between gap-4 py-2.5">
                  <span className="font-medium text-foreground">{row.label}</span>
                  <span className="text-right">
                    <span
                      className={
                        row.value.enabled
                          ? "text-teal-700"
                          : row.value.configured
                            ? "text-amber-700"
                            : "text-muted-foreground"
                      }
                    >
                      {row.value.enabled
                        ? "Enabled"
                        : row.value.configured
                          ? "Configured but switched off"
                          : "Not configured"}
                    </span>
                    {row.value.missing.length > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        Missing: {row.value.missing.join(", ")}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4" />
              Set up checklist
            </CardTitle>
            <CardDescription>What a new organisation needs before staff can work.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {[
                {
                  label: "Add your facilities",
                  href: "/app/admin/facilities",
                  done: (facilityCount[0]?.value ?? 0) > 1,
                  detail: "At least one referring clinic and one receiving hospital.",
                },
                {
                  label: "Configure referral pathways",
                  href: "/app/admin/pathways",
                  done: (pathwayCount[0]?.value ?? 0) > 0,
                  detail: "Which clinic may refer to which hospital.",
                },
                {
                  label: "Invite your staff",
                  href: "/app/admin/staff",
                  done: staffCount.length > 1,
                  detail: "Nurses, receiving clinicians and coordinators.",
                },
                {
                  label: "Agree the escalation policy",
                  href: "/app/admin/policies",
                  done: false,
                  detail: "Acknowledgement deadlines and contact attempt thresholds.",
                },
              ].map((item, index) => (
                <li key={item.label} className="flex gap-3">
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      item.done ? "bg-teal-100 text-teal-800" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span>
                    <Link href={item.href} className="font-medium text-plum-700 hover:text-plum-900">
                      {item.label}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
