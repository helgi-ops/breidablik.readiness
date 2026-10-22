# Claude Code brief — Per-match team stats ingestion (Wyscout, no Data API)

## Goal

Unlock the **"Per-match xG × movement"** analysis on the Match Insights page **without the Wyscout Data API**, by ingesting the per-match team stats that Wyscout lets us download by hand.

Right now `app/api/coach/match-insights/route.ts` returns a hard-coded empty state:

```ts
perMatchXg: { available: false, reason: "Per-match football stats need the Wyscout Data API (not yet connected)." },
```

That statement is now wrong. Wyscout's **Team → Stats tab** exposes a per-match team table (Breiðablik **and** opponent, one row each per match) with **xG per match**, goals, shots, possession, passes, duels, losses, recoveries — and its own **"Export to Excel"** button. That export is the data source for this brief. The Data API is only needed for per-**player**-per-match automation, which this feature does not require.

## What the source file looks like

The coach exports it from `wyscout.hudl.com/app` → team page → **Stats** tab → DISPLAY **General** (has xG) → **"Show opponents"** ON → **Export to Excel**. One `.xlsx` per DISPLAY preset (General / Attacking / Defending / Passing / Indexes). General is the one this feature needs.

Expected shape (verified against the live table, `Last calendar year`, Besta-deild karla 2026):

- One row per **team per match** — so two rows per fixture (Breiðablik + opponent), plus an `AVERAGE` block at the top that must be skipped.
- Match identity lives in a `Match` label like `"Thór 1:0 Breiðablik"` plus a date (`04.08.2026`) and competition string.
- General columns: `Team`, `Scheme` (formation, e.g. `4-2-3-1`), `Goals`, **`xG`**, `Shots` / `on target`, `Passes` / `accurate`, `Possession, %`, `Losses` (Low/Medium/High), `Recoveries` (Low/Medium/High), `Duels` / `won`.
- Example fixture: `Thór 1:0 Breiðablik, 04.08.2026` → Breiðablik xG **2.33**, Thór xG **2.09**; `Breiðablik 1:0 ÍBV, 27.07.2026` → 1.23 vs 1.25; `FH 0:0 Breiðablik, 20.07.2026` → 1.47 vs 2.68; `Breiðablik 2:1 Keflavík, 13.07.2026` → 0.60 vs 1.23.

**Do not assume exact header spellings.** Wyscout headers vary by locale/export version and some are two-line ("Shots / on target"). Parse defensively: normalise headers (lowercase, strip punctuation/whitespace) and match on substrings (`xg`, `goals`, `possession`, `shots`, `passes`, `duels`, `recover`, `loss`). Log any column you can't map instead of silently dropping it. Read the actual uploaded file's header row first and build the mapping from what's really there.

## Deliverables

### 1. Migration — `team_match_stats`

New table keyed by team + match date + which side the row describes (own vs opponent). Store the raw parsed stats and keep it descriptive-only (never feeds the readiness colour).

```sql
create table if not exists public.team_match_stats (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id),
  match_date    date not null,
  is_opponent   boolean not null default false,   -- false = Breiðablik row, true = opponent row
  opponent_name text,                              -- opponent label for the fixture (both rows share it)
  competition   text,
  scheme        text,
  goals         numeric,
  xg            numeric,
  shots         numeric,
  shots_on_target numeric,
  passes        numeric,
  passes_accurate numeric,
  possession_pct  numeric,
  losses        numeric,
  recoveries    numeric,
  duels         numeric,
  duels_won     numeric,
  source        text not null default 'wyscout_team_stats_xlsx',
  raw           jsonb,                             -- full parsed row, for columns we didn't model
  created_at    timestamptz not null default now(),
  unique (team_id, match_date, is_opponent)
);

alter table public.team_match_stats enable row level security;
-- match the RLS pattern used by match_schedule / player_season_stats (team-scoped read for coach/staff/admin).
```

- Apply via `mcp__supabase__apply_migration` **and** save the identical SQL under `supabase/migrations/<timestamp>_team_match_stats.sql` (repo rule: every applied migration is committed).
- Mirror the exact RLS policies used on `player_season_stats` / `match_schedule` so coach/staff/admin on the team can read it. Writes are service-role only (ingestion runs server-side).

### 2. Ingestion — parse the Wyscout Team-Stats export

Add a script `scripts/ingest-team-match-stats.ts` (or `.mjs`, matching how the other Wyscout/season ingests are written — check `scripts/` for the existing season-stats ingest and copy its Supabase-client + xlsx-parsing conventions).

Behaviour:
- Input: path to the exported `.xlsx` (General preset, "Show opponents" ON) + `--team-id` (default Breiðablik `94b52a06-0b83-48da-8664-639ec3486a0c`).
- Use the same xlsx library the repo already uses (check package.json — likely `xlsx`/SheetJS). Read the first sheet, find the header row, build the defensive column map described above.
- Skip the `AVERAGE` block. Group the remaining rows into fixtures (each `Match` label yields two consecutive rows: the two teams). The row whose `Team` matches Breiðablik → `is_opponent=false`; the other → `is_opponent=true`, and `opponent_name` = that team's name for **both** rows.
- Parse the date from the match label/subtitle (`dd.mm.yyyy`) → ISO `match_date`.
- Coerce `"14/4"`-style "value / secondary" cells: primary number → main column (`shots`), secondary → `_on_target` / `_accurate` / `_won`. Percentages → numeric without `%`.
- Store everything unmodified in `raw` (jsonb) so nothing is lost even if we didn't model a column.
- **Upsert** on `(team_id, match_date, is_opponent)` so re-running a fresh export just updates. Print a summary (fixtures found, rows upserted, any unmapped headers, any dates that failed to join to `match_schedule`).
- Idempotent, safe to re-run weekly after each new export.

