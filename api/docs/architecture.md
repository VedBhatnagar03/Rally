# Rally Backend Architecture

## Product Boundary

Rally does not scrape or automate Active Illini. The backend suggests the best sport, venue, and time, then tracks whether a user completed the official court-booking flow.

## Core Domains

- Auth: UIUC-only registration, Resend-backed email verification, login, short-lived JWT issuance, rotating refresh tokens and logout revocation.
- Profile: campus identity, dating intent, gender preferences, trust profile.
- Sports: racket sport interests, skill, intensity, favorites.
- Availability: weekly time windows used by the matching engine.
- Matching: deterministic recommendation scoring for the hackathon MVP.
- Rallies: invite, accept, decline, booking handoff, and completion state.
- Venues: UIUC-specific court options and booking guidance.
- Audit: security-relevant event trail.

## Request Flow

1. Public auth endpoints validate input with Zod.
2. Protected endpoints require JWT verification.
3. Route handlers use Prisma for database operations.
4. Security-sensitive events write to `AuditLog`.
5. Responses avoid returning password hashes, token hashes, and internal secrets.
6. Protected requests re-check active user status so suspension takes effect immediately.

## Matching V1

The current scorer is deliberately deterministic:

- shared racket sport required
- skill gap penalty
- intensity gap penalty
- favorite sport bonus
- overlapping availability bonus
- trust score contribution

This is explainable in a hackathon pitch and easy to improve once real UIUC data exists.

## Scheduling V1

The scheduler intersects two users' recurring weekly availability, keeps windows of at least 45 minutes, normalizes suggestions to one-hour Rally blocks, and attaches a compatible UIUC venue. It returns up to three options for the product surface.
