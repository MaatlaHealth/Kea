# Database

The schema is defined in TypeScript in `src/db/schema.ts`. Migrations are
plain SQL under `src/db/migrations`, generated from the schema and reviewable
before they run.

```bash
npm run db:generate    # after editing the schema, writes a new migration
npm run db:migrate     # applies pending migrations
npm run db:studio      # browse the data
```

Never edit a migration that has been applied anywhere. Generate a new one.

## Design rules

1. **Every clinical row carries `organisation_id` and a facility reference**,
   so an authorisation predicate is an indexed comparison rather than a join
   chain.
2. **Status lives in two places on purpose.** The current status is a column
   on the parent row for query speed; the full history is an append only
   event table. The event table is never updated or deleted.
3. **Anything that accepts external input carries an idempotency key.**
   Messages, webhook deliveries and automatic tasks all have one, so a retried
   job or a replayed callback changes nothing the second time.
4. **Timestamps are `timestamptz`** throughout. Dates that are genuinely dates
   (date of birth, estimated due date) are `date`.
5. **Deletion is soft where history matters.** Patients and documents carry
   `deleted_at`; referrals are closed or cancelled, never removed.

## Entity groups

### Organisations and facilities

| Table | Purpose |
| --- | --- |
| `organisations` | Tenant boundary. `environment` is `live` or `demonstration`; `is_synthetic` marks a whole organisation as fictional. |
| `facilities` | Clinics, hospitals and units. Optional coordinates, used only to estimate travel distance between facilities. |
| `departments` | Services inside a facility that accept referrals. |
| `referral_pathways` | Which facility may refer to which. A referral outside an active pathway is refused. |

### People and access

| Table | Purpose |
| --- | --- |
| `users` | Staff accounts. `password_hash` is scrypt; `mfa_secret` is a TOTP secret. |
| `memberships` | Role assignment. A null `facility_id` means the role applies across the organisation. |
| `sessions` | Staff sessions. Only the SHA-256 digest of the token is stored. |
| `invitations` | Pending staff invitations. Only the digest of the token is stored. |
| `password_reset_tokens` | Single use, one hour lifetime, digest only. |

The partial unique indexes on `memberships` prevent the same role being
granted twice at the same scope, including the organisation wide case where a
plain composite unique index would not catch it because the facility is null.

### Patients

| Table | Purpose |
| --- | --- |
| `patients` | Demographics and contact preferences. Unique record number per organisation. |
| `patient_identifiers` | Additional identifiers, unique per organisation and system. |
| `patient_record_changes` | Change history. Records **field names only**, never values, so it is safe to display widely. |
| `pregnancy_episodes` | One active episode per patient, enforced by a partial unique index. |
| `encounters` | Screening and clinical visits. |
| `consent_records` | Append only. Consent is the latest row for a patient and type. |

There is no column for a national identity number, race, income or
immigration status. A deployment that needs one must add it under its own
legal basis.

### Referrals

| Table | Purpose |
| --- | --- |
| `referrals` | The pathway record. `reference` is globally unique and human readable. |
| `referral_status_events` | Append only history of every transition, with actor, facility, note and time. |
| `appointments` | Bookings. A rebooking supersedes its predecessor rather than overwriting it. |
| `clinical_notes` | Attributed, permanent. `visible_to_patient` controls portal disclosure. |
| `documents` + `document_blobs` | Attachment metadata and contents. Contents are in the database so they share the clinical record's backup, retention and access rules. |

### Coordination

| Table | Purpose |
| --- | --- |
| `escalation_policies` | Per organisation default plus optional per facility overrides. |
| `follow_up_tasks` | Coordination queue. `dedupe_key` is uniquely indexed, so a repeated trigger produces one task. |
| `contact_attempts` | Every outreach attempt, successful or not. |
| `escalations` | Raised and resolved escalations, linked to a referral and usually a task. |

### Communication

| Table | Purpose |
| --- | --- |
| `message_templates` | The published record of what the product can send. |
| `messages` | Outbound and inbound. `idempotency_key` is uniquely indexed. |
| `message_events` | Delivery status history, unique per provider event. |
| `webhook_deliveries` | Every provider callback identifier, so a replay is ignored. |
| `opt_outs` | Per organisation, address and channel. |
| `notifications` | In application notifications for staff. Carry a referral reference, never a patient name. |

### Patient portal

| Table | Purpose |
| --- | --- |
| `patient_access_codes` | One time codes, digest only, with an attempt counter. |
| `patient_sessions` | Short lived portal sessions, digest only. |

### Model governance

| Table | Purpose |
| --- | --- |
| `model_versions` | Every model the service has served, with `trained_on_real_data` and `clinically_validated` flags. |
| `predictions` | One row per referral and model version, with the score, band, contributing factors and missing inputs. |

### Operations

| Table | Purpose |
| --- | --- |
| `audit_events` | Who did what to which record. Metadata passes through an allow list, so no clinical content or patient name can enter it. |
| `pilot_enquiries` | Submissions from the public website. |
| `rate_limit_counters` | Fixed window counters, keyed by action and subject. |

## Relationships that matter

```
organisations 1─* facilities 1─* departments
organisations 1─* patients 1─* pregnancy_episodes
patients 1─* referrals *─1 facilities (referring)
                    *─1 facilities (receiving)
referrals 1─* referral_status_events        (append only)
referrals 1─* appointments
referrals 1─* follow_up_tasks 1─* contact_attempts
referrals 1─* messages 1─* message_events
referrals 1─* predictions *─1 model_versions
```

## Indexes

Indexes follow the queries the product actually runs:

- `referrals_receiving_status_idx` and `referrals_referring_status_idx` serve
  the inbox and the referral list, which always filter by facility and status.
- `follow_up_tasks_facility_status_idx` serves the coordination queue, which
  always filters by facility and status and orders by due time.
- `appointments_facility_date_idx` serves the appointments screen.
- `audit_events_org_idx` and `audit_events_resource_idx` serve the audit log.
- `messages_status_idx` serves the dispatch job, which selects due messages.

## Transactions

These operations are transactional and will not partially apply:

- Creating a referral: reference allocation, the referral row, the first
  status event, the acknowledgement task, the queued message and the audit
  entry.
- Every status transition, including its side effects.
- Registering a patient: the patient, the pregnancy episode, the consent rows,
  the change history entry and the audit entry.
- Storing a document: metadata, contents and the audit entry.

The referral row is locked with `select ... for update` at the start of a
transition, so two staff acting at the same moment cannot interleave.

## Row level security

Authorisation is enforced in the application, in one place, on every path.
PostgreSQL row level security is **not** currently enabled, because the
application connects as a single role and the policy would have to be driven
by a session variable set by that same application, which adds a layer without
adding an independent guarantee.

A deployment that wants defence in depth at the database should: create a
restricted role per application instance, set `app.current_user_id` at the
start of each transaction, and add policies mirroring `findPatientAccess`.
That work is not done here, and we do not claim it is.
