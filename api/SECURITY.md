# Security Policy

## Current Security Baseline

- UIUC-only registration at the auth boundary.
- Versioned 18+ and policy attestation is required at registration.
- Email verification required before login.
- Passwords hashed with Argon2id.
- Verification tokens are opaque, stored only as SHA-256 hashes, and consumed once with concurrency-safe activation.
- Password reset tokens are single-use under concurrency, expire after one hour, and are stored only as SHA-256 hashes.
- JWT access tokens are short-lived and carry only account identity, role, and authentication version claims.
- Access tokens carry a database-checked authentication version and are invalidated immediately by password resets and account-status changes.
- Browser refresh tokens use `Secure`, `HttpOnly`, `SameSite=Lax` cookies, remain absent from production JSON, and rotate on use.
- Secrets live in environment variables and `.env` is ignored.
- CORS is explicitly configured through `CORS_ORIGIN`.
- Helmet sets defensive HTTP headers.
- Global rate limiting is enabled.
- Sensitive authentication routes have tighter per-route rate limits.
- Request bodies are capped at 1 MB.
- Authentication events are written to `AuditLog`.
- Unexpected 5xx failures create sanitized, admin-only operational incidents.
- Sanitized incident alerts are HMAC-signed, idempotent, and retried from a durable outbox without user identity or raw request content.
- Founder-console routes require a current database-backed `ADMIN` role.
- Authenticated users can export their own account data without token hashes or private reports about them.
- Blocks are enforced in discovery and direct Rally creation.
- Prisma is the database access layer for request handlers.
- `npm audit --audit-level=moderate` is part of verification.
- Backend CI restores a PostgreSQL custom-format backup into a fresh database and runs the complete smoke suite against the restored copy.

## Must Do Before Production

- Verify the production Resend sender domain and delivery path.
- Add centralized secret management.
- Enable provider-managed encrypted backups and point-in-time recovery, then complete the production-like restore drill in the runbook.
- Monitor the scheduled incident-alert delivery worker and rotate its signing secret through the production secret manager.
- Run and monitor the documented retention cleanup schedule; review dry-run counts before changing periods.
- Publish reviewed privacy and community materials in the frontend before inviting beta users.

## Reporting Issues

Until the repository has an owner-level security policy on GitHub, report issues directly to the Rally maintainers.
