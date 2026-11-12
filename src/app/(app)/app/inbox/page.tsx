import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";

import { PageHeader } from "@/components/app/app-shell";
import { NoAccess } from "@/components/app/no-access";
import { FilterBar, Pagination } from "@/components/app/filter-bar";
import { PriorityBadge, ReferralStatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReferralStatus } from "@/db/schema";
import { canAnywhere } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { listReferrals } from "@/lib/referrals/queries";
import { formatDate, formatRelative } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Incoming referrals",
  robots: { index: false, follow: false },
};

const QUEUE_PRESETS: Record<string, { label: string; statuses: ReferralStatus[] }> = {
  awaiting: {
    label: "Awaiting acknowledgement",
    statuses: ["submitted", "received"],
  },
  to_schedule: { label: "Acknowledged, needs a date", statuses: ["acknowledged"] },
  booked: { label: "Appointment booked", statuses: ["appointment_scheduled"] },
  attended: { label: "Attended, outcome outstanding", statuses: ["patient_attended"] },
  all_open: {
    label: "All open",
    statuses: [
      "submitted",
      "received",
      "acknowledged",
      "appointment_scheduled",
      "patient_attended",
      "missed_appointment",
      "escalated",
    ],
  },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAuth();
  if (!canAnywhere(ctx, "referral:read")) {
    return (
      <NoAccess description="The incoming referral queue is available to clinical and coordination roles. Your role does not include it." />
    );
  }

  const params = await searchParams;
  const queueKey = typeof params.queue === "string" ? params.queue : "awaiting";
  const queue = QUEUE_PRESETS[queueKey] ?? QUEUE_PRESETS.awaiting;
  const page = Number(typeof params.page === "string" ? params.page : "1");

  const result = await listReferrals(ctx, {
    direction: "incoming",
    statuses: queue.statuses,
    search: typeof params.q === "string" ? params.q : null,
    sort: "oldest",
    page: Number.isFinite(page) ? page : 1,
    pageSize: 25,
  });

  return (
    <>
      <PageHeader
        title="Incoming referrals"
        description="Referrals sent to the facilities you work in, oldest first."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{queue.label}</CardTitle>
          <CardDescription>
            Acknowledging a referral accepts responsibility for arranging the visit and stops the
            acknowledgement clock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FilterBar
            searchPlaceholder="Search by reference, name or record number"
            filters={[
              {
                name: "queue",
                label: "Queue",
                options: Object.entries(QUEUE_PRESETS).map(([value, preset]) => ({
                  value,
                  label: preset.label,
                })),
                allValue: "awaiting",
              },
            ]}
            className="mb-4"
          />

          {result.rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="This queue is empty"
              description="Nothing is waiting on your facility in this queue."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Waiting</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`/app/referrals/${row.id}`}
                          className="font-mono text-xs font-medium text-plum-700 hover:text-plum-900"
                        >
                          {row.reference}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="block text-sm font-medium text-foreground">
                          {row.patientName}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {row.patientRecordNumber}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.referringFacilityName}
                      </TableCell>
                      <TableCell className="max-w-[16rem] text-xs text-muted-foreground">
                        {row.reasonCategory}
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={row.priority} />
                      </TableCell>
                      <TableCell>
                        <ReferralStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        <span className="block">
                          {formatDate(row.submittedAt ?? row.createdAt)}
                        </span>
                        <span className="block">
                          {formatRelative(row.submittedAt ?? row.createdAt)}
                        </span>
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
