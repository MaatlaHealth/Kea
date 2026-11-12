import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/app/app-shell";
import { AddDepartmentForm, CreateFacilityDialog } from "@/components/app/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { db } from "@/db";
import { departments, facilities } from "@/db/schema";
import { can, primaryOrganisationId } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { AuthorisationError } from "@/lib/errors";
import { FACILITY_TYPE_LABELS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Facilities",
  robots: { index: false, follow: false },
};

export default async function FacilitiesPage() {
  const ctx = await requireAuth();
  const organisationId = primaryOrganisationId(ctx);
  if (!organisationId) throw new AuthorisationError("No organisation is in scope for your account.");

  const rows = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organisationId, organisationId))
    .orderBy(asc(facilities.name));

  const allDepartments = await db
    .select({
      id: departments.id,
      facilityId: departments.facilityId,
      name: departments.name,
      serviceType: departments.serviceType,
    })
    .from(departments)
    .orderBy(asc(departments.name));

  const byFacility = new Map<string, typeof allDepartments>();
  for (const department of allDepartments) {
    const list = byFacility.get(department.facilityId) ?? [];
    list.push(department);
    byFacility.set(department.facilityId, list);
  }

  const canManageOrganisation = can(ctx, "organisation:manage", { organisationId });

  return (
    <>
      <PageHeader
        title="Facilities"
        description="The clinics, hospitals and units in your organisation, and the departments that accept referrals."
        actions={canManageOrganisation ? <CreateFacilityDialog organisationId={organisationId} /> : null}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No facilities yet"
          description="Add the clinics and hospitals that take part in your referral pathways."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {rows.map((facility) => (
            <Card key={facility.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle>{facility.name}</CardTitle>
                    <CardDescription>
                      {FACILITY_TYPE_LABELS[facility.type]}
                      {facility.district ? ` · ${facility.district}` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">{facility.code}</Badge>
                    {!facility.isActive ? <Badge variant="warning">Inactive</Badge> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Address</dt>
                    <dd className="text-foreground">{facility.addressLine ?? "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="text-foreground">{facility.phone ?? "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Province</dt>
                    <dd className="text-foreground">{facility.province ?? "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Coordinates</dt>
                    <dd className="text-foreground">
                      {facility.latitude && facility.longitude
                        ? `${Number(facility.latitude).toFixed(4)}, ${Number(facility.longitude).toFixed(4)}`
                        : "Not recorded"}
                    </dd>
                  </div>
                </dl>

                <div className="border-t border-border pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Departments
                  </p>
                  {(byFacility.get(facility.id) ?? []).length === 0 ? (
                    <p className="mb-3 text-xs text-muted-foreground">
                      No departments recorded. Referrals can still be sent to the facility.
                    </p>
                  ) : (
                    <ul className="mb-3 flex flex-wrap gap-2">
                      {(byFacility.get(facility.id) ?? []).map((department) => (
                        <li key={department.id}>
                          <Badge variant="progress">{department.name}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {can(ctx, "facility:manage", { facilityId: facility.id }) ? (
                    <AddDepartmentForm facilityId={facility.id} />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
