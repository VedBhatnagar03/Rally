# Rally Backend Runbook

## Local Development

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

## Verification

Run the static quality gate:

```bash
npm run check
```

With PostgreSQL and the API running, execute the database-backed golden path:

```bash
npm run prisma:deploy
npm run seed
npm run smoke
```

GitHub Actions runs both paths for every backend pull request. It applies all migrations to a clean PostgreSQL 16 database, starts the compiled server, waits for readiness, and runs the smoke suite.

## Real And Test Data

Seeded profile fixtures are persisted with `isTestAccount=true`; normal registration, migrated accounts and founder accounts default to real data. The migration never infers test status from an email address. Rerun the idempotent seed command in existing development or staging environments to classify their fixtures. Founder summary, user, Rally and report endpoints default to `dataScope=REAL`. An administrator may explicitly request `dataScope=TEST` for fixture verification or `dataScope=ALL` for a combined operational view.

Never alter a real account into a test account through ad hoc SQL. Development profile and session routes intentionally expose test accounts only. Do not run the seed command against production unless a reviewed operational procedure explicitly requires test fixtures in that environment.

## Retention And Expired Artifact Cleanup

Run the compiled maintenance command at least hourly as a single scheduled job:

```bash
npm run cleanup:expired
```

Before enabling or changing the production schedule, inspect the eligible row counts without
deleting anything:

```bash
npm run cleanup:expired:dry-run
```

The job removes expired email-verification, password-reset and refresh-token rows. It also deletes
expired private staging-upload objects before removing their `PhotoUpload` rows. Published profile
photos are never targeted. Storage failures leave the database row intact for the next retry and
make the command exit unsuccessfully so operations can alert on incomplete cleanup.

The same bounded job enforces the reviewed beta retention defaults: analytics events after 90 days,
audit logs and resolved operational incidents after 365 days, and resolved or dismissed safety
reports after 730 days. Open/reviewing reports and unresolved incidents are excluded regardless of
age. Configure the periods with `ANALYTICS_RETENTION_DAYS`, `AUDIT_LOG_RETENTION_DAYS`,
`RESOLVED_REPORT_RETENTION_DAYS`, and `RESOLVED_INCIDENT_RETENTION_DAYS`. Review dry-run counts and
take the required backup before reducing any period.

## Health Checks

- `GET /health`: the process is alive.
- `GET /ready`: the process can reach PostgreSQL.
- The production image includes a Docker health check against `/health`.
- The platform or load balancer readiness probe must use `/ready`.

## Required Production Configuration

- `NODE_ENV=production`
- `DATABASE_URL`: TLS-protected production PostgreSQL URL.
- `RATE_LIMIT_MAX`: global per-minute client-IP ceiling. Keep the production value at the reviewed default of `120`; CI uses a higher value only because its full smoke journey originates from one process and IP.
- `*_RETENTION_DAYS`: reviewed data-retention periods documented above. Production validation rejects values outside the safe beta bounds.
- `JWT_SECRET`: independently generated secret of at least 32 characters.
- `CORS_ORIGIN`: exact HTTPS frontend origin; use a comma-separated allowlist only when required.
- `PUBLIC_APP_URL`: exact HTTPS frontend origin used in email links.
- `TRUST_PROXY_HOPS`: exact number of trusted reverse-proxy hops in front of the API. This must be at least `1` in production so client IP rate limits and audit records use the proxy-verified address. Confirm the value with the hosting provider; do not use an unbounded trust setting.
- `PHOTO_STORAGE_*`: S3-compatible private staging and public profile-photo buckets, credentials, endpoint and public asset base URL. Keep the staging bucket private and allow reads only from the published bucket.
- `RESEND_API_KEY` and a verified `EMAIL_FROM` sender.
- `ADMIN_EMAILS`: smallest possible founder/admin allowlist.
- `DEV_TOOLS_ENABLED=false`.
- `INCIDENT_ALERT_WEBHOOK_URL`: HTTPS endpoint for the restricted operations alert receiver.
- `INCIDENT_ALERT_WEBHOOK_SECRET`: independently generated signing secret of at least 32 characters, shared only with the receiver.
- `INCIDENT_ALERT_TIMEOUT_MS`: bounded delivery timeout; keep the reviewed default of `5000` unless the receiver contract requires less.

Production startup rejects insecure frontend origins, the example JWT secret or Resend sender,
an empty/non-UIUC admin allowlist, enabled development tools, missing photo/email credentials,
and an unset trusted-proxy boundary. Validate the final environment by starting the immutable
image before shifting traffic; do not weaken these checks to make a deployment boot.

