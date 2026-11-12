import path from "node:path";

import { expect, type Browser, type Page } from "@playwright/test";

/**
 * Shared helpers for the end to end suite.
 *
 * Credentials come from the environment, never from the repository. The
 * accounts are the fictional demonstration staff created by
 * `npm run seed:demo`.
 */

export const DEMO_PASSWORD = process.env.KEA_DEMO_PASSWORD ?? "";

export const ACCOUNTS = {
  nurse: "demo.nurse@kea.invalid",
  clinician: "demo.clinician@kea.invalid",
  coordinator: "demo.coordinator@kea.invalid",
  analyst: "demo.analyst@kea.invalid",
  admin: "demo.admin@kea.invalid",
} as const;

export type Role = keyof typeof ACCOUNTS;

/** Where the setup project writes each role's saved session. */
export function storageStatePath(role: string): string {
  return path.join(process.cwd(), "playwright", ".auth", `${role}.json`);
}

/**
 * Opens a page already signed in as the given role, using the session the
 * setup project saved. The caller closes the context when finished.
 */
export async function pageAs(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: storageStatePath(role) });
  const page = await context.newPage();
  return { context, page };
}

/** Reads the referral reference from the detail page heading. */
export async function referenceFromPage(page: Page): Promise<string> {
  const heading = await page.getByRole("heading", { level: 1 }).first().innerText();
  expect(heading).toMatch(/^KEA-/);
  return heading.trim();
}
