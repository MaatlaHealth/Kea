/**
 * Seeds reference data that is not patient data.
 *
 * Run with: npm run seed:reference
 *
 * This records the message templates the product is able to send, so that an
 * administrator can read them in the database and an information governance
 * reviewer can see exactly what a patient may receive. The templates
 * themselves live in code; this table is the published record of them.
 */
import { isNull } from "drizzle-orm";

import { db, sql } from "../src/db";
import { messageTemplates } from "../src/db/schema";
import { MESSAGE_TEMPLATES } from "../src/lib/messaging/templates";
import { log, requireDatabaseUrl } from "./lib/bootstrap";

async function main() {
  requireDatabaseUrl();

  // Replace the global template rows rather than upsert them: a unique index
  // does not treat two NULL organisation ids as a conflict, so an upsert would
  // accumulate duplicates every time this script runs.
  await db.delete(messageTemplates).where(isNull(messageTemplates.organisationId));

  let written = 0;
  for (const definition of Object.values(MESSAGE_TEMPLATES)) {
    for (const channel of ["sms", "whatsapp"] as const) {
      if (definition.key === "portal_access_code" && channel === "whatsapp") continue;

      await db.insert(messageTemplates).values({
        organisationId: null,
        key: definition.key,
        channel,
        language: "en",
        body: definition.bodies.en,
        isActive: true,
      });
      written += 1;
    }
  }

  log(`Recorded ${written} message template rows.`);
  log("");
  log("Note: WhatsApp requires each template to be approved by the provider before it");
  log("can be sent outside a customer initiated session window. Recording a template");
  log("here does not approve it.");

  await sql.end();
}

main().catch((error) => {
  console.error("Reference seed failed:", error);
  process.exit(1);
});