Store secrets in the hosting provider's secret manager. Never place production values in an image, repository, build log, or committed `.env` file.

Browser login and email verification require an exact configured frontend `Origin` and set the rotating refresh credential as a `Secure`, `HttpOnly`,
`SameSite=Lax` cookie scoped to `/v1/auth`. Production refresh and logout requests must include
browser credentials and an exact `Origin` from `CORS_ORIGIN`; refresh tokens are never returned in
production JSON. Keep the frontend and API on same-site HTTPS origins so the cookie is sent without
weakening its SameSite policy.

## Deploy Procedure

1. Confirm backend CI is green on the exact commit being deployed.
2. Confirm a recent automated database backup exists and record its timestamp.
3. Review new files under `prisma/migrations`; migrations are forward-only and must be safe for existing data.
4. Build the immutable Docker image and review the hosting provider's image scan.
5. Provision the private upload bucket and public published-photo bucket once from a trusted operator environment. `npm run storage:init` creates the required buckets and read-only public policy when the deployment identity is authorized to do so.
6. Run `npm run prisma:deploy` once as a release task, before starting new application replicas.
7. Start the image as its built-in non-root `node` user. Do not run migrations independently in every replica.
8. Wait for `/ready` to return `200`, then shift traffic.
9. Verify registration, login, photo upload/deletion, founder summary, and incident feed without using development routes.
10. Watch 5xx logs and `/v1/admin/incidents` during the initial rollout.

## Backup And Restore

The production database provider should own encrypted automatic backups and point-in-time recovery. Before a schema migration, also take an on-demand snapshot and record its identifier in the deployment notes.

For an authorized manual logical backup from a secure operator machine:

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file rally-predeploy.dump
```

Validate that the output is non-empty and store it in encrypted, access-controlled storage. Never commit a dump; it contains private user and safety data.

Restore only into a new empty database first:

```bash
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" rally-predeploy.dump
```

Run `/ready`, migration status, and the smoke suite against the restored environment before any production cutover.

## Failed Deploy And Migration Recovery

- If the application fails but migrations succeeded, stop traffic to the new image and redeploy the previous image. Confirm it remains compatible with the new schema before shifting traffic.
- Prisma migrations are forward-only in production. Do not delete migration rows or manually mark a failed migration as applied without inspecting the database state.
- Fix a partially applied or unsafe migration with a reviewed corrective migration. Use `prisma migrate resolve` only when the SQL state is known and documented.
- Restore from backup only when forward recovery is unsafe. Preserve audit logs, reports, and operational incidents before destructive recovery.
- After recovery, run `/ready`, the golden-path smoke suite, and inspect open incidents before reopening traffic.

## Incident Response

Run `npm run alerts:deliver` at least once per minute as a single scheduled job. New incidents also
trigger a best-effort immediate delivery after they are persisted. Failed deliveries remain in the
database and retry with a bounded exponential delay for up to ten attempts; the command exits
unsuccessfully when a claimed delivery fails so the scheduler can alert on the alerting path itself.

The receiver gets `operational_incident.created` with incident ID, request ID, method, route
template, status code, error name/code, and timestamp only. It never gets user IDs, request bodies,
headers, query strings, stack traces, or exception messages. Verify `x-rally-signature` as
`sha256=` plus the HMAC-SHA256 hex digest of the exact request body, using a constant-time
comparison. Deduplicate on `x-rally-event-id`; retries intentionally reuse the incident ID.

1. Identify the request ID from the user report, structured server log, or admin incident feed.
2. Check `/v1/admin/incidents?status=OPEN`; records intentionally exclude bodies, headers, stack traces, query strings, and exception messages.
3. Correlate the request ID with restricted server logs. Do not paste private logs into public issues.
4. Contain the problem: suspend affected accounts, pause traffic, or roll back the application when necessary.
5. Resolve the incident through `PATCH /v1/admin/incidents/:incidentId/resolve` with a concise remediation note.

Use `GET /v1/admin/audit-logs` to inspect security-relevant activity. Filter by exact `action` or
`actorUserId`, and follow `nextCursor` for older records. Treat IP addresses, user-agent strings and
audit metadata as private operational data; access them only for a specific support, moderation or
security purpose.
Privileged user-status changes, report decisions and incident resolutions are committed in the same
database transaction as their audit entry. Retrying an identical request does not create a second
audit record or alter the original resolution timestamp. A conflicting second incident resolution
returns `409`; inspect the existing decision before taking any further action.
6. Rotate any secret that may have been exposed and document the decision timeline.

Authentication failures remain intentionally generic. Audit logs and safety records must be retained according to the beta privacy policy and exported before destructive database recovery.
