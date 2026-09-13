# Rally

Activity-first dating at UIUC. Rally matches students around racket sports and
turns the first date into a game.

## Golden path

onboarding → discover → profile → Send Rally → accept → common time →
venue / court handoff → Upcoming Rally → feedback → Rally Again

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app runs on mock data by default — no Supabase needed to work on the UI.
Set `NEXT_PUBLIC_RALLY_USE_MOCKS=false` once the backend is live.

## Layout

```
app/            routes and pages                 (Suri)
components/     UI components                    (Suri)
lib/mock/       mock data for the UI             (Suri)
lib/supabase/   client, queries, real actions    (Ved)
lib/api.ts      FROZEN action contract           (Ved + Suri)
types/          FROZEN shared types              (Ved + Suri)
database/       schema, migrations, seed         (Ved)
matching/       hard filters + scoring           (Ved)
scheduling/     availability overlap, venues     (Ved)
docs/product/   journey, design tokens, copy     (Adi)
docs/research/  interviews, evidence             (Naman)
docs/pitch/     narrative, metrics, Q&A          (Naman)
```

See [OWNERSHIP.md](OWNERSHIP.md) before editing anything.

## Database

Run `database/migrations/001_initial_schema.sql` in the Supabase SQL editor,
then `npm run seed`.

## Not building

Chat, payments, social feed, tournaments, native apps, real ML, Rust,
automated Active Illini booking, admin tooling, multi-campus.
