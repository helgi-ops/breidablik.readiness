# Claude Code brief — strip date prefixes from drill names on write (so it can't recur)

Goal: drill names should be **descriptive only** ("10v10+GK possession"), never date-prefixed
("2026-03-27 · Æf · 10v10+GK possession"). The existing rows were already cleaned in the DB (77 renamed).
This adds a small **defensive normalisation at the write path** so any future import that carries a date
prefix is cleaned automatically — regardless of where the import came from.

## Finding (why this is the right fix)

There is **no code path that auto-generates date-prefixed drill names** — the manual create
(`/api/coach/drill-library` POST) and the bulk import (`/api/coach/import-drills`) both take
`drill_name` **verbatim** from the request body. So the dates came from the *source data* of a bulk
import/seed, not an ongoing pipeline. The robust guard is therefore to normalise the name **on every
write**, so it can't reappear no matter which import supplies it.

## The normalisation (pure helper, one place)

New `src/lib/micropulse/drillLibrary/normalizeDrillName.ts`:

```ts
/** Strip a leading date prefix from a drill name, keeping the descriptive part.
 *  Handles both observed formats:
 *    "2026-03-27 · Æf · 10v10+GK possession"   → "10v10+GK possession"
 *    "2026-02-03 MD-4 – Reitur"                → "Reitur"
 *  Leaves already-clean names untouched. Never returns empty (falls back to the input). */
export function normalizeDrillName(raw: string): string {
  const s = (raw ?? "").trim();
  const stripped = s
    .replace(/^\s*\d{4}-\d{2}-\d{2}\s*(·\s*[^·–]*·|[^·–]*–)\s*/, "")
    .trim();
  return stripped.length ? stripped : s;   // never blank out a name
}
```
(Same regex proven against the real data: 77/77 cleaned, 0 emptied, 0 left date-prefixed.)

## Apply at both write points

- **`src/app/api/coach/import-drills/route.ts`** (~line 99): `drill_name: normalizeDrillName(drill.drill_name)`
  before insert. This is the path a bulk import uses — the one that introduced the dates.
- **`src/app/api/coach/drill-library/route.ts`** POST (~line 158): normalise the `drill_name` after the
  existing `.trim()`. (A coach typing a name won't include a date, but this makes the guard total.)

Do NOT change the `from-template` route (template names are already clean) or the read paths.

## Collision note (reuse the DB cleanup's behaviour)

`drill_library` has `unique(team_id, drill_name, source)`. The import path already uses
`upsert(..., onConflict: "team_id,drill_name,source")`, so a normalised name that now equals an existing
drill will **upsert onto it** rather than error — acceptable for an import (same drill, refreshed). The
manual POST should keep its existing duplicate handling (return the current "name already exists" error);
normalisation doesn't change that contract.

## Guardrails / tests

`src/lib/micropulse/drillLibrary/__tests__/normalizeDrillName.test.ts`:
1. "2026-03-27 · Æf · 10v10+GK possession" → "10v10+GK possession".
2. "2026-02-03 MD-4 – Reitur" → "Reitur".
3. "2026-02-26 · MD+1 · Reitur" → "Reitur" (MD+1 token).
4. "SSG 7v7" (already clean) → unchanged.
5. "2026-03-27" (date only, no name) → falls back to the input (never blank).
6. Idempotent: normalise(normalise(x)) === normalise(x).

`npx eslint <changed files>` + the test; lint-clean. No migration (pure code + route wiring).

## Acceptance
- [ ] `normalizeDrillName` pure, both formats, never blanks, idempotent, tested.
- [ ] Applied in `import-drills` and the drill-library POST before insert/upsert.
- [ ] Template + read paths untouched; upsert-on-conflict behaviour unchanged.
- [ ] eslint + tests clean.

## Note
The existing 77 rows are already fixed in the DB (done via SQL, dates stripped, collisions suffixed
"Reitur 2" etc.). This brief only prevents recurrence on future writes.
