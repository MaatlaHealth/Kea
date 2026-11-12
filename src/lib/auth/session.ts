import "server-only";

import { and, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { db } from "@/db";
import { facilities, memberships, sessions, users } from "@/db/schema";
import { env } from "@/lib/env";
import { AuthenticationError } from "@/lib/errors";
import type { AuthContext, FacilitySummary, MembershipScope } from "./context";
import { generateToken, hashToken } from "./tokens";

const ORG_COOKIE = "kea_org";

export function sessionCookieName(): string {
  return env().SESSION_COOKIE_NAME;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export type RequestMeta = { ipAddress: string | null; userAgent: string | null };

export async function requestMeta(): Promise<RequestMeta> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || null;
  return { ipAddress: ip, userAgent: headerList.get("user-agent") };
}

/**
 * Creates a session row and sets the cookie. The raw token exists only in the
 * cookie; the database stores its SHA-256 digest.
 */
export async function createSession(userId: string, meta: RequestMeta, mfaSatisfied: boolean) {
  const config = env();
  const token = generateToken();
  const ttlSeconds = config.SESSION_TTL_HOURS * 3600;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      mfaSatisfiedAt: mfaSatisfied ? new Date() : null,
    })
    .returning({ id: sessions.id });

  const store = await cookies();
  store.set(config.SESSION_COOKIE_NAME, token, cookieOptions(ttlSeconds));
  return { sessionId: row.id, expiresAt };
}

export async function destroyCurrentSession(): Promise<string | null> {
  const store = await cookies();
  const config = env();
  const token = store.get(config.SESSION_COOKIE_NAME)?.value;
  store.delete(config.SESSION_COOKIE_NAME);
  store.delete(ORG_COOKIE);
  if (!token) return null;
  const [row] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(token)))
    .returning({ id: sessions.id, userId: sessions.userId });
  return row?.userId ?? null;
}

export async function revokeAllSessionsForUser(userId: string, exceptSessionId?: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    );
}

export async function setActiveOrganisation(organisationId: string) {
  const store = await cookies();
  store.set(ORG_COOKIE, organisationId, cookieOptions(env().SESSION_TTL_HOURS * 3600));
}

/**
 * Loads the authenticated context for the current request.
 *
 * Wrapped in React cache so that a single render resolves the session once even
 * when many server components ask for it.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  // Reading cookies first marks the render dynamic before anything else runs.
  // A page that only asks whether someone is signed in must never be
  // prerendered, and must never need the environment in order to find out.
  const store = await cookies();
  const config = env();
  const token = store.get(config.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const now = new Date();

  const [session] = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      lastSeenAt: sessions.lastSeenAt,
      email: users.email,
      fullName: users.fullName,
      status: users.status,
      isPlatformAdmin: users.isPlatformAdmin,
      mfaEnabledAt: users.mfaEnabledAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!session) return null;
  if (session.revokedAt || session.expiresAt <= now) return null;
  if (session.status !== "active") return null;

  // Refresh the activity marker at most once a minute to limit write load.
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, session.sessionId));
  }

  const membershipRows = await db
    .select({
      organisationId: memberships.organisationId,
      facilityId: memberships.facilityId,
      role: memberships.role,
    })
    .from(memberships)
    .where(and(eq(memberships.userId, session.userId), eq(memberships.isActive, true)));

  const scopes: MembershipScope[] = membershipRows.map((row) => ({
    organisationId: row.organisationId,
    facilityId: row.facilityId,
    role: row.role,
  }));

  const organisationIds = Array.from(new Set(scopes.map((s) => s.organisationId)));

  let facilityRows: FacilitySummary[] = [];
  if (session.isPlatformAdmin) {
    facilityRows = await db
      .select({
        id: facilities.id,
        organisationId: facilities.organisationId,
        name: facilities.name,
        code: facilities.code,
        type: facilities.type,
      })
      .from(facilities)
      .where(eq(facilities.isActive, true));
  } else if (organisationIds.length > 0) {
    const all = await db
      .select({
        id: facilities.id,
        organisationId: facilities.organisationId,
        name: facilities.name,
        code: facilities.code,
        type: facilities.type,
      })
      .from(facilities)
      .where(
        and(inArray(facilities.organisationId, organisationIds), eq(facilities.isActive, true)),
      );

    const orgWide = new Set(
      scopes.filter((s) => s.facilityId === null).map((s) => s.organisationId),
    );
    const explicit = new Set(
      scopes.filter((s) => s.facilityId !== null).map((s) => s.facilityId as string),
    );

    facilityRows = all.filter(
      (facility) => orgWide.has(facility.organisationId) || explicit.has(facility.id),
    );
  }

  const cookieOrg = store.get(ORG_COOKIE)?.value ?? null;
  const activeOrganisationId =
    cookieOrg && (session.isPlatformAdmin || organisationIds.includes(cookieOrg))
      ? cookieOrg
      : (organisationIds[0] ?? null);

  return {
    userId: session.userId,
    sessionId: session.sessionId,
    email: session.email,
    fullName: session.fullName,
    isPlatformAdmin: session.isPlatformAdmin,
    mfaEnabled: Boolean(session.mfaEnabledAt),
    memberships: scopes,
    facilities: facilityRows,
    organisationIds: session.isPlatformAdmin
      ? Array.from(new Set([...organisationIds, ...facilityRows.map((f) => f.organisationId)]))
      : organisationIds,
    activeOrganisationId,
  };
});

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AuthenticationError();
  return ctx;
}

/** Removes expired and revoked sessions. Run from the maintenance job. */
export async function pruneSessions(now = new Date()) {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
}
