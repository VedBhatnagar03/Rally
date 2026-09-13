# lib/mock — Suri

Mock implementation of `RallyApi` so the frontend never waits on the backend.

Build `mockApi` here satisfying the interface in `lib/api.ts` exactly. When Ved's
real actions land, `lib/client.ts` swaps between them on one env var and no
component changes.

Keep these fixtures working even after the backend is live — they are the demo
fallback if Supabase fails on stage.
