# Rally Beta Analytics

Rally accepts only the product-interaction events below. The authenticated user and server timestamp
are attached by the backend. Clients must not send email, names, profile text, free-form notes,
precise location, or other personal data in analytics metadata.

| Event | Metadata | Purpose |
| --- | --- | --- |
| `ONBOARDING_STARTED` | none | Measure onboarding entry against profile completion. |
| `DISCOVERY_VIEWED` | `candidateCount` from 0 to 100 | Measure discovery reach and empty experiences. |
| `CANDIDATE_PROFILE_VIEWED` | `source`: `DISCOVERY` or `RALLY` | Measure interest in profile detail. |
| `SCHEDULING_OPTIONS_VIEWED` | `optionCount` from 0 to 3 | Diagnose scheduling availability friction. |
| `BOOKING_HANDOFF_OPENED` | `sport`: supported Rally sport enum | Measure external reservation handoff usage. |

Profile completion, Rally requests, accepts, scheduling, completion, cancellation, feedback,
mutual Rally Again, blocks, and reports are measured from their canonical database records. Clients
must not duplicate those lifecycle transitions as analytics events.
