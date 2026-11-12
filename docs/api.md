# API

Kea has no public REST API for clinical data. Screens call server actions over
the framework's own transport, and the only HTTP routes are the ones that
something outside the browser has to call.

That is a deliberate choice: a public clinical API is a large, separate
security surface, and nothing in a pilot needs one. See
[interoperability.md](interoperability.md) for the route to a FHIR facing API.

## HTTP routes

### `GET /api/health`

Unauthenticated. Reports whether the database is reachable and which
integrations are configured. It exposes no counts, no identifiers and no
credential values.

```json
{
  "status": "ok",
  "database": "ok",
  "latencyMs": 12,
  "integrations": {
    "sms": "off",
    "whatsapp": "off",
    "ai": "off",
    "prediction": "off",
    "email": "configured"
  },
  "time": "2026-11-12T06:00:00.000Z"
}
```

Returns `503` with `"status": "degraded"` when the database cannot be reached.

### `GET /api/documents/{id}`

Requires a staff session. Serves a referral attachment after checking that the
caller has a care relationship with the patient and holds `document:read` at
the facility that grants it. Every read is audited. The response is
`private, no-store` and carries `X-Content-Type-Options: nosniff`.

Returns `404` when the attachment does not exist **or** the caller has no
access, so the route cannot be used to confirm that a document exists.

### `GET /api/analytics/export?range=30|90|180|365`

Requires a staff session with `analytics:export`. Returns a CSV of counts and
rates. It contains no patient identifier, no name and no referral reference,
and it applies the same small cell suppression as the screen.

### `POST /api/jobs/run`

Requires `Authorization: Bearer <JOB_RUNNER_TOKEN>`. Runs every scheduled job
and returns what each one did.

```json
{
  "ranAt": "2026-11-12T06:00:00.000Z",
  "results": [
    { "job": "acknowledgement_overdue", "processed": 2 },
    { "job": "missed_appointment", "processed": 1 },
    { "job": "appointment_reminders", "processed": 5 },
    { "job": "communication_failures", "processed": 0 },
    { "job": "overdue_follow_ups", "processed": 3 },
    { "job": "message_dispatch", "processed": 5, "detail": "7 considered, 2 still queued, 0 failed" },
    { "job": "maintenance", "processed": 1 }
  ]
}
```

When `JOB_RUNNER_TOKEN` is not set the endpoint returns `401` for every
request. It never runs unauthenticated. `GET` is accepted as well as `POST`
so that a scheduler which can only issue `GET` still works.

### `POST /api/webhooks/twilio/status`

Twilio delivery status callback.

1. The `X-Twilio-Signature` header is verified against the configured URL and
   the sorted POST parameters before anything is read from the body. An
   invalid signature is audited and returns `403`.
2. The event identifier (`MessageSid` plus `MessageStatus`) is inserted into
   `webhook_deliveries`. A duplicate is acknowledged and ignored.
3. The message status and its event history are updated.

### `POST /api/webhooks/twilio/inbound`

Inbound patient messages. Same signature verification and replay protection.

- `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END` and `QUIT` add an opt out
  for that address and channel.
- `START`, `UNSTOP` and `YES` remove it.
- The message is stored against the patient when the sending number matches a
  record. A message from an unrecognised number is **not** stored: there is no
  organisation it could legitimately be filed under.

The response is an empty TwiML document, which tells Twilio not to send an
automatic reply. Any reply to a patient comes from Kea's own consented
templates or from a person.

## Server actions

Actions live in `src/server/actions`. Each one parses its input with Zod,
resolves the session, calls a service and returns a discriminated result. They
never throw across the boundary.

```ts
type ActionState<TData = undefined> =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: TData }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]>; code?: string; data?: TData };
```

| Module | Actions |
| --- | --- |
| `auth.ts` | `signInAction`, `signOutAction`, `requestPasswordResetAction`, `resetPasswordAction`, `acceptInvitationAction`, `changePasswordAction`, `startMfaEnrolmentAction`, `confirmMfaAction`, `disableMfaAction`, `revokeOtherSessionsAction` |
| `patients.ts` | `registerPatientAction`, `checkDuplicatesAction`, `updatePatientAction`, `recordConsentAction`, `mergePatientsAction` |
| `referrals.ts` | `createReferralAction`, `transitionReferralAction`, `addNoteAction`, `assignCoordinatorAction` |
| `coordination.ts` | `assignTaskAction`, `claimTaskAction`, `recordContactAttemptAction`, `resolveTaskAction`, `createManualTaskAction`, `cancelTasksAction` |
| `admin.ts` | `inviteStaffAction`, `revokeInvitationAction`, `setUserStatusAction`, `changeMembershipAction`, `createFacilityAction`, `createDepartmentAction`, `changePathwayAction`, `saveEscalationPolicyAction` |
| `portal.ts` | `requestPortalCodeAction`, `verifyPortalCodeAction`, `portalSignOutAction`, `respondToAppointmentAction`, `updatePortalPreferencesAction` |
| `ai.ts` | `draftFromNotesAction` |
| `prediction.ts` | `recalculatePredictionAction` |
| `notifications.ts` | `fetchNotifications`, `markAllNotificationsReadAction` |
| `pilot.ts` | `submitPilotEnquiry` |

### Conventions

- **Enumeration resistance.** Sign in, password reset and patient portal code
  requests return the same result whether or not the account exists.
- **Rate limits.** Sign in, password reset, portal codes, pilot enquiries and
  assisted drafting are all limited. See `RATE_LIMITS` in
  `src/lib/rate-limit.ts`.
- **Audit.** Every action that changes a record or reads a patient writes an
  audit entry through the allow list in `src/lib/audit.ts`.
- **Access failures look like absence.** A record the caller may not see is
  reported as not found, never as forbidden.

## The prediction service API

Served by `services/prediction`, not by the application.

### `GET /health`

```json
{
  "status": "ok",
  "model_name": "referral-non-attendance",
  "model_version": "0.1.20261112",
  "feature_set_version": "referral-attendance-v1",
  "algorithm": "logistic_regression",
  "clinically_validated": false,
  "trained_on_real_data": false
}
```

### `GET /features`

Publishes the feature contract, including the list of characteristics that are
excluded by design, so the application and any reviewer can check it.

### `POST /predict`

```json
{
  "feature_set_version": "referral-attendance-v1",
  "features": { "lead_time_days": 21, "travel_distance_km": 48, "...": null }
}
```

Returns the score, the band, the contributing factors and the names of any
features that had to be imputed. A feature set version mismatch returns `409`
rather than a silently incomparable score. An absent model artefact returns
`503`.

The service stores nothing. The application decides whether to persist the
result and whether to show it.
