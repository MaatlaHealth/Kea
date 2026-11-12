# Data governance

This document exists so that an information governance officer can assess Kea
without reading the source code first. It is also the honest list of what has
not been done.

Kea is built with South Africa's Protection of Personal Information Act
(POPIA) in mind. **Kea has not been independently audited for POPIA
compliance.** When a healthcare organisation runs Kea, that organisation is
the responsible party for the information in its deployment.

## What is stored, and why

| Category | Fields | Purpose |
| --- | --- | --- |
| Patient identity | Name, record number, date of birth | Identify the correct person across two facilities and prevent duplicate records |
| Contact | Phone, alternate phone, preferred channel, preferred language | Send appointment and follow-up messages, and allow coordinator outreach |
| Locality | Residential area as free text | Travel context for coordinators. No home coordinates are stored at any point |
| Pregnancy episode | Estimated due date, last menstrual period, gravidity, parity, booking date | Context the receiving facility needs to prioritise and prepare |
| Referral clinical content | Reason, priority, observations, requested actions, notes, attachments | Communicate the clinical question to the receiving team |
| Workflow events | Status changes, appointments, attendance, tasks, contact attempts, escalations | Make each handover accountable and allow pathway reporting |
| Consent | Type, status, method, who captured it, when | Establish a lawful basis for each category of message before it is sent |
| Emergency contact | Name and number, optional | Reach someone when the patient cannot be reached, where she has agreed |
| Staff and audit | Account details, role assignments, sessions, audit events | Enforce least privilege and provide an accountable record |

### Not collected

There is no field for a national identity number, race, religion, income,
immigration status or sexual orientation. None of them are needed to
coordinate a maternal referral. The prediction service does not use protected
characteristics even where they might be predictive.

## Minimisation in practice

- Patient registration asks for the fields above and nothing else. The form
  states what is not collected.
- The audit trail passes metadata through an allow list, so a patient name,
  phone number or clinical detail cannot enter it even by mistake. A test
  asserts this.
- The record change history stores **field names only**, never values.
- Message templates are fixed and may reference a facility, a date and a time.
  A test asserts that no template body contains a clinical term and that no
  template declares a variable that could carry one.
- In application notifications carry a referral reference, never a patient
  name. A test asserts this.
- Analytics queries read counts and timestamps. The export contains no
  identifier, no name and no reference.
- The prediction service receives a feature vector and stores nothing.

## Who can see what

Access follows care relationships, not job titles alone.

1. A user may read a patient when the patient is registered at a facility they
   work in, **or** when a referral links that patient to such a facility.
2. A role granted at one facility grants nothing at another, and a role in one
   organisation grants nothing in another.
3. A programme analyst can read aggregate reporting and has no patient access
   anywhere in the product.
4. A patient sees their own appointments, their referral progress in plain
   language, and notes a clinician has explicitly shared. They never see staff
   notes, internal scores or clinical detail that has not been shared.

An access failure is reported as "not found", so the interface cannot be used
to confirm that a particular person has a record.

## Audit

Every patient record view, every referral status change, every consent change
and every administrative action writes an audit entry with the actor, the
action, the resource, the outcome and the time. Entries contain no clinical
content.

Organisation and facility administrators can read the audit log in the
product. It is searchable and paginated.

## Consent

Consent is captured per category and stored append only, so the history is
visible:

| Type | Covers |
| --- | --- |
| `data_processing` | Recording and sharing details with the facility the patient is referred to |
| `appointment_messaging` | Confirmations and reminders |
| `follow_up_messaging` | Contact after a missed visit, or when follow-up is due |
| `third_party_sharing` | Any sharing beyond the referral pathway |

A message is only sent when the matching consent is the latest record and is
granted. A patient can change this themselves in the portal, by replying STOP
to an SMS, or by asking staff.

## Retention and deletion

Retention is configured by the deploying organisation in line with the record
keeping rules that apply to it. South African public health services are
typically subject to multi year retention for maternity records; set your
schedule accordingly.

The schema supports:

- soft deletion of a patient record (`patients.deleted_at`), which removes it
  from every query path immediately;
- hard deletion of attachment contents while keeping the metadata;
- redaction of contact details while preserving the non-identifying workflow
  events needed for aggregate reporting;
- duplicate linkage rather than destruction, so existing referrals keep their
  history.

An automated retention job is **not** implemented. A deployment must run its
own schedule against the documented schema.

## Disclosure control in reporting

Any rate whose denominator is below five is withheld and shown as suppressed,
on the screen and in the export. Counts are still shown. The threshold is
`SMALL_CELL_THRESHOLD` in `src/lib/analytics/queries.ts`.

## Implemented controls

- Server side authorisation on every action, scoped to organisation and
  facility
- Record level access following the referral relationship
- Passwords hashed with scrypt; session tokens stored only as SHA-256 digests
- Optional TOTP multifactor authentication, with session revocation on
  password change
- Account lockout after repeated failed sign ins
- Audit events excluding clinical content
- Consent checks and opt out handling before every message
- Verified Twilio webhook signatures and idempotent callback processing
- Rate limiting on sign in, password reset, portal codes, enquiries and
  assisted drafting
- Content security policy, frame denial, strict transport security,
  `nosniff`, a restrictive permissions policy
- Attachments served only through an authenticated, audited route with
  `no-store`
- Small cell suppression on analytics
- Synthetic records flagged in the database and labelled in the interface
- Dependency audit, secret scanning and CodeQL on every push

## Outstanding before real patient data

| Item | Status |
| --- | --- |
| Independent penetration test and security review | **Not done.** Required. |
| Privacy impact assessment | **Not done.** For the responsible party to complete, informed by this document. |
| Data processing agreements with hosting, database and messaging providers | **Not done.** Required before live use. |
| Clinical sign off of reason categories, thresholds and message templates | **Not done.** A named clinical lead must approve them. |
| Clinical validation of the prediction service | **Not done.** The model is trained on synthetic data. |
| Automated retention and deletion job | **Not implemented.** Schema supports it; the schedule does not exist. |
| Backup, restore and retention procedures | **Documented, not operated.** Each deployment must implement and test them. |
| Incident response and breach notification process | **Not defined.** A POPIA obligation for the responsible party. |
| Independent accessibility audit | **Not done.** Automated WCAG checks run in CI; an audit has not been commissioned. |
| Database row level security | **Not enabled.** Authorisation is enforced in the application. See `docs/database.md`. |
| Formal interoperability conformance testing | **Not done.** See `docs/interoperability.md`. |

## Breach response, in outline

This is a starting point, not a policy. The responsible party must write its
own.

1. Contain: suspend affected accounts, revoke sessions
   (`revokeAllSessionsForUser`), rotate credentials.
2. Assess: use the audit log to establish which records were accessed, by
   whom and when.
3. Notify: POPIA requires notification to the Information Regulator and to
   affected data subjects as soon as reasonably possible after discovery.
4. Remediate and record: fix the cause, write it up, and feed it back into
   this document.
