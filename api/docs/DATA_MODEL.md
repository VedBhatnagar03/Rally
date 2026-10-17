# Rally Data Model

## Core Tables

- `User`: login identity, UIUC email, password hash, verification/account-lifecycle status, admin role, throttled last-active timestamp and versioned 18+/policy consent timestamps.
- `EmailVerificationToken`: hash-only email verification tokens.
- `PasswordResetToken`: hash-only, single-use account recovery tokens with a one-hour expiry.
- `RefreshToken`: hash-only, rotating session tokens grouped into families for replay containment, with expiry and explicit revocation reasons.
- `Profile`: dating and campus profile.
- `ProfilePrompt`: up to three ordered answers selected from the reviewed prompt catalog.
- `Photo`: ordered, sanitized profile-photo metadata and its published storage key.
- `PhotoUpload`: short-lived, owner-bound private upload intent used before image validation and publication.
- `SportProfile`: per-sport skill, intensity, and favorite flags.
- `AvailabilityWindow`: recurring weekly availability.
- `Venue`: UIUC-compatible court locations and handoff links.
- `Rally`: explicit pending, accepted, scheduled, completed/cancelled meetup state with lifecycle timestamps and cancellation attribution; only one active Rally may exist per user pair.
- `RallyFeedback`: private, final post-Rally feedback with a one-to-one safety escalation when needed.
- `Notification`: durable, per-user Rally lifecycle events with read state and duplicate prevention.
- `Block`: immediate discovery and interaction exclusion.
- `Report`: safety/moderation queue with status, resolution note, timestamp and resolving administrator.
- `AnalyticsEvent`: authenticated, allowlisted product-interaction instrumentation with strict metadata. Rally lifecycle conversions remain authoritative from domain tables.
- `AuditLog`: security-relevant backend events.
- `OperationalIncident`: sanitized unexpected-error records for founder diagnosis and resolution.

## Privacy Notes

- Feedback is private by default.
- Identical feedback retries are idempotent; conflicting edits are rejected after the first submission.
- A negative post-Rally safety check creates one confidential, feedback-linked report for founder review, even when a client retries submission.
- Reports are admin/moderation data only.
- Blocks affect recommendations immediately and cancel active Rallies between the users.
- Safety-triggered cancellations use neutral system attribution and never reveal whether a participant blocked or reported the other user.
- Rally-linked reports must name the other participant in a Rally the reporter actually joined.
- A report in either direction excludes the pair from discovery and future Rally creation, and the first report cancels any active Rally between them while preserving confirmed booking ownership details.
- Account deletion anonymizes identity and removes profile data while retaining safety and shared Rally records.
- Venue data is campus-area level, not precise residence or live location.
- Operational incidents never store request bodies, authorization headers or stack traces.
- User exports include only the requester's account data and shared Rally records; secrets and reports submitted by other users are excluded.
- Notifications are visible only to their recipient and are removed when that account is deleted.
- Original photo uploads stay private; published images are decoded, resized, metadata-stripped and converted to WebP.
- Discovery responses expose public presentation fields but not email, exact availability, or private dating-filter preferences.
