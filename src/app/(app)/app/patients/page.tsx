import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";

import { PageHeader } from "@/components/app/app-shell";
import { NoAccess } from "@/components/app/no-access";
import { FilterBar, Pagination } from "@/components/app/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canAnywhere } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { listPatients } from "@/lib/patients/queries";
import { formatDate, humanise, maskPhone } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Patients",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PatientsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAuth();
  if (!canAnywhere(ctx, "patient:read")) {
    return (
      <NoAccess description="Patient records are available to clinical and coordination roles. Your role does not include them." />
    );
  }

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : null;
  const page = Number(typeof params.page === "string" ? params.page : "1");

  const result = await listPatients(ctx, {
    search: q,
    page: Number.isFinite(page) ? page : 1,
    pageSize: 25,
  });

  return (
    <>
      <PageHeader
        title="Patients"
        description="Patients registered at the facilities you work in. Patients linked only by a referral are reachable from that referral."
        actions={
          canAnywhere(ctx, "patient:create") ? (
            <Button asChild>
              <Link href="/app/patients/new">
                <Plus />
                Register patient
              </Link>
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <FilterBar
            searchPlaceholder="Search by name, record number or phone"
            className="mb-4"
          />

          {result.rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title={q ? "No patients match that search" : "No patients registered yet"}
              description={
                q
                  ? "Check the spelling, or search by record number."
                  : "Register the first patient at your facility to begin."
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Record number</TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Open referrals</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((patient) => (
                    <TableRow key={patient.id}>
                      <TableCell>
                        <Link
                          href={`/app/patients/${patient.id}`}
                          className="font-medium text-foreground hover:text-plum-700"
                        >
                          {patient.firstName} {patient.lastName}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {patient.dateOfBirth
                            ? `Born ${formatDate(patient.dateOfBirth)}`
                            : "Date of birth not recorded"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{patient.recordNumber}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {patient.facilityName}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="block">{maskPhone(patient.phone)}</span>
                        <span className="block text-muted-foreground">
                          {humanise(patient.preferredChannel)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {patient.estimatedDueDate ? formatDate(patient.estimatedDueDate) : "Not set"}
                      </TableCell>
                      <TableCell>
                        {patient.openReferrals > 0 ? (
                          <Badge variant="progress">{patient.openReferrals}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
