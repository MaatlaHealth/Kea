/**
 * Creates the first administrator account for a deployment.
 *
 * Run with: npm run admin:create
 *
 * There is deliberately no account with a fixed password anywhere in this
 * repository. The password is read from the KEA_ADMIN_PASSWORD environment
 * variable, or generated and printed once if that variable is not set. It is
 * never written to a file and never logged again.
 *
 * Usage:
 *   KEA_ADMIN_EMAIL=you@example.org \
 *   KEA_ADMIN_NAME="Your Name" \
 *   KEA_ADMIN_ORG="Your Health Service" \
 *   npm run admin:create
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/db/schema";
import { checkPasswordPolicy, hashPassword } from "../src/lib/auth/password";

config({ path: ".env.local" });
config({ path: ".env" });

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Readable passphrase used when no password is supplied. */
function generatePassphrase(): string {
  return `${randomBytes(12).toString("base64url")}-${randomBytes(6).toString("base64url")}`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const email = (process.env.KEA_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const fullName = (process.env.KEA_ADMIN_NAME ?? "").trim();
  const organisationName = (process.env.KEA_ADMIN_ORG ?? "").trim();

  if (!email || !fullName || !organisationName) {
    console.error(
      "Set KEA_ADMIN_EMAIL, KEA_ADMIN_NAME and KEA_ADMIN_ORG before running this script.",
    );
    process.exit(1);
  }

  const supplied = process.env.KEA_ADMIN_PASSWORD;
  const password = supplied ?? generatePassphrase();
  const policy = checkPasswordPolicy(password, email);
  if (!policy.ok) {
    console.error(`The supplied password was rejected: ${policy.reason}`);
    process.exit(1);
  }

  const sslMode = process.env.DATABASE_SSL ?? "prefer";
  const client = postgres(url, {
    max: 1,
    ssl: sslMode === "disable" ? false : sslMode === "require" ? "require" : "prefer",
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });

  try {
    const passwordHash = await hashPassword(password);

    await db.transaction(async (tx) => {
      const slug = slugify(organisationName);
      const [existingOrg] = await tx
        .select({ id: schema.organisations.id })
        .from(schema.organisations)
        .where(eq(schema.organisations.slug, slug))
        .limit(1);

      const organisationId =
        existingOrg?.id ??
        (
          await tx
            .insert(schema.organisations)
            .values({ name: organisationName, slug, environment: "live" })
            .returning({ id: schema.organisations.id })
        )[0].id;

      const [existingUser] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);

      const userId =
        existingUser?.id ??
        (
          await tx
            .insert(schema.users)
            .values({
              email,
              fullName,
              passwordHash,
              status: "active",
              isPlatformAdmin: true,
              emailVerifiedAt: new Date(),
              passwordChangedAt: new Date(),
            })
            .returning({ id: schema.users.id })
        )[0].id;

      if (existingUser) {
        await tx
          .update(schema.users)
          .set({
            passwordHash,
            status: "active",
            isPlatformAdmin: true,
            passwordChangedAt: new Date(),
          })
          .where(eq(schema.users.id, userId));
      }

      await tx
        .insert(schema.memberships)
        .values({ userId, organisationId, facilityId: null, role: "organisation_admin" })
        .onConflictDoNothing();

      await tx.insert(schema.auditEvents).values({
        organisationId,
        actorUserId: userId,
        action: "admin.bootstrap",
        resourceType: "user",
        resourceId: userId,
        metadata: { role: "organisation_admin" },
      });
    });

    console.log("");
    console.log("Administrator account ready.");
    console.log(`  Organisation: ${organisationName}`);
    console.log(`  Email:        ${email}`);
    if (!supplied) {
      console.log(`  Password:     ${password}`);
      console.log("");
      console.log("This password is shown once. Store it in a password manager now,");
      console.log("then sign in and turn on multifactor authentication.");
    } else {
      console.log("  Password:     as supplied in KEA_ADMIN_PASSWORD");
    }
    console.log("");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Could not create the administrator:", error);
  process.exit(1);
});
