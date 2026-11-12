import { and, eq, lt, sql as raw } from "drizzle-orm";

import { db } from "@/db";
import { rateLimitCounters } from "@/db/schema";
import { RateLimitError } from "@/lib/errors";

/**
 * Fixed window rate limiting backed by PostgreSQL.
 *
 * The database is the shared state store already present in every deployment,
 * which keeps limits effective across serverless instances without adding a
 * cache dependency. Windows are coarse, which is appropriate for the abuse this
 * guards against: credential stuffing, enumeration and message flooding.
 */

export type RateLimitRule = {
  /** Maximum number of allowed actions inside one window. */
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  signIn: { limit: 8, windowSeconds: 600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  patientCodeRequest: { limit: 5, windowSeconds: 900 },
  patientCodeVerify: { limit: 8, windowSeconds: 900 },
  pilotEnquiry: { limit: 5, windowSeconds: 3600 },
  aiAssist: { limit: 40, windowSeconds: 3600 },
  messageSend: { limit: 120, windowSeconds: 3600 },
  search: { limit: 240, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

function windowStart(windowSeconds: number, now: Date): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Increments the counter for the given bucket and reports whether the action
 * is allowed. The increment happens atomically in one statement.
 */
export async function consumeRateLimit(
  name: RateLimitName,
  subject: string,
  now = new Date(),
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const start = windowStart(rule.windowSeconds, now);
  const bucketKey = `${name}:${subject}`.slice(0, 200);

  const [row] = await db
    .insert(rateLimitCounters)
    .values({ bucketKey, windowStart: start, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitCounters.bucketKey, rateLimitCounters.windowStart],
      set: { count: raw`${rateLimitCounters.count} + 1` },
    })
    .returning({ count: rateLimitCounters.count });

  const count = row?.count ?? 1;
  const resetAt = start.getTime() + rule.windowSeconds * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds,
  };
}

/** Consumes one unit and throws when the limit is exceeded. */
export async function enforceRateLimit(
  name: RateLimitName,
  subject: string,
  now = new Date(),
): Promise<void> {
  const result = await consumeRateLimit(name, subject, now);
  if (!result.allowed) {
    throw new RateLimitError(result.retryAfterSeconds);
  }
}

/** Removes counters whose window has long passed. Run from the maintenance job. */
export async function pruneRateLimits(olderThan = new Date(Date.now() - 24 * 3600 * 1000)) {
  await db.delete(rateLimitCounters).where(lt(rateLimitCounters.windowStart, olderThan));
}

/** Clears one bucket, used after a successful sign in. */
export async function clearRateLimit(name: RateLimitName, subject: string, now = new Date()) {
  const rule = RATE_LIMITS[name];
  await db
    .delete(rateLimitCounters)
    .where(
      and(
        eq(rateLimitCounters.bucketKey, `${name}:${subject}`.slice(0, 200)),
        eq(rateLimitCounters.windowStart, windowStart(rule.windowSeconds, now)),
      ),
    );
}
