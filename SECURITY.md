# Security policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through GitHub's private vulnerability reporting on the
repository: **Security** tab, then **Report a vulnerability**. That channel
is monitored and keeps the report confidential until a fix is available.

If private reporting is unavailable to you, open a public issue containing
only the words "security report, please provide a private channel" with no
detail, and a maintainer will respond with one.

### What to include

- What the issue is and roughly how severe you think it is.
- Steps to reproduce, or a proof of concept.
- The affected version or commit.
- Whether you believe it is being exploited.

### What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement | 3 working days |
| Initial assessment | 10 working days |
| Fix for a critical issue | 30 days, or a documented mitigation |
| Public disclosure | After a fix is available, coordinated with you |

We will credit you in the release notes unless you prefer otherwise.

### Please do not

- Access, modify or retain data that is not yours.
- Run denial of service or load tests against a deployed instance.
- Social engineer anyone.
- Test against a live deployment holding real patient data without written
  permission from the operator of that deployment.

Run your testing against your own instance. `docker compose up` gives you one
in a couple of minutes, and `npm run seed:demo` fills it with fictional data.

## Scope

**In scope:** this repository, including the web application, the prediction
service, the database schema, the migrations and the CI configuration.

**Out of scope here:** a specific organisation's deployment, its hosting, its
Twilio account and its database. Report those to that organisation. Issues in
third party dependencies should go to the dependency's own project, though we
would like to know about them too.

## Security posture

### What is implemented

**Authentication.** Passwords hashed with scrypt (N = 2^17, r = 8, p = 1) from
the Node standard library. Session tokens are 256 bits of cryptographic
randomness, stored only as a SHA-256 digest; the raw token exists only in an
`HttpOnly`, `SameSite=Lax`, `Secure` cookie. Optional TOTP multifactor
authentication. Account lockout after eight failed attempts. Password change
revokes every other session.

**Authorisation.** Checked on the server for every action, scoped to
organisation and facility. Record level access follows the care relationship,
not role alone. A role at one facility grants nothing at another, and a role
in one organisation grants nothing in another. Access failures are reported
as "not found".

**Input validation.** Zod at every boundary: forms, webhooks, environment
variables and AI responses.

**Injection.** All database access goes through parameterised queries built
by Drizzle. There is no string concatenation into SQL anywhere in the
codebase.

**Cross site request forgery.** Next.js server actions carry an origin check.
Webhook routes are authenticated by provider signature rather than by
session, so a forged browser request cannot reach them.

**Webhooks.** Twilio signatures are verified before the body is read, against
the exact configured URL and the sorted parameters, using a constant time
comparison. Every callback identifier is recorded, so a replay is ignored.

**Rate limiting.** Sign in (per account and per address), password reset,
patient portal codes, pilot enquiries and assisted drafting.

**Headers.** Content security policy, `X-Frame-Options: DENY`,
`frame-ancestors 'none'`, `nosniff`, `strict-origin-when-cross-origin`,
HSTS with preload, and a permissions policy denying camera, microphone,
geolocation and payment.

**Attachments.** Served only through an authenticated, audited route with
`no-store` and `nosniff`. Content type and size are validated on upload.
There are no public URLs.

**Audit.** Every patient record view, status change and administrative action
is recorded. Metadata passes through an allow list, so clinical content and
patient identifiers cannot enter the audit trail.

**Secrets.** No secret is referenced from a client component and none is
prefixed `NEXT_PUBLIC_`. Secret scanning runs over the full history on every
push.

**Dependencies.** `npm audit` and `pip-audit` run on every push and weekly.
CodeQL analyses both languages.

### What is not done

Stated plainly, because a security policy that only lists strengths is not
useful:

- **No independent penetration test or security review.** This is the single
  most important gap before any deployment holding real patient records.
- **No database row level security.** Authorisation is enforced in the
  application, in one place. See `docs/database.md` for what adding RLS would
  involve.
- **No automated retention or deletion job.** The schema supports erasure;
  the schedule does not exist.
- **No formal threat model document.**
- **No bug bounty.** Reports are still welcome.
- **No independent accessibility audit.** Automated WCAG checks run in CI.
- **No load or denial of service testing.**

The full list, including the governance work a deployment must complete, is
in [docs/data-governance.md](docs/data-governance.md).

## Supported versions

Kea is pre 1.0 and under active development. Security fixes are applied to
`main`. There are no long term support branches yet.

## For operators

If you are running Kea:

- Set `DATABASE_SSL=require`.
- Turn on multifactor authentication for every account that can read patient
  records.
- Set `JOB_RUNNER_TOKEN`. Without it the job endpoint refuses everything,
  which is safe but means nothing runs.
- Keep `MESSAGING_ENABLED` false until you have confirmed a test message end
  to end on a number you control.
- Keep `AI_ASSIST_ENABLED` false unless your governance process has approved
  it against real data.
- Keep `PREDICTION_ENABLED` false outside a research setting.
- Review the audit log regularly, particularly `patient.view` by accounts
  with wide scope.
- Test your restore. See [docs/backup-and-recovery.md](docs/backup-and-recovery.md).
