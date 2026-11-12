import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Public website on a phone, plus an automated accessibility scan.
 *
 * The scan catches machine detectable problems only. It is not a substitute
 * for an accessibility audit, which the data governance page lists as
 * outstanding.
 */

const PUBLIC_PAGES = [
  { path: "/", heading: /Every maternal referral deserves a confirmed outcome/ },
  { path: "/how-it-works", heading: /From a concern at a clinic/ },
  { path: "/for-providers", heading: /What your team gets/ },
  { path: "/technology", heading: /Built to be read, run and adapted/ },
  { path: "/request-a-pilot", heading: /Start a conversation/ },
  { path: "/privacy", heading: /Privacy policy/ },
  { path: "/terms", heading: /Terms of use/ },
  { path: "/data-governance", heading: /What Kea stores/ },
];

for (const page of PUBLIC_PAGES) {
  test(`${page.path} renders on a phone without horizontal overflow`, async ({ page: browser }) => {
    await browser.goto(page.path);
    await expect(browser.getByRole("heading", { name: page.heading }).first()).toBeVisible();

    const overflow = await browser.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${page.path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
  });

  test(`${page.path} passes the automated accessibility scan`, async ({ page: browser }) => {
    await browser.goto(page.path);
    const results = await new AxeBuilder({ page: browser })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);
  });
}

test("the mobile menu opens and closes", async ({ page }) => {
  await page.goto("/");
  const openButton = page.getByRole("button", { name: "Open menu" });
  await expect(openButton).toBeVisible();
  await openButton.click();

  await expect(page.getByRole("navigation", { name: "Main" }).last()).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
});

test("the illustrative pathway is labelled as sample content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Illustrative workflow")).toBeVisible();
  await expect(page.getByText("Sample content. Not live patient data.")).toBeVisible();
});

test("the pilot enquiry form rejects an incomplete submission", async ({ page }) => {
  await page.goto("/request-a-pilot");

  await page.getByLabel("Organisation or health service").fill("Test Health Service");
  await page.getByLabel("Your name").fill("Test Person");
  await page.getByLabel("Work email address").fill("not-an-email");
  await page.getByLabel("Tell us about your referral pathways").fill("Too short");

  // The consent checkbox gates the submit button, which is the first control.
  await expect(page.getByRole("button", { name: "Send enquiry" })).toBeDisabled();
  await page.getByRole("checkbox").click();
  await expect(page.getByRole("button", { name: "Send enquiry" })).toBeEnabled();
});

test("the patient portal sign in works at phone width", async ({ page }) => {
  await page.goto("/portal/sign-in");
  await expect(page.getByRole("heading", { name: "See your appointments" })).toBeVisible();
  await expect(page.getByLabel("Mobile number")).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
