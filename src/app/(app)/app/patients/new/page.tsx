import type { Metadata } from "next";

import { BackLink, PageHeader } from "@/components/app/app-shell";
import { PatientForm } from "@/components/app/patient-form";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { accessibleFacilityIds } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { facilitiesForUser } from "@/lib/facilities/queries";

export const metadata: Metadata = {
  title: "Register patient",
  robots: { index: false, follow: false },
};

export default async function NewPatientPage() {
  const ctx = await requireAuth();
  const facilities = await facilitiesForUser(ctx, "patient:create");

  if (accessibleFacilityIds(ctx, "patient:create").length === 0) {
    return (
      <>
        <PageHeader title="Register patient" />
        <Alert variant="warning" title="You cannot register patients">
          <p>
            Your role does not allow patient registration at any facility. Ask an administrator if
            you believe this is wrong.
          </p>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href="/app/patients">All patients</BackLink>}
        title="Register patient"
        description="Collect only what is needed to coordinate care. Fields marked with an asterisk are required."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardContent className="p-6">
            <PatientForm
              facilities={facilities.map((facility) => ({
                id: facility.id,
                name: facility.name,
                district: facility.district,
              }))}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Alert variant="info" title="What Kea does not collect">
            <p>
              There is no field for a national identity number, race, income or immigration status.
              None of these are needed to coordinate a referral.
            </p>
          </Alert>
          <Alert variant="default" title="Duplicate checking">
            <p>
              Before the record is created, Kea looks for an existing patient with the same phone
              number, or the same surname and date of birth. You decide whether it is the same
              person.
            </p>
          </Alert>
        </div>
      </div>
    </>
  );
}
