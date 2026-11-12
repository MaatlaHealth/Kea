import { expect, test } from "@playwright/test";

import { ACCOUNTS, DEMO_PASSWORD, signIn } from "./fixtures";

/**
 * The complete referral journey, through the interface.
 *
 * A nurse registers a patient and submits a referral. A clinician at the
 * receiving hospital acknowledges it and books an appointment. The nurse sees
 * the update. A missed appointment produces a coordination task, the
 * coordinator records outreach, and the clinician records the care outcome.
 */

test.skip(
  !DEMO_PASSWORD,
  "Set KEA_DEMO_PASSWORD and run npm run seed:demo before the end to end suite.",
);

test.describe.configure({ mode: "serial" });

const unique = Date.now().toString().slice(-6);
const patientSurname = `Testpatient${unique}`;
let referralReference = "";

test("a nurse registers a patient", async ({ page }) => {
  await signIn(page, ACCOUNTS.nurse);

  await page.goto("/app/patients/new");
  await expect(page.getByRole("heading", { name: "Register patient" })).toBeVisible();

  await page.getByLabel("First name").fill("Journey");
  await page.getByLabel("Surname").fill(patientSurname);
  await page.getByLabel("Date of birth").fill("1997-05-21");
  await page.getByLabel("Mobile number").first().fill(`06000${unique}`);
  await page.getByLabel("Area where the patient lives").fill("Riverside");

  await page.getByRole("button", { name: "Register patient" }).click();

  await page.waitForURL(/\/app\/patients\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: `Journey ${patientSurname}` })).toBeVisible();
  await expect(page.getByText("Fictional record")).toBeVisible();
});

test("the nurse creates and submits a referral", async ({ page }) => {
  await signIn(page, ACCOUNTS.nurse);

  await page.goto("/app/patients");
  await page.getByPlaceholder("Search by name, record number or phone").fill(patientSurname);
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: `Journey ${patientSurname}` }).click();

  await page.getByRole("link", { name: "New referral" }).click();
  await page.waitForURL(/\/app\/referrals\/new/);

  await page.getByLabel("Receiving facility").click();
  await page.getByRole("option", { name: /Thabelo District Hospital/ }).click();

  await page.getByLabel("Reason for referral").click();
  await page.getByRole("option", { name: "Suspected pre-eclampsia" }).click();

  await page
    .getByLabel("Clinical observations")
    .fill("Blood pressure 150 over 96 at routine visit. Gestation 32 weeks.");
  await page
    .getByLabel("What you are asking the receiving team to do")
    .fill("Specialist review and repeat investigations.");

  await page.getByRole("button", { name: "Submit referral" }).click();

  await page.waitForURL(/\/app\/referrals\/[0-9a-f-]{36}/);
  referralReference = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
  expect(referralReference).toMatch(/^KEA-/);

  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();
});

