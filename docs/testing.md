# Testing

```bash
npm run typecheck     # TypeScript, no emit
npm run lint          # ESLint, flat config in eslint.config.mjs
npm test              # Vitest: unit, plus integration when a database is reachable
npm run test:e2e      # Playwright, needs seeded data and KEA_DEMO_PASSWORD
npm run verify        # typecheck, lint and test together

cd services/prediction && pytest -q    # the Python service
```

## What is covered

### Unit tests, `tests/unit`

No database. These cover the rules the product depends on being right.

**`state-machine.test.ts`** The referral state machine.

- Every transition has a label and a description.
- No pair is defined twice.
- No terminal status has an exit.
- Every status in the enum is reachable from `draft`, computed by walking the
  graph rather than asserted by hand.
- The happy path is legal; nine specific impossible jumps are refused.
- The referring clinic cannot acknowledge, the hospital cannot cancel, a
  clinician at an unrelated facility can do nothing, and a nurse cannot do
  what their role does not carry.
- A transition that requires a reason refuses an empty or whitespace reason.
- `availableTransitions` returns the right set per role and nothing at all on
  a closed referral.

**`permissions.test.ts`** The authorisation model.

- Every role in the enum has permissions, a label and a description, and
  grants only permissions that exist.
- The platform role is never assignable from the admin screens.
- A programme analyst has no `patient:read`, `referral:read` or
  `message:read` anywhere.
- Clinical roles have no organisation management permissions.
- A role at one facility grants nothing at another.
- A role in one organisation grants nothing in another. **This test found a
  real bug**: `rolesAt` previously resolved no organisation when the facility
  was outside the user's scope, which let one organisation's roles apply at
  another's facility. Fixed in `src/lib/auth/context.ts`.

**`security.test.ts`** Passwords, tokens, TOTP, webhook signatures, audit.

- scrypt hashing round trips, rejects a wrong password, salts each hash,
  rejects a malformed stored hash and normalises unicode.
- The password policy rejects short passwords, common words, the product
  name and the email local part.
- Token digests are stable and compared in constant time.
- TOTP accepts the current code, tolerates one step of drift either way,
  rejects a code from further away and rejects malformed input.
- Twilio signature verification accepts a correct signature and rejects one
  made with a different token, for a different URL, with a tampered
  parameter, or absent.
- Audit metadata keeps allowed keys and drops a patient name, a phone number,
  a diagnosis and a message body.

**`messaging.test.ts`** Phone handling and message templates.

- South African local, international and `00` prefixed numbers normalise to
  E.164; nonsense is rejected.
- Templates render, refuse an undeclared variable, refuse a missing value
  rather than leaving a gap, and strip newlines so a value cannot inject an
  extra line.
- **No template body contains any of thirteen clinical terms**, and no
  template declares a variable that could carry one. This is the test that
  keeps the privacy promise honest as templates change.

### Integration tests, `tests/integration`

Against a real PostgreSQL database, calling the same service functions the
interface calls. **Skipped, not failed, when no database is reachable**, so
`npm test` is useful on a machine without one. CI always has one.

`referral-lifecycle.test.ts` walks the acceptance criteria end to end:

1. A nurse registers a patient; the phone number is normalised and the record
   is marked synthetic.
2. A second registration with the same details returns duplicate candidates
   instead of creating a record.
3. The nurse creates and submits a referral; a referral to a facility off the
   pathway list is refused.
4. The referral appears in the receiving facility's incoming queue and not in
   the clinic's.
5. The clinic cannot acknowledge; the hospital can; the acknowledgement task
   resolves.
6. An appointment is scheduled; one in the past is refused.
7. The status history is complete, attributed and in order.
8. A missed appointment creates exactly one coordination task.
9. A coordinator records outreach and resolves it.
10. Attendance and a care outcome are recorded; an outcome with no summary is
    refused.
11. The referring facility sees the update, and notifications carry no
    patient name or clinical term.
12. The patient sees the shared note and not the staff note, and the patient
    view carries no clinical observations field.
13. Analytics reflect the stored events, and suppress rates below the
    threshold.
14. An outsider, an analyst and a nurse at another clinic in the same
    organisation all get "not found" on the patient and the referral.
15. Audit entries exist for each action and contain no name, clinical term or
    phone number.
16. Messages are queued and never reported as sent while messaging is off,
    and a repeated trigger produces one message.
17. The pathway closes, open tasks resolve, and a further transition on a
    closed referral is refused.

### End to end, `e2e`

Playwright, driving the real interface against seeded demonstration data.

`referral-journey.spec.ts` repeats the journey through the browser: register,
refer, confirm the nurse has no acknowledge button, acknowledge, book, see the
update at the clinic, miss the appointment, work the coordination task,
rebook, record attendance and the outcome, see it at the clinic, and confirm
the analyst reaches analytics and not patients.

`public-site.mobile.spec.ts` runs on a Pixel 7 viewport and checks each public
page for a visible heading, no horizontal overflow, and zero automated
accessibility violations against WCAG 2.1 A and AA using axe. It also checks
the mobile menu, the illustrative pathway's labelling, the pilot form's
consent gate and the patient portal sign in.

### Prediction service, `services/prediction/tests`

- Every feature has a default, so imputation can never be undefined.
- `prepare` orders features, reports missing ones, ignores unknown keys and
  treats an unparsable value as missing.
- The synthetic generator is deterministic for a seed.
- `/features` publishes the contract, including the excluded characteristics.
- `/predict` rejects a feature set version mismatch with `409`.
- A scored response is in range, reports `clinically_validated: false` and
  `trained_on_real_data: false`, and returns explainable contributions.
- More prior missed appointments does not lower the score, which is a
  monotonicity sanity check on the served model.

The suite deliberately asserts **no performance threshold**. A passing
threshold on synthetic data would be false assurance.

## Running the integration tests locally

```bash
createdb kea_test
DATABASE_URL=postgresql://localhost:5432/kea_test DATABASE_SSL=disable npm run db:migrate
DATABASE_URL=postgresql://localhost:5432/kea_test DATABASE_SSL=disable npm test
```

The suite truncates every table before it runs, so point it at a disposable
database.

## Running the end to end tests locally

```bash
export KEA_DEMO_PASSWORD='choose-a-strong-one'
npm run db:migrate && npm run seed:reference && npm run seed:demo
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

## Continuous integration

`.github/workflows/ci.yml` runs three jobs on every push and pull request:

- **web**: type check, lint, migrate, unit and integration tests, build.
- **prediction**: ruff, train, pytest, evaluate.
- **e2e**: migrate, seed with a password generated for the run, build,
  Playwright, upload the report.

`.github/workflows/security.yml` runs dependency audit (npm and pip-audit),
secret scanning across the full history, and CodeQL for both languages, on
every push and weekly.

## What is not covered

- **Load and performance.** No benchmarks have been run.
- **Live Twilio delivery.** Webhook signature verification is unit tested
  against the documented algorithm, but no message has been sent through a
  real account from this codebase.
- **Live Gemini responses.** The schema validation and injection defences are
  in the code and reviewable; the provider has not been exercised in a test.
- **Browser coverage beyond Chromium.** Firefox and WebKit projects are not
  configured.
- **Penetration testing.** Listed as outstanding in
  [data-governance.md](data-governance.md).