Provide a one-line run command in the brief output / script header, e.g.:
`npx tsx scripts/ingest-team-match-stats.ts ~/Downloads/<wyscout-export>.xlsx`.

### 3. Wire the Match-Insights API — `perMatchXg` panel

In `app/api/coach/match-insights/route.ts`, replace the hard-coded empty `perMatchXg` with a real computation built from `team_match_stats` joined to the existing per-match **team movement** aggregate (`perMatch` / `gradedRows` already computed in the route). Keep it strictly descriptive (association, never causation), and keep the honest empty state for when no rows exist yet.

Add, alongside the existing `resultCorrelations` and `seasonXg`:

- Fetch Breiðablik's own per-match rows: `team_match_stats` where `team_id = teamId and is_opponent = false`, keyed by `match_date`.
- Also fetch the opponent rows (`is_opponent = true`) so we can expose **xG-against** per match (the defensive question the coach asked — "eru hreyfingarnar öðruvísi í tapleikjum").
- Build a per-match join: for each `sessionDate` in `perMatch` that has a `team_match_stats` row, pair the **own xG** (and xG-against, shots, possession) with that match's **team movement metrics** (`values[k]` over `metricKeys`).
- Compute Pearson correlations (reuse `pearson` from `lib/micropulse/matchInsights/correlation`) between **per-match xG** and each movement metric, and between **per-match xG-against** and each movement metric. Sort by |r|, slice top 8, same shape as `resultCorrelations` (`{ key, r, n, strength, direction }`).
- Respect the same low-sample guard the UI already uses (`MIN_CONFIDENT_CORR_N`) — with only ~4–20 graded matches this will often be low-confidence, so it must surface the same amber "small sample" caveat, never overclaim.

New response shape (replace the stub):

```ts
perMatchXg: {
  available: perMatchXgCorrelations.length > 0,
  reason: perMatchXgCorrelations.length > 0
    ? undefined
    : "No per-match team stats ingested yet — export Wyscout Team → Stats (General, Show opponents) to Excel and run the ingest.",
  matches: nMatchesJoined,               // how many matches had both stats + movement
  xgFor: perMatchXgCorrelations,         // per-match xG (for) × movement
  xgAgainst: perMatchXgAgainstCorrelations, // per-match xG-against × movement (defensive view)
},
```

Also expose a compact per-match series (date, xG-for, xG-against, result, a couple of headline movement metrics) so the page can optionally render the actual match-by-match table under the correlations — the coach explicitly wanted to *see* the per-match comparison, not only the correlation coefficients.

### 4. Wire the page — `app/coach/match-insights/page.tsx`

Replace the current static "Per-match xG × movement" box (the `bg-slate-50` panel around line 318) so that when `ins.perMatchXg.available`:
- render the `xgFor` correlations with the existing `CorrRow` component (identical style to `resultCorrelations` / `seasonXg`);
- render the `xgAgainst` correlations under a sub-heading (bilingual label — EN "Per-match xG-against × movement", IS "Per-leik xG á móti × hreyfing");
- if `matches < MIN_CONFIDENT_CORR_N`, show the same amber low-sample caveat used elsewhere;
- otherwise keep the current honest empty-state text (now driven by `ins.perMatchXg.reason`).
- Keep both languages populated in the `T` copy map (EN default, IS toggle) — no sport-science jargon; "xG" is fine, it's already used on the page.

## Explainability & repo rules (must pass)

- **Descriptive layer only.** This panel is association/context. It must **never** touch `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`, the daily decision, or `stage4_decisions`. (Manifesto principle: one canonical verdict; descriptive analytics never move the colour.)
- **Honest empty states, no fabrication.** With few matches, show the low-sample caveat; if a metric can't be computed, drop it — don't invent it.
- **Provenance.** Label the data source in the UI as "Wyscout team stats (per match)" and note the last export/sync date if available, so the coach knows how fresh it is (mirrors how season xG is surfaced).
- **Bilingual**, English default, both coach-readable.
- **Lint clean**: run `npx eslint` on every file touched; no new errors.
- **Migration committed** under `supabase/migrations/` as well as applied.
- No `git add -A`; stage only the files you changed.

## Acceptance

1. `team_match_stats` exists with RLS matching `player_season_stats`, migration committed.
2. Running the ingest on the real Wyscout export upserts one own-row + one opponent-row per fixture (AVERAGE skipped), idempotent on re-run.
3. `/api/coach/match-insights` returns real `perMatchXg.xgFor` / `xgAgainst` correlations (+ per-match series) when rows exist, honest empty state when they don't.
4. The Match Insights page renders the per-match xG correlations (both directions) with the low-sample caveat when n is small, in both languages.
5. Nothing in the readiness/decision path changed.

## Out of scope

- Per-**player**-per-match stats (that's the `player_match_stats` table + Wyscout Data API path — not needed here).
- Any automated Wyscout fetch. Ingestion is from a hand-exported `.xlsx` the coach drops in; re-run weekly.
