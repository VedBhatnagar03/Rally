# Rally Backend

Secure backend infrastructure for Rally, a UIUC-first racket-sport dating and social discovery product.

Rally's core loop:

1. UIUC student signs up with an `@illinois.edu` email.
2. Student completes identity, dating intent, sports, skill, availability, and trust profile.
3. Rally recommends compatible people based on sport overlap, availability, preferences, skill, and campus logistics.
4. A student sends a Rally invite for a sport and suggested time.
5. If accepted, Rally generates a scheduled plan with venue guidance and court-booking handoff.
6. After the session, both users privately decide whether they want to Rally again.

## Stack

- Node.js + TypeScript
- Fastify API server
- Next.js + React frontend in `web/`
- Prisma + PostgreSQL
- Zod environment validation
- JWT access tokens
- Argon2 password hashing
- Helmet, CORS, rate limiting, request IDs, structured logging
- Docker production image
- Vitest test runner

## Quick Start

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run prisma:generate
npm run prisma:migrate
npm run dev
npm run dev --prefix web
```

Health checks:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/ready
```

Frontend:

```bash
cp web/.env.example web/.env.local
npm install --prefix web
npm run dev --prefix web
```

## Security Defaults

- UIUC-only signup enforced at the auth boundary.
- Passwords are hashed with Argon2id.
- JWT payloads are minimal and short-lived.
- CORS is environment driven.
- Rate limiting is enabled globally.
- Request bodies are capped.
- Secrets are never committed.
- Prisma queries are used instead of handwritten SQL in request handlers.

## API Surface

Current foundation:

- `GET /health`
- `GET /ready`
- `POST /v1/auth/register`
- `POST /v1/auth/verify-email`
- `POST /v1/auth/login`
- `GET /v1/me`
- `PUT /v1/me/profile`
- `GET /v1/recommendations`
- `GET /v1/rallies/suggestions/:receiverId`
- `POST /v1/rallies`
- `POST /v1/rallies/:rallyId/respond`
- `GET /v1/rallies`
- `POST /v1/rallies/:rallyId/court-booking`
- `POST /v1/feedback/rallies/:rallyId`
- `POST /v1/safety/blocks`
- `POST /v1/safety/reports`
- `POST /v1/analytics/events`
- `GET /v1/venues`
- `GET /v1/admin/summary`
- `GET /v1/admin/reports`

## Development Notes

This repo starts with a secure backend spine. It intentionally does not automate Active Illini court reservations. V1 treats court booking as a guided handoff: Rally suggests a sport, venue, and time, then stores the booking status and confirmation details once a user reserves through the official campus workflow.

## Verified Local Flow

```bash
docker compose up -d postgres redis
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

In development, `POST /v1/auth/register` returns a `devVerificationToken` so the team can test email verification without an email provider. Production responses never include that token.
