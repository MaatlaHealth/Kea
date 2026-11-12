# Contributing to Kea

Thank you for considering a contribution. Kea handles health information, so
a few things matter more here than in a typical project. Please read the
first section before you open a pull request.

## Before anything else

**Never commit real patient data.** Not in a test, not in a fixture, not in a
screenshot, not in an issue, not in a commit message. If you need data, use
`npm run seed:demo`, which generates fictional records.

**Never commit a secret.** `.gitignore` excludes every `.env*` file except
`.env.example`, and a secret scan runs over the full history on every push.
If you push one by accident, rotate it first and tell us second.

**Security issues do not go in the issue tracker.** See
[SECURITY.md](SECURITY.md).

## Getting set up

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL
npm run db:migrate
npm run seed:reference
npm run seed:demo
npm run dev
```

[docs/installation.md](docs/installation.md) has the detail, including Docker
and the optional prediction service.

## Before you open a pull request

```bash
npm run verify     # typecheck, lint and tests
```

If you touched the prediction service:

```bash
cd services/prediction
ruff check kea_prediction tests
pytest -q
```

## Where code goes

| You are changing | It belongs in |
| --- | --- |
| How a referral may move between states | `src/lib/referrals/state-machine.ts` |
| What a role may do | `src/lib/auth/permissions.ts` |
| Who may see a patient | `src/lib/access.ts` |
| Clinical workflow with side effects | `src/lib/*/service.ts` |
| A read model for a screen | `src/lib/*/queries.ts` |
| Form handling and validation | `src/server/actions/*` |
| Rendering | `src/app`, `src/components` |

A component never queries the database; an ESLint rule enforces it. A service
never imports a component.

## House rules

These are not stylistic preferences. Each one exists because of something
that goes wrong in health software.

**Every status change goes through the state machine.** If you find yourself
writing `update referrals set status = ...` outside
`transitionReferral`, stop. Add the transition to the table instead.

**Every action checks permission on the server.** Hiding a button is not a
control. A new action without an `assertCan` will be sent back.

**Record level access is checked, not assumed.** If an action touches a
patient, call `requirePatientAccess`. Do not infer access from the fact that
the caller reached the page.

**An access failure looks like absence.** Return `NotFoundError`, not
`AuthorisationError`, for a record the caller may not see. Otherwise the
interface confirms that a person has a record.

**Audit metadata goes through the allow list.** If you need a new key, add it
to `ALLOWED_METADATA_KEYS` in `src/lib/audit.ts` and make sure it cannot carry
a name, a number or clinical content.

**Message templates carry nothing clinical.** A template may reference a
facility, a date and a time. A test asserts that no template body contains a
clinical term, and it will fail if you add one.

**An unconfigured integration does nothing.** It must not simulate success. A
message that was not sent is never reported as delivered.

**No em dashes in copy or in code comments.** House style.

**British English spelling** in user facing copy and in identifiers that
appear in the interface: organisation, authorisation, minimise.

## Writing comments

Comment the decision, not the mechanics. `// loop over referrals` says
nothing. `// Provider calls are outside the transaction so a rolled back
transition cannot leave a message already sent` says why the code is shaped
the way it is.

## Database changes

```bash
# edit src/db/schema.ts, then
npm run db:generate
```

Review the generated SQL. Never edit a migration that has been applied
anywhere. Make changes additive: add a nullable column, deploy code that
writes it, backfill, then tighten the constraint in a later migration.

Update [docs/database.md](docs/database.md) in the same pull request.

## Tests we expect with a change

| Change | Test |
| --- | --- |
| A new referral transition | A case in `tests/unit/state-machine.test.ts` covering who may and may not perform it |
| A permission change | A case in `tests/unit/permissions.test.ts` |
| A new message template | The clinical term test covers it automatically; add a rendering case |
| A new service function | An integration test if it touches more than one table |
| A new screen | An end to end case if it is part of the referral journey |

## Commits and pull requests

Write commit subjects in the imperative: "Add escalation threshold per
facility". Explain in the body why, not what.

A pull request should say what it changes, why, how you tested it, and
anything a reviewer should look at carefully. If it touches authorisation,
messaging, consent or the state machine, say so in the first line.

## Accessibility

New interface work must keep: labelled form controls, visible focus, a
sensible heading order, keyboard operability and adequate contrast. The
automated axe scan in the end to end suite catches some of this. It does not
catch all of it, so check keyboard navigation by hand.

## Clinical safety

If a change affects what a clinician sees, when a task is raised, or what a
patient is told, say so clearly in the pull request. A change to an escalation
default or a message template is a clinical change even when the diff is one
line.

## Licence

By contributing, you agree that your contribution is licensed under the
Apache License 2.0, as the rest of the project is.
