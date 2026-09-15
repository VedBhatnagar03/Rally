# Security Policy

## Current Security Baseline

- UIUC-only registration at the auth boundary.
- Email verification required before login.
- Passwords hashed with Argon2id.
- Verification tokens are opaque and stored only as SHA-256 hashes.
- JWT access tokens are short-lived and carry only `sub` and `email`.
- Secrets live in environment variables and `.env` is ignored.
- CORS is explicitly configured through `CORS_ORIGIN`.
- Helmet sets defensive HTTP headers.
- Global rate limiting is enabled.
- Request bodies are capped at 1 MB.
- Authentication events are written to `AuditLog`.
- Founder-console routes require a current database-backed `ADMIN` role.
- Blocks are enforced in discovery and direct Rally creation.
- Prisma is the database access layer for request handlers.
- `npm audit --audit-level=moderate` is part of verification.

## Must Do Before Production

- Add a real email provider for verification delivery.
- Use HTTPS-only secure cookies if refresh tokens are enabled for browser sessions.
- Add per-route abuse controls for auth endpoints.
- Add centralized secret management.
- Add database backups and migration rollback procedure.
- Add Sentry or equivalent error monitoring.
- Add structured security logging retention.
- Add account deletion/export flows before a public launch.

## Reporting Issues

Until the repository has an owner-level security policy on GitHub, report issues directly to the Rally maintainers.
