import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { runAllJobs } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled job endpoint.
 *
 * Protected by a shared secret rather than a user session, because it is
 * called by a scheduler. When JOB_RUNNER_TOKEN is not set the endpoint refuses
 * every request rather than running unauthenticated.
 */
function authorised(request: Request): boolean {
  const expected = env().JOB_RUNNER_TOKEN;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const startedAt = Date.now();
  const results = await runAllJobs();

  await recordAudit({
    actorSystem: "job_runner",
    action: "jobs.run",
    resourceType: "system",
    metadata: {
      durationMs: Date.now() - startedAt,
      count: results.reduce((total, result) => total + result.processed, 0),
    },
  });

  return NextResponse.json({ ranAt: new Date().toISOString(), results });
}

/** GET is accepted so a scheduler that cannot send POST can still call it. */
export async function GET(request: Request) {
  return POST(request);
}
