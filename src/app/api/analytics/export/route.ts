import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { canAnywhere } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { aggregateExportRows, rangeFromDays } from "@/lib/analytics/queries";
import { AuthorisationError, isAppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const RANGE_DAYS: Record<string, number> = { "30": 30, "90": 90, "180": 180, "365": 365 };

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Aggregate report download.
 *
 * The export contains counts and rates only. It contains no patient
 * identifier, no name and no referral reference, and it applies the same small
 * cell suppression as the screen.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!canAnywhere(ctx, "analytics:export")) {
      throw new AuthorisationError("Your role does not allow report downloads.");
    }

    const url = new URL(request.url);
    const key = url.searchParams.get("range") ?? "90";
    const range = rangeFromDays(RANGE_DAYS[key] ?? 90);

    const rows = await aggregateExportRows(ctx, range);
    const csv = [
      "section,label,value",
      ...rows.map((row) => [row.section, row.label, row.value].map(csvEscape).join(",")),
    ].join("\n");

    await recordAudit({
      actorUserId: ctx.userId,
      action: "analytics.export",
      resourceType: "analytics",
      metadata: { scope: key, count: rows.length },
    });

    const filename = `kea-aggregate-report-${range.to.toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[kea] analytics export failed", error);
    return NextResponse.json({ error: "The report could not be generated." }, { status: 500 });
  }
}
