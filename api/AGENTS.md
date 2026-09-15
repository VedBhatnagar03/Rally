# Rally Agent Guide

## Product Direction

Build Rally as a private UIUC beta for activity-first dating through racket sports. The golden path matters more than broad feature count.

## Commands

- Backend check: `npm run check`
- Backend dev: `npm run dev`
- Backend migration: `npm run prisma:migrate`
- Backend seed: `npm run seed`
- Frontend dev: `npm run dev --prefix web`
- Frontend build: `npm run build --prefix web`

## Boundaries

- Do not automate Active Illini bookings.
- Do not collect UIN, exact residence, live location, or emergency-contact data.
- Do not expose reports, feedback, verification token hashes, password hashes, or one-sided Rally Again answers.
- Do not add payments, chat, native mobile, ML ranking, microservices, or Rust for the beta.
- Keep schema changes small, reviewed, and backed by migrations.

## Acceptance Standard

Every feature should move one beta user outcome forward:

Illinois signup -> onboarding -> discovery -> Send Rally -> accept/decline -> schedule -> court handoff -> upcoming Rally -> feedback -> mutual Rally Again.
