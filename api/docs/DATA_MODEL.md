# Rally Data Model

## Core Tables

- `User`: login identity, UIUC email, password hash, verification/account-lifecycle status, admin role and throttled last-active timestamp.
- `EmailVerificationToken`: hash-only email verification tokens.
- `PasswordResetToken`: hash-only, single-use account recovery tokens with a one-hour expiry.
- `RefreshToken`: hash-only, rotating session tokens with expiry and revocation.
- `Profile`: dating and campus profile.
- `Photo`: user photo metadata.
- `SportProfile`: per-sport skill, intensity, and favorite flags.
- `AvailabilityWindow`: recurring weekly availability.
- `Venue`: UIUC-compatible court locations and handoff links.
- `Rally`: explicit pending, accepted, scheduled, completed/cancelled meetup state with lifecycle timestamps and cancellation attribution; only one active Rally may exist per user pair.
- `RallyFeedback`: private post-Rally feedback.
- `Block`: immediate discovery and interaction exclusion.
- `Report`: safety/moderation queue with status, resolution note, timestamp and resolving administrator.
- `AnalyticsEvent`: funnel and behavior instrumentation.
- `AuditLog`: security-relevant backend events.
- `OperationalIncident`: sanitized unexpected-error records for founder diagnosis and resolution.

## Privacy Notes

- Feedback is private by default.
- Reports are admin/moderation data only.
- Blocks affect recommendations immediately and cancel active Rallies between the users.
- Rally-linked reports must name the other participant in a Rally the reporter actually joined.
- Account deletion anonymizes identity and removes profile data while retaining safety and shared Rally records.
- Venue data is campus-area level, not precise residence or live location.
- Operational incidents never store request bodies, authorization headers or stack traces.
