/**
 * Applies pending database migrations.
 *
 * Run with: npm run db:migrate
 *
 * Migrations are plain SQL files under src/db/migrations, generated from the
 * schema with `npm run db:generate`. They are reviewable before they run,
 * which matters when a health service IT team has to approve a change.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
    process.exit(1);
  }

  const sslMode = process.env.DATABASE_SSL ?? "prefer";
  const client = postgres(url, {
    max: 1,
    ssl: sslMode === "disable" ? false : sslMode === "require" ? "require" : "prefer",
    onnotice: () => {},
  });

  const db = drizzle(client);

  console.log("Applying migrations from src/db/migrations");
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  console.log("Migrations applied.");

  await client.end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
