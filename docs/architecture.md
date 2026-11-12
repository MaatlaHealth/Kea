# Architecture

## Shape of the system

Kea is one deployable web application plus one optional service.

```
                       ┌──────────────────────────────┐
  Staff browser ─────▶ │  Next.js application         │
  Patient browser ───▶ │  - public website            │
                       │  - staff application         │
                       │  - patient portal            │
                       │  - server actions            │
                       │  - HTTP routes and webhooks  │
                       └───────┬──────────────┬───────┘
                               │              │
                   ┌───────────▼───┐    ┌─────▼──────────────┐
                   │  PostgreSQL   │    │ Prediction service │
                   │  (all state)  │    │ (optional, Python) │
                   └───────────────┘    └────────────────────┘
                               │
                   ┌───────────▼───────────┐
                   │ Twilio (optional)     │
                   │ Gemini (optional)     │
                   │ SMTP (optional)       │
                   └───────────────────────┘
```

There is no message broker, no cache tier and no separate API service. A
health service that pilots Kea has to run and secure whatever we ship, so the
default is the smallest number of moving parts that does the job.

## Layers

| Layer | Directory | Responsibility |
| --- | --- | --- |
| Presentation | `src/app`, `src/components` | Rendering only. Components never query the database; an ESLint rule enforces that. |
| Actions | `src/server/actions` | Parse input with Zod, resolve the session, call a service, return a typed result. Never throw across the boundary. |
| Services | `src/lib/*/service.ts` | Clinical workflow. Transactions, state transitions, side effects, audit. |
| Queries | `src/lib/*/queries.ts` | Read models for screens. Scope predicates are applied in SQL. |
| Domain | `src/lib/referrals/state-machine.ts`, `src/lib/auth/permissions.ts` | Pure rules, no input and output. Exhaustively testable. |
| Data | `src/db` | Schema, migrations, the lazily created client. |

A request flows one way: component to action to service to database. A service
never imports a component, and a component never imports a service.

## The referral state machine

Every status change in the product goes through one function,
`assertTransition`. The transition table in
`src/lib/referrals/state-machine.ts` is the complete definition of which moves
are legal, which permission each requires, which facility side may perform it
and whether a reason is mandatory.

That module is pure. It takes a status, a target, an authorisation context and
the two facility identifiers, and returns a decision. It touches nothing else,
which is why the unit tests can walk every state and assert that every
non-terminal status is reachable and that no terminal status has an exit.

The service layer wraps it in a transaction that:

1. locks the referral row with `select ... for update`;
2. confirms the actor may see the patient at all;
3. asks the state machine whether the move is legal;
4. applies the status specific side effects (appointments, tasks, messages,
   notifications);
5. writes the new status, appends an immutable status event, writes the audit
   entry.

If any step fails, none of it is applied. Provider calls are deliberately
outside the transaction: messages are recorded as queued inside it and handed
to Twilio after commit, so a rolled back transition can never leave a message
already sent.

## Authorisation

Three things are separate, and all three are checked:

1. **Does the role carry the permission?** `ROLE_PERMISSIONS` maps each of the
   seven roles to a fixed permission list.
2. **Does it apply here?** A membership row is either organisation wide or
   scoped to one facility. `rolesAt` resolves the organisation from the
   facility, so a role in one organisation can never apply at another
   organisation's facility.
3. **Is there a care relationship with this patient?** `findPatientAccess`
   grants access when the patient is registered at a facility the user works
   in, or when a referral links the patient to such a facility. Nothing else
   grants it. A failure is reported as "not found", so the interface cannot be
   used to confirm that a particular person has a record.

The navigation hides what a user cannot do, but hiding is never the control.
Every page and every action repeats the check on the server.

## Decisions worth explaining

**Sessions in our own database rather than a hosted auth service.** The brief
suggested Supabase Auth. Supabase remains a good choice for managed PostgreSQL
and storage, but authentication was implemented directly because referral
authorisation already depends on organisation and facility membership rows in
the same database. Keeping the session, the membership and the clinical record
in one transactional store removes a class of consistency problems, and it
keeps the project deployable on any PostgreSQL host rather than one vendor.
Sessions are opaque tokens stored only as a SHA-256 digest; passwords use
scrypt from the Node standard library, so there is no native build step.

**Drizzle rather than Prisma.** Drizzle generates plain SQL migrations that a
hospital IT team can read and approve before they run, and it needs no
separate query engine binary at runtime. Both were viable; reviewability
decided it.

**Attachments in PostgreSQL rather than object storage.** Referral attachments
are stored in a `document_blobs` table. They are then covered by the same
backup, the same retention policy and the same access check as the clinical
record, they work on a serverless platform with an ephemeral filesystem, and
there is no second credential to manage. The limit is 8 MB per file, which
suits photographs of handheld records and lab results. `src/lib/storage.ts` is
the only module that reads or writes them, so an object storage adapter can be
added behind it without touching the referral code.

**Rate limiting in PostgreSQL.** Fixed window counters in the database are
shared across serverless instances and are sufficient for credential stuffing,
enumeration and message flooding. A cache tier would be another thing to run
and secure.

**The Gemini call is a plain HTTPS request.** No vendor SDK is bundled. The
request body, the response schema and the timeout are visible in one file,
which matters for a feature that must never see identifiable patient data
without an explicit legal basis.

**The prediction service is a separate process.** It can be deployed, scaled,
disabled or deleted without touching the application, and the application is
written so that every screen works with it switched off.

## Lazy database client

`src/db/index.ts` creates the connection on first use, behind a proxy. A
production build imports every route module to collect page data and must not
need a database to do so, and a process that never queries never opens a
connection.

## The edge guard

`src/proxy.ts` redirects a visitor with no session cookie to the sign in page
rather than letting them reach a screen that will fail. It checks only that a
cookie is present. It is a convenience, not a control: every page and every
action resolves the session against the database and checks permissions on
the server, whatever the edge decided.

This file used to be `middleware.ts`. Next 16 renamed the convention to
`proxy` and reads an export of that name.

## Scheduled work

`src/lib/jobs/runner.ts` holds the only code that changes a referral without a
person acting. It may raise a task, send a reminder or mark an elapsed
appointment as missed. It never acknowledges, never schedules, never closes a
pathway and never makes a clinical judgement. Every job is idempotent, so
running the runner twice in one window changes nothing the second time.

The runner is invoked by `POST /api/jobs/run`, protected by a shared secret.
When that secret is not configured the endpoint refuses every request rather
than running unauthenticated.

## Integration posture

Every optional integration follows the same rule: when it is not configured,
the feature degrades to a manual workflow and says so in the interface.
Nothing is simulated, and nothing that was not sent is ever reported as
delivered. `integrations()` in `src/lib/env.ts` is the single place that
reports what is configured, and the administration screen shows it.

## Error handling

`src/lib/errors.ts` defines the error types whose messages are safe to show a
user. Anything else is logged server side with a short reference and replaced
with a generic message. Server actions never throw across the boundary: they
return a discriminated result that the form renders as a field error, a form
error or a success state.
