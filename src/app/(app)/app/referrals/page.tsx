import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, Plus } from "lucide-react";

import { PageHeader } from "@/components/app/app-shell";
import { NoAccess } from "@/components/app/no-access";
import { FilterBar, Pagination } from "@/components/app/filter-bar";
import { PriorityBadge, ReferralStatusBadge } from "@/components/app/status-badge";
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
import { referralPriorityEnum, referralStatusEnum, type ReferralPriority, type ReferralStatus } from "@/db/schema";
import { canAnywhere } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { listReferrals, type ReferralDirection } from "@/lib/referrals/queries";
import { STATUS_LABELS } from "@/lib/referrals/state-machine";
import { formatDate, formatRelative } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Referrals",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReferralsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAuth();
  if (!canAnywhere(ctx, "referral:read")) {
    return (
      <NoAccess description="Referrals are available to clinical and coordination roles. Your role does not include them." />
    );
  }

  const params = await searchParams;

  const status = single(params.status);
  const priority = single(params.priority);
  const direction = (single(params.direction) ?? "all") as ReferralDirection;
  const sort = single(params.sort) as "newest" | "oldest" | "priority" | "status" | undefined;
  const page = Number(single(params.page) ?? "1");

  const result = await listReferrals(ctx, {
    direction: ["all", "incoming", "outgoing"].includes(direction) ? direction : "all",
    statuses:
      status && referralStatusEnum.enumValues.includes(status as ReferralStatus)
        ? [status as ReferralStatus]
        : undefined,
    priorities:
      priority && referralPriorityEnum.enumValues.includes(priority as ReferralPriority)
        ? [priority as ReferralPriority]
        : undefined,
    search: single(params.q) ?? null,
    sort: sort ?? "newest",
    page: Number.isFinite(page) ? page : 1,
    pageSize: 25,
  });

  return (
    <>
      <PageHeader
        title="Referrals"
        description="Every referral linked to a facility you work in."
        actions={
          canAnywhere(ctx, "referral:create") ? (
            <Button asChild>
              <Link href="/app/referrals/new">
                <Plus />
                New referral
              </Link>
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <FilterBar
            searchPlaceholder="Search by reference, name or record number"
            filters={[
              {
                name: "direction",
                label: "Direction",
                options: [
                  { value: "all", label: "All referrals" },
                  { value: "outgoing", label: "Sent by my facility" },
                  { value: "incoming", label: "Received by my facility" },
                ],
              },
              {
                name: "status",
                label: "Status",
                options: [
                  { value: "all", label: "Any status" },
                  ...referralStatusEnum.enumValues.map((value) => ({
                    value,
                    label: STATUS_LABELS[value],
                  })),
                ],
              },
              {
                name: "priority",
                label: "Priority",
                options: [
                  { value: "all", label: "Any priority" },
                  { value: "emergency", label: "Emergency" },
                  { value: "urgent", label: "Urgent" },
                  { value: "routine", label: "Routine" },
                ],
              },
              {
                name: "sort",
                label: "Sort",
                options: [
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                  { value: "priority", label: "Priority first" },
                  { value: "status", label: "By status" },
                ],
                allValue: "newest",
              },
            ]}
            className="mb-4"
          />

          {result.rows.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title="No referrals match these filters"
              description="Try clearing the filters, or create a referral if this patient needs one."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Pathway</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Created</TableHead>
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
                        <span className="block font-medium text-foreground">{row.patientName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {row.patientRecordNumber}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="block">{row.referringFacilityName}</span>
                        <span className="block">to {row.receivingFacilityName}</span>
                      </TableCell>
                      <TableCell>
                        <ReferralStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={row.priority} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        <span className="block">{formatDate(row.createdAt)}</span>
                        <span className="block">{formatRelative(row.createdAt)}</span>
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
