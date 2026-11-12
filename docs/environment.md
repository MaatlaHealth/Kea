# Environment variables

Every variable is validated on first access by `src/lib/env.ts`. An invalid
configuration produces one readable error listing every problem, rather than a
runtime failure deep in a request.

`.env.example` is the template. It contains placeholders only. There are no
real credentials anywhere in this repository.

## Required

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | none | PostgreSQL connection string. The application will not start without it. |
| `DATABASE_SSL` | `prefer` | `require`, `prefer` or `disable`. Use `require` in any deployed environment. |
| `APP_URL` | `http://localhost:3000` | Public origin. Used in email links and as the default Twilio callback base. |

## Sessions

| Variable | Default | What it does |
| --- | --- | --- |
| `SESSION_COOKIE_NAME` | `kea_session` | Name of the staff session cookie. |
| `SESSION_TTL_HOURS` | `12` | Staff session lifetime. Maximum 720. |
| `PATIENT_SESSION_TTL_MINUTES` | `45` | Patient portal session lifetime. Deliberately short. |

Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV` is
`production`. The patient cookie is scoped to `/portal`.

## Messaging

| Variable | Default | What it does |
| --- | --- | --- |
| `MESSAGING_ENABLED` | `false` | Master switch. While false, messages are queued and never sent. |
| `TWILIO_ACCOUNT_SID` | none | Twilio account identifier. |
| `TWILIO_AUTH_TOKEN` | none | Twilio auth token. Also used to verify webhook signatures. |
| `TWILIO_SMS_FROM` | none | SMS sender. Not needed if a messaging service SID is set. |
| `TWILIO_MESSAGING_SERVICE_SID` | none | Preferred SMS sender configuration. |
| `TWILIO_WHATSAPP_FROM` | none | WhatsApp sender in E.164 form, without the `whatsapp:` prefix. |
| `TWILIO_WEBHOOK_URL` | none | Public base URL Twilio calls back on. Must match the console exactly. |

**Without them:** every message is still recorded with status `queued`, the
messages screen shows a banner explaining that messaging is not configured,
and nothing is reported as delivered. Coordinators contact patients by
telephone and record the attempt.

## Assisted drafting

| Variable | Default | What it does |
| --- | --- | --- |
| `AI_ASSIST_ENABLED` | `false` | Master switch. Off by default. |
| `GEMINI_API_KEY` | none | API key. |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Model identifier. |

**Without them:** the assisted drafting control does not appear, and the
manual workflow is complete on its own. See [ai.md](ai.md) before enabling
this with real patient data.

## Prediction service

| Variable | Default | What it does |
| --- | --- | --- |
| `PREDICTION_ENABLED` | `false` | Master switch. Off by default. |
| `PREDICTION_SERVICE_URL` | none | Base URL of the service. |
| `PREDICTION_SERVICE_TOKEN` | none | Shared secret, sent as a bearer token. |

**Without them:** the referral screen shows that the prediction service is
off, and coordination priority comes from the operational rules only.

## Operational email

| Variable | Default | What it does |
| --- | --- | --- |
| `SMTP_URL` | none | SMTP connection string, for example `smtps://user:pass@smtp.example.org:465`. |
| `SMTP_FROM` | none | From address. |
| `PILOT_ENQUIRY_NOTIFY_EMAIL` | none | Where pilot enquiries are notified. |

Operational email is used for staff invitations, password resets and pilot
enquiry notifications. It is never used for patient messages, and no clinical
content is ever placed in an email body.

**Without them:** an invitation is created and the link is shown to the
administrator to pass on directly; a password reset is recorded but no email
is sent; a pilot enquiry is stored and can be read from the database.

## Scheduled jobs

| Variable | Default | What it does |
| --- | --- | --- |
| `JOB_RUNNER_TOKEN` | none | Shared secret for `POST /api/jobs/run`. |

**Without it:** the endpoint refuses every request. It never runs
unauthenticated.

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Logging

| Variable | Default | What it does |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. |

## Script only variables

Read by command line scripts, never by the running application.

| Variable | Used by | Notes |
| --- | --- | --- |
| `KEA_ADMIN_EMAIL` | `npm run admin:create` | Required. |
| `KEA_ADMIN_NAME` | `npm run admin:create` | Required. |
| `KEA_ADMIN_ORG` | `npm run admin:create` | Required. |
| `KEA_ADMIN_PASSWORD` | `npm run admin:create` | Optional. One is generated and printed once if unset. |
| `KEA_DEMO_PASSWORD` | `npm run seed:demo`, `npm run test:e2e` | Optional for the seed, required for the end to end suite. |

## Secrets handling

- Secrets are read only on the server. No secret is referenced from a client
  component, and none is prefixed `NEXT_PUBLIC_`.
- `.gitignore` excludes every `.env*` file except `.env.example`.
- The secret scan in `.github/workflows/security.yml` checks the working tree
  and the full history on every push.
- Rotating `TWILIO_AUTH_TOKEN` invalidates in flight webhook signatures.
  Rotate during a quiet window and update the Twilio console in the same step.
- Rotating `SESSION_COOKIE_NAME` signs everyone out, which is a deliberate way
  to end every session at once.
