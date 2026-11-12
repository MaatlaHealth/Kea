import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CheckCircle2, HelpCircle } from "lucide-react";

import { PageHeader } from "@/components/app/app-shell";
import { FilterBar, Pagination } from "@/components/app/filter-bar";
import { AppointmentStatusBadge } from "@/components/app/status-badge";
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
import type { AppointmentStatus } from "@/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { listAppointments, type AppointmentRange } from "@/lib/appointments/queries";
import { formatDate, formatTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Appointments",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const RANGES: AppointmentRange[] = ["today", "week", "month", "past"];
const STATUSES: AppointmentStatus[] = [
  "scheduled",
  "rescheduled",
  "attended",
  "missed",
  "cancelled",
];

export default async function AppointmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAuth();
  const params = await searchParams;

  const rangeParam = typeof params.range === "string" ? params.range : "week";
  const range = (RANGES.includes(rangeParam as AppointmentRange) ? rangeParam : "week") as AppointmentRange;
  const statusParam = typeof params.status === "string" ? params.status : undefined;
  const page = Number(typeof params.page === "string" ? params.page : "1");

  const result = await listAppointments(ctx, {
    range,
    statuses:
      statusParam && STATUSES.includes(statusParam as AppointmentStatus)
        ? [statusParam as AppointmentStatus]
        : undefined,
    page: Number.isFinite(page) ? page : 1,
    pageSize: 25,
  });

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Visits booked at the facilities you work in. Attendance is recorded from the referral."
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <FilterBar
            searchPlaceholder="Search is on the referrals page"
            filters={[
              {
                name: "range",
                label: "Period",
                options: [
                  { value: "today", label: "Today" },
                  { value: "week", label: "Next 7 days" },
                  { value: "month", label: "Next 30 days" },
                  { value: "past", label: "Last 60 days" },
                ],
                allValue: "week",
              },
              {
                name: "status",
                label: "Status",
                options: [
                  { value: "all", label: "Any status" },
                  { value: "scheduled", label: "Scheduled" },
                  { value: "rescheduled", label: "Rescheduled" },
                  { value: "attended", label: "Attended" },
                  { value: "missed", label: "Missed" },
                  { value: "cancelled", label: "Cancelled" },
                ],
              },
            ]}
            className="mb-4"
          />

          {result.rows.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No appointments in this period"
              description="Appointments are created when a receiving facility books a visit on a referral."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Referral</TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead>Patient response</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="block text-sm font-medium text-foreground">
                          {formatDate(row.scheduledFor)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatTime(row.scheduledFor)} &middot; {row.durationMinutes} min
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/app/patients/${row.patientId}`}
                          className="text-sm font-medium text-foreground hover:text-plum-700"
                        >
                          {row.patientName}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {row.patientRecordNumber}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/app/referrals/${row.referralId}`}
                          className="font-mono text-xs text-plum-700 hover:text-plum-900"
                        >
                          {row.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.facilityName}
                        {row.locationNote ? (
                          <span className="block">{row.locationNote}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.patientConfirmedAt ? (
                          <span className="inline-flex items-center gap-1 text-teal-700">
                            <CheckCircle2 className="size-3.5" />
                            Confirmed
                          </span>
                        ) : row.patientAssistanceRequestedAt ? (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <HelpCircle className="size-3.5" />
                            Asked for help
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No response</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <AppointmentStatusBadge status={row.status} />
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
