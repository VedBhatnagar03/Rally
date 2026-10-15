# Rally Backend Architecture

## Product Boundary

Rally does not scrape or automate Active Illini. The backend suggests the best sport, venue, and time, then tracks whether a user completed the official court-booking flow.

## Core Domains

- Auth: UIUC-only registration, versioned 18+/policy consent, Resend-backed verification and password recovery, login, short-lived JWT issuance, rotating refresh-token families with replay containment, and logout revocation.
- Profile: campus identity, dating intent, gender preferences, trust profile.
- Discovery profile: reviewed prompts, short interests, ordered photos and a privacy-shaped candidate response.
- Sports: racket sport interests, skill, intensity, favorites.
- Availability: weekly time windows used by the matching engine.
- Matching: deterministic recommendation scoring for the hackathon MVP.
- Discovery eligibility: blocked users and pairs with a pending, accepted or scheduled Rally are removed before scoring; terminal Rally pairs may be recommended again.
- Rallies: invite, accept, decline, booking handoff, and completion state.
- Venues: UIUC-specific court options and booking guidance.
- Audit: security-relevant event trail.
- Founder operations: protected user/Rally inspection, report resolution and account suspension.
- Founder metrics: configurable funnel windows, completed Rallies per active user and stalled-operation counts.
- Founder audit visibility: admin-only, filtered and cursor-paginated access to security-relevant backend events.
- Error visibility: unexpected request failures are logged and persisted as sanitized, admin-only incidents.
- Account safety: password-confirmed deactivation/deletion, session revocation and user-controlled unblock.
- Rally integrity: one active Rally per user pair, bounded future scheduling windows and immediate cancellation after a block.
- Rally transitions: expected prior states are enforced in atomic database writes so concurrent actions cannot overwrite one another.
- Rally completion: scheduled Rallies cannot become completed or unlock feedback before their scheduled start.
- Court booking: clients can report booked or unavailable outcomes, and confirmed booking ownership/details are immutable under retries and concurrent updates.
- Booking cancellation handoff: cancelling a Rally preserves confirmed external reservation details so the booking owner can still cancel it manually; unconfirmed handoffs are cleared.
- Rally reads: list and detail endpoints use an explicit participant allowlist so email, dating filters, availability and trust data never leak through nested records.
- Rally history: participant-scoped cursors and capped page sizes keep nested history reads bounded as the beta grows.
- Post-Rally safety: a negative safety response creates a confidential, idempotent founder-queue report linked to the feedback record.
- Feedback integrity: the first post-Rally decision is final; exact retries succeed while conflicting resubmissions are rejected.
- Notifications: durable in-app lifecycle events are created in the same transaction as Rally state changes and deduplicated per recipient, event type and Rally.
- Profile photos: clients upload to a short-lived private S3-compatible target; the API validates and re-encodes images before publishing owner-bound assets.

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
