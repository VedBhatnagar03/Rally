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

```bash
npm run check
```

`npm run check` generates Prisma, lints, builds, runs tests, and checks npm advisories at moderate severity or higher.

With the API running against a local database:

```bash
npm run smoke
```

## Health Checks

- `GET /health`: process is alive.
- `GET /ready`: process can reach the database.

## Production Deploy Shape

1. Build the Docker image.
2. Set production environment variables from a secret manager.
3. Run `npm run prisma:deploy` against the production database.
4. Start the container as a non-root user.
5. Point the load balancer readiness probe at `/ready`.

## Required Production Secrets

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `ADMIN_EMAILS`

## Incident Notes

- Auth failures are intentionally generic.
- Password hashes and verification token hashes must never appear in API responses.
- Audit logs should be retained and exported before deleting production databases.
