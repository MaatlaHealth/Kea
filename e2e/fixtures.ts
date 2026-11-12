import { expect, type Page } from "@playwright/test";

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

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email address").fill(email);
  await page.getByLabel("Password", { exact: false }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: /signed in|demo\./i }).first().click().catch(() => {});
  const signOutButton = page.getByRole("button", { name: "Sign out" });
  if (await signOutButton.isVisible().catch(() => false)) {
    await signOutButton.click();
    await page.waitForURL(/\/sign-in/);
  } else {
    await page.context().clearCookies();
  }
}

/** Reads the referral reference from the detail page heading. */
export async function referenceFromPage(page: Page): Promise<string> {
  const heading = await page.getByRole("heading", { level: 1 }).first().innerText();
  expect(heading).toMatch(/^KEA-/);
  return heading.trim();
}
