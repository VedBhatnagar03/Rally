# Security Policy

## Current Security Baseline

- UIUC-only registration at the auth boundary.
- Versioned 18+ and policy attestation is required at registration.
- Email verification required before login.
- Passwords hashed with Argon2id.
- Verification tokens are opaque and stored only as SHA-256 hashes.
- Password reset tokens are single-use, expire after one hour, and are stored only as SHA-256 hashes.
- JWT access tokens are short-lived and carry only `sub` and `email`.
- Secrets live in environment variables and `.env` is ignored.
- CORS is explicitly configured through `CORS_ORIGIN`.
- Helmet sets defensive HTTP headers.
- Global rate limiting is enabled.
- Sensitive authentication routes have tighter per-route rate limits.
- Request bodies are capped at 1 MB.
- Authentication events are written to `AuditLog`.
- Unexpected 5xx failures create sanitized, admin-only operational incidents.
- Founder-console routes require a current database-backed `ADMIN` role.
- Authenticated users can export their own account data without token hashes or private reports about them.
- Blocks are enforced in discovery and direct Rally creation.
- Prisma is the database access layer for request handlers.
- `npm audit --audit-level=moderate` is part of verification.

## Must Do Before Production

- Verify the production Resend sender domain and delivery path.
- Use HTTPS-only secure cookies if refresh tokens are enabled for browser sessions.
- Add per-route abuse controls for auth endpoints.
- Add centralized secret management.
- Enable encrypted automated backups and test a restore using the runbook.
- Add external alert delivery for new operational incidents.
- Define structured security and audit-log retention periods.
- Publish reviewed privacy and community materials in the frontend before inviting beta users.

## Reporting Issues

Until the repository has an owner-level security policy on GitHub, report issues directly to the Rally maintainers.
