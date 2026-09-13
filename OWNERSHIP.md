# Rally — File Ownership & Parallel Work Rules

One named editor per file. If you need a file you don't own changed, ask its owner.

## Ownership map

| Path | Owner | Notes |
|---|---|---|
| `app/**` | Suri | All routes and pages |
| `components/**` | Suri | UI components |
| `lib/mock/**` | Suri | Mock data the UI develops against |
| `lib/supabase/**` | Ved | Client, queries, real action implementations |
| `database/**` | Ved | Schema, migrations, seed |
| `matching/**` | Ved | Filters + scoring |
| `scheduling/**` | Ved | Availability overlap, venues |
| `docs/product/**` | Adi | Journey map, design tokens, UX copy |
| `docs/research/**` | Naman | Interviews, evidence |
| `docs/pitch/**` | Naman | Narrative, metrics, Q&A |
| `public/**` | Suri + Adi | Assets — coordinate on filenames |

## Shared files — announce before editing

| Path | Rule |
|---|---|
| `types/index.ts` | Ved + Suri must both agree. This is the frozen contract. |
| `lib/api.ts` | Same. Signatures only, no logic. |
| `package.json` | Suri merges. Others request dependencies. |
| `README.md` | Suri. |

## Branch model

- `main` — always demoable. Suri is the only one who merges.
- `feat/frontend-*` — Suri
- `feat/backend-*` — Ved
- `feat/matching-*` — Ved
- `docs/*` — Adi, Naman (never touches code, merge freely)

Small PRs. No broad refactors after the demo-freeze checkpoint.

## The mock/real boundary

Suri builds the entire golden path against `lib/mock`. Ved fills in
`lib/supabase/actions.ts` behind the identical `RallyApi` interface.

Swapping is one env var:

```
NEXT_PUBLIC_RALLY_USE_MOCKS=false
```

This means neither person ever waits on the other, and the demo always has a
working fallback if the backend breaks.

## Rules that prevent merge pain

1. Never edit a file you don't own. Ask.
2. Never let two AI agents edit the same file.
3. Pull from `main` before starting a slice.
4. Commit small and often; don't hold a 20-file branch for hours.
5. If `types/index.ts` changes, both Ved and Suri pull immediately.
