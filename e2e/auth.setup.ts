import fs from "node:fs";
import path from "node:path";

import { expect, test as setup } from "@playwright/test";

import { ACCOUNTS, DEMO_PASSWORD, storageStatePath } from "./fixtures";

/**
 * Signs in once per role and saves the session, so the journey suite does not
 * sign in again for every step.
 *
 * This is not only faster. Kea rate limits sign in per account, which is the
 * credential stuffing control, and a suite that signed in nine times in a row
 * would be testing the rate limiter rather than the referral workflow.
 */

setup.skip(
  !DEMO_PASSWORD,
  "Set KEA_DEMO_PASSWORD and run npm run seed:demo before the end to end suite.",
);

setup.describe.configure({ mode: "serial" });

for (const [role, email] of Object.entries(ACCOUNTS)) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Work email address").fill(email);
    await page.getByLabel("Password", { exact: false }).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL(/\/app/);
    await expect(page.getByRole("button", { name: /Notifications/ })).toBeVisible();

    const file = storageStatePath(role);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.context().storageState({ path: file });
  });
}
