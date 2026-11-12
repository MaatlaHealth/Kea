import { NextResponse } from "next/server";
import { sql as raw } from "drizzle-orm";

import { db } from "@/db";
import { integrations } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Health check.
 *
 * Reports whether the application can reach its database and which optional
 * integrations are configured. It deliberately exposes no counts, no
 * identifiers and no credential values.
 */
export async function GET() {
  const startedAt = Date.now();
  let database: "ok" | "unreachable" = "unreachable";

  try {
    await db.execute(raw`select 1`);
    database = "ok";
  } catch (error) {
    console.error("[kea] health check database failure", error);
  }

  let status: ReturnType<typeof integrations> | null = null;
  try {
    status = integrations();
  } catch {
    status = null;
  }

  const body = {
    status: database === "ok" ? "ok" : "degraded",
    database,
    latencyMs: Date.now() - startedAt,
    integrations: status
      ? {
          sms: status.sms.enabled ? "enabled" : status.sms.configured ? "configured" : "off",
          whatsapp: status.whatsapp.enabled
            ? "enabled"
            : status.whatsapp.configured
              ? "configured"
              : "off",
          ai: status.ai.enabled ? "enabled" : "off",
          prediction: status.prediction.enabled ? "enabled" : "off",
          email: status.email.configured ? "configured" : "off",
        }
      : "environment_invalid",
    time: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: database === "ok" ? 200 : 503 });
}