test("the nurse cannot acknowledge on the hospital's behalf", async ({ page }) => {
  await signIn(page, ACCOUNTS.nurse);
  await page.goto("/app/referrals");
  await page.getByPlaceholder("Search by reference, name or record number").fill(referralReference);
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: referralReference }).click();

  await expect(page.getByRole("button", { name: "Acknowledge referral" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel referral" })).toBeVisible();
});

test("the receiving clinician acknowledges and books an appointment", async ({ page }) => {
  await signIn(page, ACCOUNTS.clinician);

  await page.goto("/app/inbox");
  await expect(page.getByRole("heading", { name: "Incoming referrals" })).toBeVisible();
  await page.getByRole("link", { name: referralReference }).click();

  await page.getByRole("button", { name: "Acknowledge referral" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Acknowledge referral" }).click();
  await expect(page.getByText("Acknowledged", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Schedule appointment" }).click();
  const dialog = page.getByRole("dialog");
  const date = new Date();
  date.setDate(date.getDate() + 5);
  const value = `${date.toISOString().slice(0, 10)}T09:30`;
  await dialog.getByLabel("Date and time").fill(value);
  await dialog.getByRole("button", { name: "Schedule appointment" }).click();

  await expect(page.getByText("Appointment scheduled", { exact: true }).first()).toBeVisible();
});

test("the referring nurse sees the update without being told", async ({ page }) => {
  await signIn(page, ACCOUNTS.nurse);
  await page.goto("/app/referrals");
  await page.getByPlaceholder("Search by reference, name or record number").fill(referralReference);
  await page.keyboard.press("Enter");

  await expect(page.getByRole("row", { name: new RegExp(referralReference) })).toContainText(
    "Appointment scheduled",
  );
});

test("a missed appointment produces a coordination task", async ({ page }) => {
  await signIn(page, ACCOUNTS.clinician);
  await page.goto("/app/referrals");
  await page.getByPlaceholder("Search by reference, name or record number").fill(referralReference);
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: referralReference }).click();

  await page.getByRole("button", { name: "Record missed appointment" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Note").fill("The patient did not arrive for the booked slot.");
  await dialog.getByRole("button", { name: "Record missed appointment" }).click();

  await expect(page.getByText("Missed appointment", { exact: true }).first()).toBeVisible();
});

test("the coordinator records outreach and resolves the task", async ({ page }) => {
  await signIn(page, ACCOUNTS.coordinator);
  await page.goto("/app/coordination");

  await page.getByRole("tab", { name: "Missed appointments" }).click();
  await page
    .getByRole("link", { name: new RegExp(`Missed appointment on referral ${referralReference}`) })
    .click();

  await page.getByRole("button", { name: "Assign to me" }).click();
  await expect(page.getByRole("button", { name: "Release task" })).toBeVisible();

  await page.getByLabel("Notes").fill("Telephoned the patient, agreed a new date.");
  await page.getByRole("button", { name: "Record attempt" }).click();
  await expect(page.getByText("Telephoned the patient, agreed a new date.")).toBeVisible();

  await page.getByLabel("What was done").fill("Rebooked for next week with the hospital.");
  await page.getByRole("button", { name: "Resolve task" }).click();
  await expect(page.getByText("Resolution")).toBeVisible();
});

test("the clinician rebooks, records attendance and the care outcome", async ({ page }) => {
  await signIn(page, ACCOUNTS.clinician);
  await page.goto("/app/referrals");
  await page.getByPlaceholder("Search by reference, name or record number").fill(referralReference);
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: referralReference }).click();

  await page.getByRole("button", { name: "Rebook appointment" }).click();
  const rebook = page.getByRole("dialog");
  const date = new Date();
  date.setDate(date.getDate() + 10);
  await rebook.getByLabel("Date and time").fill(`${date.toISOString().slice(0, 10)}T11:00`);
  await rebook.getByRole("button", { name: "Rebook appointment" }).click();
  await expect(page.getByText("Appointment scheduled", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Record attendance" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Record attendance" }).click();
  await expect(page.getByText("Patient attended", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Record care outcome" }).click();
  const outcome = page.getByRole("dialog");
  await outcome
    .getByLabel("What care was provided")
    .fill("Reviewed by the obstetric team. Blood pressure controlled. Returned to the clinic.");
  await outcome.getByRole("button", { name: "Record care outcome" }).click();
  await expect(page.getByText("Care completed", { exact: true }).first()).toBeVisible();
});

test("the referring facility sees the recorded outcome", async ({ page }) => {
  await signIn(page, ACCOUNTS.nurse);
  await page.goto("/app/referrals");
  await page.getByPlaceholder("Search by reference, name or record number").fill(referralReference);
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: referralReference }).click();

  await expect(page.getByText("Care outcome")).toBeVisible();
  await expect(page.getByText(/Blood pressure controlled/)).toBeVisible();
});

test("an analyst sees aggregate reporting and no patient records", async ({ page }) => {
  await signIn(page, ACCOUNTS.analyst);

  await expect(page).toHaveURL(/\/app\/analytics/);
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(page.getByText("How these figures are calculated")).toBeVisible();

  await page.goto("/app/patients");
  await expect(page.getByText(/does not include|not allow|not available/i).first()).toBeVisible();
});
