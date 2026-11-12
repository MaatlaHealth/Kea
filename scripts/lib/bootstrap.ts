/**
 * Helpers shared by the command line scripts.
 *
 * The scripts deliberately call the same service functions the application
 * uses, so a seeded database exercises the real referral engine, the real
 * authorisation rules and the real state machine rather than a parallel code
 * path that could drift from them.
 */
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";

import { db } from "../../src/db";
import { facilities, memberships, users } from "../../src/db/schema";
import type { AuthContext } from "../../src/lib/auth/context";

config({ path: ".env.local" });
config({ path: ".env" });

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
    process.exit(1);
  }
  return url;
}

/**
 * Builds the same authorisation context the web session builds, from the
 * user's memberships. Scripts never bypass permission checks: if a seeded
 * user is not allowed to do something, the script fails.
 */
export async function contextForUser(userId: string): Promise<AuthContext> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error(`No user with id ${userId}`);

  const membershipRows = await db
    .select({
      organisationId: memberships.organisationId,
      facilityId: memberships.facilityId,
      role: memberships.role,
    })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.isActive, true)));

  const organisationIds = Array.from(new Set(membershipRows.map((row) => row.organisationId)));

  const allFacilities = organisationIds.length
    ? await db
        .select({
          id: facilities.id,
          organisationId: facilities.organisationId,
          name: facilities.name,
          code: facilities.code,
          type: facilities.type,
        })
        .from(facilities)
    : [];

  const orgWide = new Set(
    membershipRows.filter((row) => row.facilityId === null).map((row) => row.organisationId),
  );
  const explicit = new Set(
    membershipRows.filter((row) => row.facilityId !== null).map((row) => row.facilityId as string),
  );

  const visible = allFacilities.filter(
    (facility) =>
      user.isPlatformAdmin ||
      orgWide.has(facility.organisationId) ||
      explicit.has(facility.id),
  );

  return {
    userId: user.id,
    sessionId: "script",
    email: user.email,
    fullName: user.fullName,
    isPlatformAdmin: user.isPlatformAdmin,
    mfaEnabled: Boolean(user.mfaEnabledAt),
    memberships: membershipRows,
    facilities: visible,
    organisationIds,
    activeOrganisationId: organisationIds[0] ?? null,
  };
}

export function log(message: string) {
  process.stdout.write(`${message}\n`);
}
