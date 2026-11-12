# Demonstration environment

A safe, isolated environment for reviewers and prospective pilot institutions.
Everything in it is fictional.

## Safeguards

- The organisation is created with `environment = 'demonstration'` and
  `is_synthetic = true`.
- Every patient registered under it is marked synthetic, which is what makes
  the interface show a "Fictional record" badge on the patient and on every
  referral.
- The application shell shows a banner reading "Demonstration environment,
  synthetic records only" on every screen.
- The seed **refuses to run** against an organisation that exists and is not
  marked as a demonstration environment.
- There is no account with a fixed password. The password is generated and
  printed once, or taken from `KEA_DEMO_PASSWORD`.
- Fictional phone numbers use the `+2760000010x` range and the email
  addresses use the reserved `.invalid` top level domain, so neither can
  reach a real person.

Demonstration data must never be loaded into a database that holds real
patient records. Use a separate database.

## Setting it up

```bash
npm run db:migrate
npm run seed:reference
KEA_DEMO_PASSWORD='choose-a-strong-one' npm run seed:demo
npm run dev
```

## What the seed creates

**Organisation:** Kea Demonstration Health Service

**Facilities**

| Code | Name | Type |
| --- | --- | --- |
| RVC | Riverside Clinic | Primary health clinic |
| MKC | Makole Community Health Centre | Community health centre |
| TDH | Thabelo District Hospital | District hospital |
| NRH | Nkosi Regional Hospital | Regional hospital |

**Pathways:** RVC and MKC may refer to TDH and NRH; TDH may refer to NRH.

**Staff**

| Email | Role | Scope |
| --- | --- | --- |
| `demo.admin@kea.invalid` | Organisation administrator | Whole organisation |
| `demo.nurse@kea.invalid` | Nurse or midwife | Riverside Clinic |
| `demo.nurse2@kea.invalid` | Nurse or midwife | Makole CHC |
| `demo.clinician@kea.invalid` | Receiving clinician | Thabelo District Hospital |
| `demo.specialist@kea.invalid` | Receiving clinician | Nkosi Regional Hospital |
| `demo.coordinator@kea.invalid` | Referral coordinator | Whole organisation |
| `demo.analyst@kea.invalid` | Programme analyst | Whole organisation |

**Patients:** eight synthetic records with pregnancy episodes and consent.

**Referrals:** eight scenarios covering a completed pathway, one awaiting
acknowledgement, one booked, one missed and rebooked with recorded outreach,
one rejected with a reason, one escalated, one draft, and one awaiting
closure.

## The seed is not a script of screenshots

The seed does not insert referral rows. It calls `registerPatient`,
`createReferral` and `transitionReferral`, the same functions the interface
calls. The demonstration therefore exercises the real state machine, the real
authorisation checks and the real audit trail.

A transition the product would refuse fails in the seed too. When the seed
tries to book an appointment in the past, the service rejects it, which is
why the seed books a near future slot and then records attendance on it.

## Suggested walkthrough

Roughly fifteen minutes.

### 1. The nurse registers a patient (3 minutes)

Sign in as `demo.nurse@kea.invalid`.

- `/app/patients/new`. Point out what is **not** asked for: no identity
  number, no race, no income. The form says so.
- Enter a name and date of birth that match an existing patient. The duplicate
  warning appears and the submit button stays disabled until the clinician
  confirms it is a different person.
- Complete the registration. The record shows the "Fictional record" badge.

### 2. The nurse creates a referral (2 minutes)

- From the patient, choose **New referral**.
- The receiving facility list contains only the facilities on Riverside
  Clinic's pathway. Explain why that restriction exists.
- Submit. A reference is allocated and the status becomes Submitted.
- Show the **Messages** panel: a message is queued, not sent, because
  messaging is not configured. Point out that nothing is reported as
  delivered.

### 3. The nurse cannot act for the hospital (1 minute)

- On the referral, the available actions are Cancel referral only. There is no
  Acknowledge button, because the state machine will not allow it from this
  side. This is the point where a reviewer sees that authorisation is real.

### 4. The hospital acknowledges and books (3 minutes)

Sign in as `demo.clinician@kea.invalid`.

- `/app/inbox`, oldest first. Open the referral.
- Acknowledge it. The clock stops and the acknowledgement task resolves.
- Schedule an appointment. A message is queued for the patient containing the
  facility, date and time, and nothing clinical.

### 5. The missed visit and the coordinator (3 minutes)

Still as the clinician, record a missed appointment on referral `KEA-...` for
Dimakatso Seleka, or use the one the seed already created.

Sign in as `demo.coordinator@kea.invalid`.

- `/app/coordination`. Six queues, with counts.
- Open the missed appointment task. Two contact attempts are already recorded
  with their outcomes.
- Record another attempt, then resolve the task with an outcome and a note.
  Nothing leaves the queue without a person recording what happened.

### 6. Care outcome and the loop closing (2 minutes)

As the clinician, record attendance and then the care outcome.

As the nurse, open the same referral: the outcome is visible without anyone
telephoning.

### 7. Analytics (1 minute)

Sign in as `demo.analyst@kea.invalid`.

- The analyst lands on `/app/analytics`, because the role has no clinical
  permissions at all.
- Try `/app/patients`. Access is refused.
- On the analytics screen, show the "How these figures are calculated" panel
  and the suppression notice.

### 8. The patient view (optional)

The portal sends a one time code by SMS, so it needs messaging credentials.
Without them the code is recorded in the `messages` table with status
`queued`, and in a demonstration environment it can be read from there:

```sql
select body, created_at from messages
where template_key = 'portal_access_code'
order by created_at desc limit 1;
```

Then sign in at `/portal/sign-in` with `+27600000101`.

## Resetting

```sql
-- Removes the whole demonstration organisation and everything under it.
delete from organisations where slug = 'kea-demonstration';
```

Foreign keys cascade from the organisation, except where a restrict is
deliberate. If the delete is refused, the restrict is telling you a clinical
row still references it, which is the behaviour a real deployment wants.
Re-run `npm run seed:demo` afterwards.

## What the demonstration does not show

- Live SMS or WhatsApp delivery, unless Twilio credentials are configured.
- A validated prediction. The model is trained on synthetic data and the panel
  says so.
- Assisted drafting, unless a Gemini key is configured.
