import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { UserSearch } from "lucide-react";

import { BackLink, PageHeader } from "@/components/app/app-shell";
import { FilterBar } from "@/components/app/filter-bar";
import { ReferralForm } from "@/components/app/referral-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { db } from "@/db";
import { pregnancyEpisodes } from "@/db/schema";
import { isAiEnabled } from "@/lib/ai/gemini";
import { requirePatientAccess } from "@/lib/access";
import { assertCan } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { departmentsForFacilities, pathwayTargets } from "@/lib/facilities/queries";
import { listPatients } from "@/lib/patients/queries";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "New referral",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ patientId?: string; q?: string }>;

export default async function NewReferralPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAuth();
  const params = await searchParams;

  if (!params.patientId) {
    const patients = await listPatients(ctx, { search: params.q ?? null, pageSize: 10 });

    return (
      <>
        <PageHeader
          breadcrumb={<BackLink href="/app/referrals">All referrals</BackLink>}
          title="New referral"
          description="Choose the patient this referral is for."
        />
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Find the patient</CardTitle>
            <CardDescription>
              Search by name, record number or phone number. If the patient is not registered yet,
              register them first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FilterBar searchPlaceholder="Search patients" />
            {patients.rows.length === 0 ? (
              <EmptyState
                icon={UserSearch}
                title="No patients found"
                description="Register the patient before creating a referral."
                action={
                  <Link
                    href="/app/patients/new"
                    className="text-sm font-medium text-plum-700 hover:text-plum-900"
                  >
                    Register a patient
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {patients.rows.map((patient) => (
                  <li key={patient.id}>
                    <Link
                      href={`/app/referrals/new?patientId=${patient.id}`}
                      className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {patient.firstName} {patient.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {patient.recordNumber} &middot; {patient.facilityName}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {patient.estimatedDueDate
                          ? `Due ${formatDate(patient.estimatedDueDate)}`
                          : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  const { patient } = await requirePatientAccess(ctx, params.patientId);
  assertCan(ctx, "referral:create", { facilityId: patient.homeFacilityId });

  const [targets, episode] = await Promise.all([
    pathwayTargets(patient.homeFacilityId),
    db
      .select({ id: pregnancyEpisodes.id, estimatedDueDate: pregnancyEpisodes.estimatedDueDate })
      .from(pregnancyEpisodes)
      .where(
        and(eq(pregnancyEpisodes.patientId, patient.id), eq(pregnancyEpisodes.isActive, true)),
      )
      .orderBy(desc(pregnancyEpisodes.createdAt))
      .limit(1),
  ]);

  const departments = await departmentsForFacilities(targets.map((target) => target.id));

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href={`/app/patients/${patient.id}`}>Back to patient</BackLink>}
        title="New referral"
        description={`For ${patient.firstName} ${patient.lastName} (${patient.recordNumber})`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardContent className="p-6">
            <ReferralForm
              patientId={patient.id}
              pregnancyEpisodeId={episode[0]?.id ?? null}
              facilities={targets.map((target) => ({
                id: target.id,
                name: target.name,
                type: target.type,
                district: target.district,
              }))}
              departments={departments}
              aiEnabled={isAiEnabled()}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Patient</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium text-foreground">
                {patient.firstName} {patient.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{patient.recordNumber}</p>
              {episode[0]?.estimatedDueDate ? (
                <p className="text-xs text-muted-foreground">
                  Estimated due date {formatDate(episode[0].estimatedDueDate)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No active pregnancy episode.</p>
              )}
            </CardContent>
          </Card>

          <Alert variant="info" title="What the patient will receive">
            <p>
              A short message naming the receiving facility and the referral reference. No
              diagnosis, reason or clinical detail is ever sent.
            </p>
          </Alert>
        </div>
      </div>
    </>
  );
}
