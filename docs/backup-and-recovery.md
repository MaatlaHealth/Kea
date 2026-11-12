# Backup and recovery

Kea keeps all of its state in PostgreSQL, including referral attachments.
Backing up the database backs up everything. That is the main reason
attachments live in the database rather than in a separate object store.

None of what follows is automated by this repository. A deployment must
implement it and, more importantly, must test the restore.

## What to back up

| Item | Where | Notes |
| --- | --- | --- |
| The database | PostgreSQL | Includes patients, referrals, audit, attachments. |
| Environment configuration | Your secret store | Not in the repository, and not recoverable from a database backup. |
| The model artefact | `services/prediction/artifacts` | Reproducible with `python -m kea_prediction.train`, so it does not need backing up. |

## Recovery objectives

Agree these with the deploying service and write them down. As a starting
point for a maternal referral service:

| Objective | Suggested | Why |
| --- | --- | --- |
| Recovery point objective | 5 minutes | Losing a referral submitted in the last hour means losing a clinical handover nobody knows is missing. |
| Recovery time objective | 1 hour | Longer than that and facilities revert to paper for the day, which is survivable but has to be planned for. |

A five minute RPO means continuous archiving or point in time recovery, not a
nightly dump.

## Managed providers

Most of this is a configuration task.

**Supabase.** Point in time recovery is available on paid plans; enable it and
set the retention window. Daily backups alone do not meet a five minute RPO.

**Neon.** History retention gives point in time restore within the window.
Set the window to at least seven days.

**RDS or Cloud SQL.** Enable automated backups with a retention period, and
confirm point in time recovery is on. Take a manual snapshot before every
migration.

## Self hosted

Continuous archiving with `pg_basebackup` plus WAL shipping, or a tool such as
pgBackRest or WAL-G. A nightly `pg_dump` is a useful second line but is not a
sufficient primary.

```bash
# Logical dump, as a secondary measure.
pg_dump --format=custom --no-owner --no-privileges \
  --file="kea-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DATABASE_URL"
```

Store dumps encrypted, off the database host, with access restricted to the
people who would perform a restore. A dump of this database contains the
entire patient record set.

## Before every migration

```bash
# Managed: take a manual snapshot through the provider.
# Self hosted:
pg_dump --format=custom --file=pre-migration.dump "$DATABASE_URL"
npm run db:migrate
```

Migrations are additive by convention, so the previous application version
keeps working against the new schema. The snapshot is for the case where a
migration itself is wrong.

## Restoring

```bash
# Logical restore into a fresh database.
createdb kea_restored
pg_restore --no-owner --no-privileges --dbname=kea_restored kea-20261112T060000Z.dump

# Verify before switching traffic.
psql kea_restored -c "select count(*) from referrals;"
psql kea_restored -c "select max(occurred_at) from referral_status_events;"
psql kea_restored -c "select count(*) from document_blobs;"
```

Then point `DATABASE_URL` at the restored database and redeploy the
application version that matches the schema.

## Restore drills

A restore you have never run is a plan, not a backup. Run a drill at least
quarterly and whenever the schema changes materially:

1. Restore the most recent backup into a scratch database.
2. Run `npm run db:migrate` against it and confirm there is nothing pending.
3. Point a staging deployment at it and sign in.
4. Open a referral and confirm its full status history is present.
5. Open an attachment and confirm the bytes are intact.
6. Record how long the whole thing took, and compare it with your RTO.
7. Destroy the scratch database.

Step five matters: a backup strategy that silently drops large objects is a
classic failure, and it is invisible until someone needs a scan result.

## Retention of backups

Backups contain health information and are subject to the same obligations as
the live database. Decide and document:

- how long backups are kept;
- where they are stored, and in which jurisdiction;
- who can access them, and how that access is logged;
- how they are destroyed at the end of the period.

A deletion request satisfied in the live database but not in the backups has
not been satisfied. Decide in advance whether your approach is to re-apply
deletions on restore, or to let backups age out within a defined window, and
write that choice into your privacy notice.

## Data deletion in the live database

The schema supports erasure without destroying the operational record:

```sql
-- Soft delete a patient. Removes them from every query path immediately.
update patients set deleted_at = now() where id = '...';

-- Remove attachment contents while keeping the metadata and the audit trail.
delete from document_blobs where document_id in (
  select id from documents where patient_id = '...'
);
update documents set deleted_at = now() where patient_id = '...';

-- Redact contact details while preserving non-identifying workflow events.
update patients
set phone = null, alternate_phone = null,
    emergency_contact_name = null, emergency_contact_phone = null
where id = '...';
```

Run these inside a transaction, and record the request and the action taken
in your own register. Kea's audit trail records that rows changed; it does not
record why someone asked.

## Disaster scenarios

| Scenario | Response |
| --- | --- |
| Application instance fails | Stateless. Replace the instance. Sessions survive because they are in the database. |
| Database is unreachable | `/api/health` returns 503. Facilities fall back to their existing paper process. Restore or fail over, then verify with the drill steps above. |
| Bad migration | Restore to the point in time immediately before it, redeploy the matching application version, fix the migration, roll forward. |
| Accidental bulk deletion | Point in time recovery to just before the statement. This is the scenario a nightly dump handles badly, which is the argument for continuous archiving. |
| Credential compromise | Rotate the database credential, rotate `TWILIO_AUTH_TOKEN`, revoke every session with `update sessions set revoked_at = now() where revoked_at is null`, then work through the breach steps in [data-governance.md](data-governance.md). |
