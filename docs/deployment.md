# Deployment

## Before you deploy anything that will hold real patient data

Work through [data-governance.md](data-governance.md). The short version: an
independent security review, a privacy impact assessment, data processing
agreements with your hosting, database and messaging providers, clinical sign
off of the reason categories, thresholds and message templates, tested
backups, and a defined incident response process. None of those are done by
installing this software.

## Target shape

| Component | Recommended | Notes |
| --- | --- | --- |
| Web application | Vercel, or any container host | Next.js with server actions and route handlers. |
| Database | Supabase, Neon, RDS, or self hosted PostgreSQL 14+ | Must support TLS and point in time recovery. |
| Scheduled jobs | Vercel Cron, GitHub Actions, or any scheduler that can issue an authenticated HTTP request | Every 15 minutes. |
| Prediction service | Optional. Any container host | Can be omitted entirely. |
| Messaging | Twilio | Optional. |

## Vercel

1. Import the repository. The framework preset is detected.
2. Set the environment variables from [environment.md](environment.md) in
   the project settings. At minimum `DATABASE_URL`, `DATABASE_SSL=require` and
   `APP_URL`.
3. Deploy.
4. Apply migrations. The build does not run them, deliberately: a schema
   change should be a decision, not a side effect of a deploy.

   ```bash
   DATABASE_URL='...' npm run db:migrate
   DATABASE_URL='...' npm run seed:reference
   ```

5. Create the first administrator:

   ```bash
   DATABASE_URL='...' KEA_ADMIN_EMAIL=... KEA_ADMIN_NAME='...' KEA_ADMIN_ORG='...' npm run admin:create
   ```

6. Add the cron job. In `vercel.json`:

   ```json
   {
     "crons": [{ "path": "/api/jobs/run", "schedule": "*/15 * * * *" }]
   }
   ```

   Vercel Cron issues a `GET`, which the route accepts. It cannot set an
   `Authorization` header, so for Vercel Cron specifically either put the
   deployment behind Vercel's cron authentication or call the endpoint from an
   external scheduler that can send the bearer token. Do not remove the token
   check.

7. Point Twilio at `https://your-domain/api/webhooks/twilio/status` and
   `.../inbound`, and set `TWILIO_WEBHOOK_URL` to
   `https://your-domain/api/webhooks/twilio` so the signature check matches.

## Containers

```bash
docker build -t kea-web .
docker build -t kea-prediction ./services/prediction

docker run -d --name kea-web -p 3000:3000 \
  -e DATABASE_URL='postgresql://...' \
  -e DATABASE_SSL=require \
  -e APP_URL='https://your-domain' \
  -e JOB_RUNNER_TOKEN='...' \
  kea-web
```

Both images run as a non root user and declare a health check. Apply
migrations from a one off container or a deployment job before routing
traffic to a new version.

## Migrations

Migrations are plain SQL under `src/db/migrations`, applied in order and
recorded in a journal table.

```bash
npm run db:generate   # after a schema change, writes a reviewable SQL file
npm run db:migrate    # applies pending migrations
```

Rules:

- Review every generated file before it runs. The whole reason Drizzle was
  chosen over an ORM with an opaque migration engine is that a hospital IT
  team can read these.
- Never edit a migration that has been applied anywhere.
- Deploy additively: add a nullable column, deploy code that writes it,
  backfill, then make it required in a later migration. A destructive
  migration and a code deploy in the same step cannot be rolled back
  independently.

## Rollback

**Application.** Redeploy the previous build. Vercel keeps previous
deployments and can promote one; with containers, run the previous image tag.
Because migrations are additive, the previous application version continues to
work against the newer schema.

**A bad migration.** There is no automatic down migration, by design: a
generated down migration gives false confidence about data that has already
changed shape. Recovery is:

1. Stop writes, by putting the application in maintenance or scaling to zero.
2. Restore the database to the point in time immediately before the migration.
3. Redeploy the matching application version.
4. Fix the migration and roll forward.

Practise this. A restore you have never run is a plan, not a backup. See
[backup-and-recovery.md](backup-and-recovery.md).

## Health and monitoring

`GET /api/health` returns `200` when the database is reachable and `503` when
it is not. Point your platform's health check at it.

Watch, at minimum:

- `/api/health` returning non `200`.
- The job runner not reporting a run in the last hour.
- Messages sitting in `queued` with `attempt_count` at the maximum.
- Authentication failures spiking for one account or one address.
- Database connection count approaching the pool limit (10 per instance in
  production).

Structured logs go to stdout. They never contain patient names, contact
details, clinical content or message bodies. Before sending logs or errors to
a third party service, check that the destination is covered by your data
processing agreements, and keep request bodies out of it.

## Scaling notes

- The application is stateless. Sessions are in the database, so instances can
  be added and removed freely.
- Each instance opens up to 10 database connections in production. Behind a
  connection pooler, use the pooled connection string.
- The job runner is not safe to run concurrently with itself at high volume.
  Every job is idempotent, so a double run is harmless, but schedule one
  invocation at a time.

## Deployment checklist

- [ ] `DATABASE_SSL=require`
- [ ] `APP_URL` is the real public origin, over HTTPS
- [ ] `JOB_RUNNER_TOKEN` set and the scheduler configured
- [ ] Migrations applied, `npm run seed:reference` run
- [ ] First administrator created, multifactor authentication turned on
- [ ] Facilities, pathways and escalation policies configured
- [ ] Backups configured and a restore tested
- [ ] `MESSAGING_ENABLED` left false until a test message has been confirmed
      end to end on a number you control
- [ ] WhatsApp templates approved by the provider, if WhatsApp is in use
- [ ] `AI_ASSIST_ENABLED` left false unless governance has approved it
- [ ] `PREDICTION_ENABLED` left false outside a research setting
- [ ] Health check wired up and alerting on failure
