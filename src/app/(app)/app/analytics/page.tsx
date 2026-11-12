import type { Metadata } from "next";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/app/app-shell";
import { NoAccess } from "@/components/app/no-access";
import { CategoryBarChart, ReferralTrendChart } from "@/components/app/charts";
import { FilterBar } from "@/components/app/filter-bar";
import { MetricCard } from "@/components/app/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
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
import {
  SMALL_CELL_THRESHOLD,
  exceptionBreakdown,
  facilityBreakdown,
  headlineMetrics,
  pathwayBottlenecks,
  rangeFromDays,
  referralTrend,
} from "@/lib/analytics/queries";
import { STATUS_LABELS } from "@/lib/referrals/state-machine";
import type { ReferralStatus } from "@/db/schema";
import { formatDurationHours, formatPercent } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const RANGE_DAYS: Record<string, number> = { "30": 30, "90": 90, "180": 180, "365": 365 };

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAuth();
  if (!canAnywhere(ctx, "analytics:read")) {
    return (
      <NoAccess description="Analytics is available to programme analysts, coordinators and administrators. Your role does not include it." />
    );
  }

  const params = await searchParams;
  const rangeKey = typeof params.range === "string" && RANGE_DAYS[params.range] ? params.range : "90";
  const range = rangeFromDays(RANGE_DAYS[rangeKey]);

  const [headline, trend, byFacility, bottlenecks, exceptions] = await Promise.all([
    headlineMetrics(ctx, range),
    referralTrend(ctx, range),
    facilityBreakdown(ctx, range),
    pathwayBottlenecks(ctx),
    exceptionBreakdown(ctx, range),
  ]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Calculated from stored referral events. Every formula is documented beside the figure."
        actions={
          canAnywhere(ctx, "analytics:export") ? (
            <Button variant="outline" asChild>
              <a href={`/api/analytics/export?range=${rangeKey}`}>
                <Download />
                Download aggregate report
              </a>
            </Button>
          ) : null
        }
      />

      <FilterBar
        searchPlaceholder="Search is on the referrals page"
        filters={[
          {
            name: "range",
            label: "Period",
            options: [
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
              { value: "180", label: "Last 180 days" },
              { value: "365", label: "Last 365 days" },
            ],
            allValue: "90",
          },
        ]}
        className="mb-6"
      />

      {headline.suppressed ? (
        <Alert variant="info" title="Rates are suppressed for this period" className="mb-6">
          <p>
            Fewer than {SMALL_CELL_THRESHOLD} referrals were submitted, so percentages are withheld.
            A rate over a handful of cases can identify an individual. Counts are still shown.
          </p>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Referrals created" value={headline.created} />
        <MetricCard label="Submitted" value={headline.submitted} />
        <MetricCard label="Acknowledged" value={headline.acknowledged} />
        <MetricCard label="Appointments booked" value={headline.appointmentsBooked} />
        <MetricCard label="Care completed" value={headline.completed} />
        <MetricCard label="Pathways closed" value={headline.closed} tone="positive" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Completion rate"
          value={headline.completionRate === null ? "Suppressed" : formatPercent(headline.completionRate)}
          hint="Closed or follow-up completed, divided by submitted"
        />
        <MetricCard
          label="Acknowledgement rate"
          value={
            headline.acknowledgementRate === null
              ? "Suppressed"
              : formatPercent(headline.acknowledgementRate)
          }
          hint="Acknowledged divided by submitted"
        />
        <MetricCard
          label="Median acknowledgement"
          value={formatDurationHours(headline.medianAcknowledgementHours)}
          hint="Median time from submission to acknowledgement"
        />
        <MetricCard
          label="Missed appointment rate"
          value={
            headline.missedAppointmentRate === null
              ? "Suppressed"
              : formatPercent(headline.missedAppointmentRate)
          }
          hint="Missed divided by missed plus attended"
          tone={
            headline.missedAppointmentRate !== null && headline.missedAppointmentRate > 0.2
              ? "attention"
              : "neutral"
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Referral volume by week</CardTitle>
            <CardDescription>
              Referrals created, those that reached acknowledgement, and those that reached a
              closed outcome, grouped by the week they were created.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReferralTrendChart data={trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Where open referrals are sitting</CardTitle>
            <CardDescription>
              Current state of every open referral. The longest bars are where attention is needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBarChart
              data={bottlenecks.map((row) => ({
                label: STATUS_LABELS[row.status as ReferralStatus] ?? row.status,
                value: row.count,
              }))}
              valueLabel="Open referrals"
              emptyMessage="No open referrals."
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>By receiving facility</CardTitle>
            <CardDescription>
              Rows with fewer than {SMALL_CELL_THRESHOLD} submitted referrals show counts only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byFacility.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No referrals in this period.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Facility</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Acknowledged</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Median acknowledgement</TableHead>
                    <TableHead>Completion rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byFacility.map((row) => (
                    <TableRow key={row.facilityId}>
                      <TableCell className="font-medium">{row.facilityName}</TableCell>
                      <TableCell className="tabular-nums">{row.submitted}</TableCell>
                      <TableCell className="tabular-nums">{row.acknowledged}</TableCell>
                      <TableCell className="tabular-nums">{row.completed}</TableCell>
                      <TableCell className="text-xs">
                        {row.suppressed
                          ? "Suppressed"
                          : formatDurationHours(row.medianAcknowledgementHours)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.completionRate === null
                          ? "Suppressed"
                          : formatPercent(row.completionRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Exception events</CardTitle>
            <CardDescription>
              Transitions into an exception state during this period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBarChart
              data={exceptions.map((row) => ({
                label: STATUS_LABELS[row.status as ReferralStatus] ?? row.status,
                value: row.count,
              }))}
              valueLabel="Events"
              emptyMessage="No exception events in this period."
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle>How these figures are calculated</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              [
                "Completion rate",
                "Referrals whose current status is closed or follow-up completed, divided by referrals submitted in the period.",
              ],
              [
                "Acknowledgement rate",
                "Referrals with an acknowledgement timestamp, divided by referrals submitted in the period.",
              ],
              [
                "Median acknowledgement time",
                "The 50th percentile of hours between the submission timestamp and the acknowledgement timestamp, over referrals that have both.",
              ],
              [
                "Missed appointment rate",
                "Appointments recorded as missed, divided by appointments recorded as either missed or attended, scheduled within the period.",
              ],
              [
                "Follow-up completion",
                "Follow-up tasks resolved, divided by follow-up tasks created in the period.",
              ],
              [
                "Disclosure control",
                `Any rate whose denominator is below ${SMALL_CELL_THRESHOLD} is withheld and shown as suppressed.`,
              ],
            ].map(([term, detail]) => (
              <div key={term}>
                <dt className="font-medium text-foreground">{term}</dt>
                <dd className="mt-0.5 leading-relaxed text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            These figures describe how the referral service is operating. They are not clinical
            outcome measures, and they do not include any output from the experimental prediction
            service.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
