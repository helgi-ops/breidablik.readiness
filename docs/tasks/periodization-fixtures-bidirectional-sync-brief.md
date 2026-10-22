# Brief — one fixtures source, synced both ways (Fixtures ↔ Macro ↔ Meso ↔ Micro)

**The ask:** register a match in *one* place and the system registers it everywhere — the Meso Cycle
calendar, the Micro Cycle (Week Setup) and the Fixtures list all stay in lockstep, both directions. Today
matches are **read** from the canonical store in several surfaces but only **written** from a couple, so a
match added on the Meso calendar or in Week Setup doesn't propagate. Close that loop.

Files: `src/app/coach/periodization-hub/page.tsx` (Meso calendar + Macro anchors),
`src/app/coach/week-setup/page.tsx` (Micro), `src/app/coach/fixtures/page.tsx` (the fixtures editor),
`src/app/coach/match-minutes/page.tsx`, `src/app/api/coach/periodization/route.ts` (already writes a
friendly), `src/app/api/coach/week-setup/apply/route.ts`.

## The rule: `match_schedule` is the single source of truth for matches

A match's identity — **date, opponent, home/away, competition (League / Friendly), kickoff** — lives in
**`match_schedule`** and nowhere else. This is already the stated contract (week-setup comment: "Fixtures
(match_schedule) are the SOURCE OF TRUTH for the week's games"; `periodization/route.ts` already inserts a
pre-season friendly as a `match_schedule` row). Make every surface obey it:

- **Read matches** everywhere from `match_schedule`: the Macro anchors (first fixture → the pre-season →
  competitive boundary), the Meso calendar's pre-filled match days, and the Micro/Week Setup match cells.
  (Most already do.)
- **Write matches** back to `match_schedule` from **every** surface that lets the coach set one — not just
  the Fixtures page. Adding, moving, or removing a match anywhere upserts/deletes the canonical row; the
  other surfaces then re-derive from it.

Sessions and rest days stay week-level (`week_plans`); only the **match** designation is canonical in
`match_schedule`. A `week_plans` day of type `match` must **mirror** a `match_schedule` row — never a
second, independent source of match truth.

## Make each surface write back

1. **Meso Cycle calendar** (`periodization-hub/page.tsx`). Clicking a day to cycle Off → Session → **Match**
   (or back) must persist to `match_schedule`, not only to the local block/`week_plans`:
   - Add a match → **upsert** a `match_schedule` row for that date (competition `Friendly` in pre-season, or
     the real fixture if one exists; default opponent "Friendly"/TBD, `is_home` true, editable later on the
     Fixtures page). Reuse the existing `addFriendly` insert in `api/coach/periodization/route.ts`; extend
     it with a **remove** (delete the row for that date) and an in-season variant.
   - Remove a match → delete the `match_schedule` row for that date **only if** it has no recorded
     minutes/stats/report (else warn — see guardrails).
2. **Micro Cycle / Week Setup** (`week-setup/page.tsx`). It already *reads* matches from `match_schedule`;
   add **write-back** so setting/clearing a match cell there upserts/deletes the canonical row the same way.
   Keep the existing "Apply to Week Setup" (from the Meso block) writing sessions/off to `week_plans`, but
   matches in that apply come **from `match_schedule`**, not invented in `week_plans`.
3. **Fixtures page** (`fixtures/page.tsx`) — already the canonical editor; unchanged, it's the full form
   (opponent, home/away, competition, kickoff). It just now shares the store with the planners.
4. **Match Minutes** (`match-minutes/page.tsx`) — already ensures a `match_schedule` row when a match
   date/opponent is entered (line ~441). Leave as the reference pattern; reuse its upsert helper.

Factor the upsert/delete into **one server helper** (extend `api/coach/periodization/route.ts` or a small
`fixtures` route) so every surface calls the same write path — one place that owns fixture writes.

## Propagation (the whole point)

After any fixture write, everything re-derives from `match_schedule`:

- The **Macro** arc + anchors (first fixture may shift the pre-season boundary → re-flows the blocks, per
  the cascade brief).
- The **Meso** calendar + computed block (match days re-anchor; day-types + the ≤3 rule re-solve around
  them).
- The **Micro**/Week Setup week (its match cells reflect the change).
- The **Fixtures** list.

Invalidate/refetch the shared fixtures query on write (or optimistic update + refetch) so all open surfaces
update without a manual reload. Wire the fixtures list as **shared state / a single query** the tabs read,
matching the "one source of truth" pattern from the hub-restructure brief.

## Guardrails

- **Don't silently destroy data.** Removing a match that already has recorded minutes, team/player stats, or
  a match report must **warn and require confirmation** (or block), not delete quietly — that fixture is
  referenced elsewhere.
- **Editing date/opponent/home-away** updates the one canonical row (reuse the match-minutes upsert), so a
  correction in any surface is the correction everywhere.
- **Competition tag** distinguishes pre-season **Friendly** from **League** fixtures; the Meso pre-season
  blocks use friendlies, in-season uses league fixtures. Default new matches added from a planner to
  `Friendly` (coaches add friendlies; league fixtures normally come from the Fixtures page / import).
- **RLS / team scope**: all writes scoped to the coach's `team_id`, as the existing routes already do. Never
  put opponent or fixture data in a URL/query string beyond what the existing routes use.

## Acceptance

- Adding a match on the **Meso calendar** creates a `match_schedule` row; it immediately appears in the
  **Fixtures** list and the **Micro/Week Setup** week, and the **Macro** arc/anchors + Meso block re-derive.
- Adding a match in **Week Setup** does the same; adding one on the **Fixtures** page shows up pre-filled on
  the Meso calendar and Micro week. Editing date/opponent in any one updates all.
- Removing a match with no downstream data deletes it everywhere; removing one **with** recorded
  minutes/stats/report warns and requires confirmation.
- One shared server write path owns all fixture upserts/deletes; one shared fixtures query feeds all tabs;
  no second source of match truth in `week_plans`. Team-scoped (RLS). EN/IS. Lint + typecheck clean.

Ref: `src/app/coach/periodization-hub/page.tsx`, `src/app/coach/week-setup/page.tsx`,
`src/app/coach/fixtures/page.tsx`, `src/app/coach/match-minutes/page.tsx` (upsert pattern ~line 441),
`src/app/api/coach/periodization/route.ts` (`addFriendly` insert ~line 87),
`src/app/api/coach/week-setup/apply/route.ts`. Pairs with
`periodization-hub-restructure-brief.md` (Macro drives Meso drives Micro — this makes the *matches* the
shared spine).
