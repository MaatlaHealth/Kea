import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/app/app-shell";
import { EscalationPolicyForm } from "@/components/app/admin-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db";
import { facilities } from "@/db/schema";
import { can, primaryOrganisationId } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { resolvePolicy } from "@/lib/coordination/policies";
import { AuthorisationError } from "@/lib/errors";

export const metadata: Metadata = {
  title: "Escalation policy",
  robots: { index: false, follow: false },
};

export default async function PoliciesPage() {
  const ctx = await requireAuth();
  const organisationId = primaryOrganisationId(ctx);
  if (!organisationId) throw new AuthorisationError("No organisation is in scope for your account.");
  if (!can(ctx, "settings:manage", { organisationId })) {
    throw new AuthorisationError("Your role does not allow changing escalation policy.");
  }

  const facilityRows = await db
    .select({ id: facilities.id, name: facilities.name })
    .from(facilities)
    .where(eq(facilities.organisationId, organisationId))
    .orderBy(asc(facilities.name));

  const organisationPolicy = await resolvePolicy(organisationId, null);
  const facilityPolicies = await Promise.all(
    facilityRows.map(async (facility) => ({
      facility,
      policy: await resolvePolicy(organisationId, facility.id),
    })),
  );

  return (
    <>
      <PageHeader
        title="Escalation policy"
        description="Deadlines are configuration, not fixed in the software. A facility policy overrides the organisation default."
      />

      <Alert variant="warning" title="What escalation does and does not do" className="mb-6">
        <p>
          These thresholds decide when Kea raises a coordination task and notifies staff. They do
          not trigger a clinical response. Your service keeps its own emergency escalation route,
          and Kea must not be relied on for it.
        </p>
      </Alert>

      <Tabs defaultValue="organisation">
        <TabsList>
          <TabsTrigger value="organisation">Organisation default</TabsTrigger>
          {facilityRows.map((facility) => (
            <TabsTrigger key={facility.id} value={facility.id}>
              {facility.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="organisation">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Organisation default</CardTitle>
              <CardDescription>
                Applies to every facility that does not have its own policy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EscalationPolicyForm
                organisationId={organisationId}
                facilityId={null}
                values={organisationPolicy}
                source={organisationPolicy.source === "default" ? "built in default" : "organisation"}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {facilityPolicies.map(({ facility, policy }) => (
          <TabsContent key={facility.id} value={facility.id}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>{facility.name}</CardTitle>
                <CardDescription>
                  Saving here creates a facility policy that overrides the organisation default.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EscalationPolicyForm
                  organisationId={organisationId}
                  facilityId={facility.id}
                  values={policy}
                  source={
                    policy.source === "facility"
                      ? "facility"
                      : policy.source === "organisation"
                        ? "organisation default"
                        : "built in default"
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
