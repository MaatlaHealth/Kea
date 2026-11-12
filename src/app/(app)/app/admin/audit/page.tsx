import type { Metadata } from "next";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { ScrollText } from "lucide-react";

import { PageHeader } from "@/components/app/app-shell";
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
import { auditEvents, users } from "@/db/schema";
import { can, primaryOrganisationId } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { AuthorisationError } from "@/lib/errors";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Audit log",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAuth();
  const organisationId = primaryOrganisationId(ctx);
  if (!organisationId) throw new AuthorisationError("No organisation is in scope for your account.");
  if (!can(ctx, "audit:read", { organisationId })) {
    throw new AuthorisationError("Your role does not allow reading the audit log.");
  }

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);
  const pageSize = 50;

  const pattern = `%${q.replace(/[%_]/g, (match) => `\\${match}`)}%`;
  const where = and(
    eq(auditEvents.organisationId, organisationId),
    q
      ? or(
          ilike(auditEvents.action, pattern),
          ilike(auditEvents.resourceType, pattern),
          ilike(auditEvents.resourceId, pattern),
        )
      : undefined,
  );

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        resourceType: auditEvents.resourceType,
        resourceId: auditEvents.resourceId,
        outcome: auditEvents.outcome,
        metadata: auditEvents.metadata,
        occurredAt: auditEvents.occurredAt,
        actorName: users.fullName,
        actorSystem: auditEvents.actorSystem,
        ipAddress: auditEvents.ipAddress,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(where)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(auditEvents).where(where),
  ]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who did what, to which record, and when."
      />

      <Alert variant="info" title="What the audit log contains" className="mb-6">
        <p>
          Audit entries record the action, the resource and the person. They deliberately exclude
          patient names, contact details, clinical content and message bodies, so this log can be
          read and exported for review without disclosing health information.
        </p>
      </Alert>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <FilterBar searchPlaceholder="Search by action or resource" className="mb-4" />

          {rows.length === 0 ? (
            <EmptyState icon={ScrollText} title="No audit entries match" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Context</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(row.occurredAt)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="block font-medium text-foreground">
                          {row.actorName ?? row.actorSystem ?? "System"}
                        </span>
                        {row.ipAddress ? (
                          <span className="block text-muted-foreground">{row.ipAddress}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{row.action}</span>
                        {row.outcome !== "success" ? (
                          <Badge variant="critical" className="ml-2">
                            {row.outcome}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="block">{row.resourceType}</span>
                        {row.resourceId ? (
                          <span className="block font-mono">{row.resourceId.slice(0, 8)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-sm text-xs text-muted-foreground">
                        {Object.entries(row.metadata ?? {})
                          .map(([key, value]) => `${key}: ${String(value)}`)
                          .join(", ")}
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
