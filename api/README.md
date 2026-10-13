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
docker compose up -d
npm run storage:init
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
- `GET /v1/policies/current`
- `POST /v1/auth/register`
- `POST /v1/auth/verify-email`
- `POST /v1/auth/forgot-password`
- `POST /v1/auth/reset-password`
- `POST /v1/auth/login`
- `GET /v1/me`
- `POST /v1/me/policy-consent`
- `GET /v1/me/export`
- `PUT /v1/me/profile`
- `GET /v1/profile-options/prompts`
- `POST /v1/me/photos/upload-intents`
- `POST /v1/me/photos/upload-intents/:uploadId/complete`
- `PATCH /v1/me/photos/order`
- `DELETE /v1/me/photos/:photoId`
- `GET /v1/recommendations`
- `GET /v1/rallies/suggestions/:receiverId`
- `POST /v1/rallies`
- `POST /v1/rallies/:rallyId/respond`
- `POST /v1/rallies/:rallyId/schedule`
- `POST /v1/rallies/:rallyId/complete`
- `POST /v1/rallies/:rallyId/cancel`
- `GET /v1/rallies`
- `GET /v1/rallies/:rallyId`
- `POST /v1/rallies/:rallyId/court-booking`
- `POST /v1/feedback/rallies/:rallyId`
- `GET /v1/notifications`
- `PATCH /v1/notifications/:notificationId/read`
- `POST /v1/notifications/read-all`
- `POST /v1/safety/blocks`
- `POST /v1/safety/reports`
- `POST /v1/analytics/events`
- `GET /v1/venues`
- `GET /v1/admin/summary`
- `GET /v1/admin/reports`
- `GET /v1/admin/incidents`
- `PATCH /v1/admin/incidents/:incidentId/resolve`

## Development Notes

This repo starts with a secure backend spine. It intentionally does not automate Active Illini court reservations. V1 treats court booking as a guided handoff: Rally suggests a sport, venue, and time, then stores the booking status and confirmation details once a user reserves through the official campus workflow.

The shared Next.js app can run its backend harness against this service by setting `NEXT_PUBLIC_RALLY_DATA_SOURCE=fastify` in the root `.env.local`. For local harness use only, set `DEV_TOOLS_ENABLED=true` in `api/.env`; this enables `/v1/dev/*` profile listing and session minting. Those routes return `404` in production or whenever the flag is off.

## Verified Local Flow

```bash
docker compose up -d
npm run storage:init
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

In development, `POST /v1/auth/register` returns a `devVerificationToken` so the team can test email verification without an email provider. Production responses never include that token.

Profile photos use private presigned uploads. The API decodes, rotates, bounds, strips metadata from, and converts each image to WebP before publishing it. The local Compose stack provides S3-compatible storage through VersityGW; run `npm run storage:init` after first startup. Production may use any S3-compatible provider with the photo-storage environment variables.

Onboarding supports up to three answers from the reviewed prompt catalog and up to twelve short interests. Recommendations return the candidate's public discovery profile while withholding email, exact availability, and dating-filter preferences.
