# lib/supabase — Ved

- `client.ts` — browser and server Supabase clients
- `actions.ts` — `supabaseApi`, the real implementation of `RallyApi`

Implement `RallyApi` exactly as declared in `lib/api.ts`. Never change a
signature without telling Suri — his components are already calling it.

Order of work if time runs short: schema + seed → send/accept → ranking →
availability overlap → venue + booking → feedback.
