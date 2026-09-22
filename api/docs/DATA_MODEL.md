# Rally Data Model

## Core Tables

- `User`: login identity, UIUC email, password hash, verification status, admin role.
- `EmailVerificationToken`: hash-only email verification tokens.
- `RefreshToken`: hash-only, rotating session tokens with expiry and revocation.
- `Profile`: dating and campus profile.
- `Photo`: user photo metadata.
- `SportProfile`: per-sport skill, intensity, and favorite flags.
- `AvailabilityWindow`: recurring weekly availability.
- `Venue`: UIUC-compatible court locations and handoff links.
- `Rally`: invite and real-world meetup state.
- `RallyFeedback`: private post-Rally feedback.
- `Block`: immediate discovery and interaction exclusion.
- `Report`: safety/moderation queue.
- `AnalyticsEvent`: funnel and behavior instrumentation.
- `AuditLog`: security-relevant backend events.

## Privacy Notes

- Feedback is private by default.
- Reports are admin/moderation data only.
- Blocks affect recommendations immediately.
- Venue data is campus-area level, not precise residence or live location.
