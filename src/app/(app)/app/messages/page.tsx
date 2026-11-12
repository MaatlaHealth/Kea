import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { MessageSquare } from "lucide-react";

import { PageHeader } from "@/components/app/app-shell";
import { NoAccess } from "@/components/app/no-access";
import { FilterBar, Pagination } from "@/components/app/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { messages, patients, referrals, messageStatusEnum, type MessageStatus } from "@/db/schema";
import { accessibleFacilityIds, canAnywhere } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { integrations } from "@/lib/env";
import { formatDateTime, humanise, maskPhone } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAuth();
  if (!canAnywhere(ctx, "message:read")) {
    return (
      <NoAccess description="Message history is part of the patient record, so it is available only to roles that can read patient records." />
    );
  }

  const params = await searchParams;
  const statusParam = typeof params.status === "string" ? params.status : undefined;
  const channelParam = typeof params.channel === "string" ? params.channel : undefined;
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);
  const pageSize = 25;

  const scopeIds = accessibleFacilityIds(ctx, "message:read");
  const status = integrations();

  // Messages are reachable through the referral they belong to, which is how
  // facility scope is applied. Messages with no referral are not listed here.
  const where = and(
    or(
      inArray(referrals.referringFacilityId, scopeIds),
      inArray(referrals.receivingFacilityId, scopeIds),
    ),
    statusParam && messageStatusEnum.enumValues.includes(statusParam as MessageStatus)
      ? eq(messages.status, statusParam as MessageStatus)
      : undefined,
    channelParam === "sms" || channelParam === "whatsapp"
      ? eq(messages.channel, channelParam)
      : undefined,
  );

  const [rows, totalRow] =
    scopeIds.length === 0
      ? [[], [{ value: 0 }]]
      : await Promise.all([
          db
            .select({
              id: messages.id,
              direction: messages.direction,
              channel: messages.channel,
              templateKey: messages.templateKey,
              status: messages.status,
              body: messages.body,
              toAddress: messages.toAddress,
              errorDetail: messages.errorDetail,
              attemptCount: messages.attemptCount,
              createdAt: messages.createdAt,
              referralId: messages.referralId,
              reference: referrals.reference,
              patientId: messages.patientId,
              patientName: sql<string>`${patients.firstName} || ' ' || ${patients.lastName}`,
            })
            .from(messages)
            .innerJoin(referrals, eq(referrals.id, messages.referralId))
            .innerJoin(patients, eq(patients.id, messages.patientId))
            .where(where)
            .orderBy(desc(messages.createdAt))
            .limit(pageSize)
            .offset((page - 1) * pageSize),
          db
            .select({ value: count() })
            .from(messages)
            .innerJoin(referrals, eq(referrals.id, messages.referralId))
            .where(where),
        ]);

  return (
    <>
      <PageHeader
        title="Messages"
        description="What was sent to patients, and whether the provider confirmed delivery."
      />

      {!status.sms.enabled && !status.whatsapp.enabled ? (
        <Alert variant="warning" title="Messaging is not configured" className="mb-6">
          <p>
            Messages are still created and queued so that nothing is lost, but none are being sent.
            Set the Twilio credentials and enable messaging to start delivery. A queued message is
            never reported as delivered.
          </p>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-4 sm:p-5">
          <FilterBar
            searchPlaceholder="Search is on the referrals page"
            filters={[
              {
                name: "status",
                label: "Delivery status",
                options: [
                  { value: "all", label: "Any status" },
                  ...messageStatusEnum.enumValues.map((value) => ({
                    value,
                    label: humanise(value),
                  })),
                ],
              },
              {
                name: "channel",
                label: "Channel",
                options: [
                  { value: "all", label: "Any channel" },
                  { value: "sms", label: "SMS" },
                  { value: "whatsapp", label: "WhatsApp" },
                ],
              },
            ]}
            className="mb-4"
          />

          {rows.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No messages yet"
              description="Messages are created when a referral is submitted or an appointment is booked."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sent</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/app/patients/${row.patientId}`}
                          className="text-sm text-foreground hover:text-plum-700"
                        >
                          {row.patientName}
                        </Link>
                        <Link
                          href={`/app/referrals/${row.referralId}`}
                          className="block font-mono text-xs text-plum-700 hover:text-plum-900"
                        >
                          {row.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <span className="block text-xs font-medium text-foreground">
                          {row.templateKey ? humanise(row.templateKey) : humanise(row.direction)}
                        </span>
                        <span className="block text-xs leading-relaxed text-muted-foreground">
                          {row.body}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="block">{maskPhone(row.toAddress)}</span>
                        <span className="block">{row.channel.toUpperCase()}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "delivered" || row.status === "read"
                              ? "positive"
                              : row.status === "failed" || row.status === "undeliverable"
                                ? "critical"
                                : row.status === "queued"
                                  ? "neutral"
                                  : "progress"
                          }
                        >
                          {humanise(row.status)}
                        </Badge>
                        {row.errorDetail ? (
                          <span className="mt-0.5 block max-w-[14rem] text-xs text-destructive">
                            {row.errorDetail}
                          </span>
                        ) : null}
                        {row.attemptCount > 1 ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {row.attemptCount} attempts
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} pageSize={pageSize} total={totalRow[0]?.value ?? 0} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
