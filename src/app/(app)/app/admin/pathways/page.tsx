import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/app/app-shell";
import { NoAccess } from "@/components/app/no-access";
import { PathwayToggle } from "@/components/app/admin-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { db } from "@/db";
import { facilities, referralPathways } from "@/db/schema";
import { can, primaryOrganisationId } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { AuthorisationError } from "@/lib/errors";
import { FACILITY_TYPE_LABELS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Referral pathways",
  robots: { index: false, follow: false },
};

export default async function PathwaysPage() {
  const ctx = await requireAuth();
  const organisationId = primaryOrganisationId(ctx);
  if (!organisationId) throw new AuthorisationError("No organisation is in scope for your account.");

  if (!can(ctx, "organisation:manage", { organisationId })) {
    return (
      <NoAccess
        description="Referral pathways decide which facility may refer to which, so only an organisation administrator can change them."
        backHref="/app/admin"
        backLabel="Back to administration"
      />
    );
  }

  const [rows, pathways] = await Promise.all([
    db
      .select()
      .from(facilities)
      .where(eq(facilities.organisationId, organisationId))
      .orderBy(asc(facilities.name)),
    db
      .select({
        referringFacilityId: referralPathways.referringFacilityId,
        receivingFacilityId: referralPathways.receivingFacilityId,
      })
      .from(referralPathways)
      .where(eq(referralPathways.organisationId, organisationId)),
  ]);

  const active = new Set(
    pathways.map((pathway) => `${pathway.referringFacilityId}:${pathway.receivingFacilityId}`),
  );

  const referring = rows.filter((facility) =>
    ["primary_health_clinic", "community_health_centre", "district_hospital"].includes(
      facility.type,
    ),
  );
  const sources = referring.length > 0 ? referring : rows;

  return (
    <>
      <PageHeader
        title="Referral pathways"
        description="Which facility may refer to which. A referral can only be created along an allowed pathway."
      />

      <Alert variant="info" title="Why pathways are explicit" className="mb-6">
        <p>
          Restricting the destinations a clinic can choose keeps referrals inside agreed service
          arrangements, and it keeps the receiving facility list short enough to pick from quickly
          on a slow connection.
        </p>
      </Alert>

      {rows.length < 2 ? (
        <EmptyState
          title="Add at least two facilities first"
          description="A pathway connects one referring facility to one receiving facility."
        />
      ) : (
        <div className="space-y-5">
          {sources.map((source) => (
            <Card key={source.id}>
              <CardHeader className="pb-3">
                <CardTitle>{source.name} can refer to</CardTitle>
                <CardDescription>{FACILITY_TYPE_LABELS[source.type]}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {rows
                    .filter((target) => target.id !== source.id)
                    .map((target) => (
                      <li
                        key={target.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {target.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {FACILITY_TYPE_LABELS[target.type]}
                          </span>
                        </span>
                        <PathwayToggle
                          referringFacilityId={source.id}
                          receivingFacilityId={target.id}
                          active={active.has(`${source.id}:${target.id}`)}
                        />
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
