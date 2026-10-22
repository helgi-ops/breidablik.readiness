# Claude Code brief — **StatsBomb ingestion** (Data API → MicroPulse)

## Goal & rationale

Breiðablik has a **StatsBomb IQ** licence and StatsBomb **covers the Besta deild**
(Breiðablik = StatsBomb team id `2041`). StatsBomb data is materially deeper than
Wyscout for the domestic league — real xG, On-Ball Value (OBV), pressures, off-ball
actions, ~3,400 events/match, proper set-piece and pressing detail. Bring it into
MicroPulse so the analytics surfaces (Team Match Insight, opponent scouting, set
pieces, xG) run on StatsBomb-grade data where the league is covered, **falling back
to Wyscout where it is not** (broad scouting reach for other leagues).

Same shape as the two ingestions MicroPulse already has (Wyscout Team → Stats and
Catapult OpenField): a client, typed tables, an id-map, an idempotent sync job, and
a provider-agnostic read layer so the existing UI doesn't care where a number came
from. Descriptive context only — never touches the readiness colour or the daily
decision. Provenance is shown ("StatsBomb" vs "Wyscout") per manifesto #1.

## Prerequisite — Data API access (NOT the same as IQ)

**Phase 0 (CSV import) needs no API** — it uses the IQ CSV export the club already
has, so it can ship immediately. The API prerequisite below applies only to the
automated Phases A/B.

IQ (the web app) ≠ the **StatsBomb Data API** (programmatic). The API is a separate,
paid entitlement. Before building Phase A/B, confirm the licence includes API access
and obtain credentials. Store them **server-side only** as Supabase secrets / env vars
`SB_USERNAME`, `SB_PASSWORD` — never in client code, never logged. If the licence is
IQ-only, this ingestion is blocked (fall back to IQ exports); flag that early.

Use the probe script (`scripts/statsbomb-probe.py`) to confirm access, list the
licensed competitions (Besta deild id + season ids), and inspect the data shape
before writing any ingestion code.

## Access layer

StatsBomb Data API is REST/JSON. Two viable clients:
- **Python worker with `statsbombpy`** (official Hudl/StatsBomb client) — simplest,
  handles auth + paging; runs as a scheduled job that writes to Supabase.
- **TS fetch client** hitting the REST endpoints directly (keeps it in the Next/TS
  stack).

**Recommendation:** a small scheduled worker (Python `statsbombpy` or a TS route)
invoked by cron. Endpoints used: `competitions`, `matches/{comp}/{season}`, and per
match `events`, `lineups`, `frames` (360). StatsBomb also exposes **aggregated
team/player season & match stat** endpoints — much lighter than raw events and
enough for phase A.

## Phases (0 → A → B)

- **Phase 0 — StatsBomb IQ **CSV export** import (no API — SHIP THIS FIRST).** IQ
  exports a per-match team-stats CSV that a coach can download and upload, exactly
  like the Wyscout Team → Stats flow MicroPulse already has. Confirmed with a real
  export saved as a fixture at `docs/samples/statsbomb/Breidablik-MatchStats-2026.csv`
  (2026, 17 matches, **222 columns**): it
  carries the team's own metrics **and** a full `Opposition …` set in the same rows,
  plus OBV and a complete set-piece suite — far beyond Wyscout, and needs **no API,
  no credentials in the system.** This is the fastest path to StatsBomb-grade data
  and is spec'd in detail below.
- **Phase A — aggregated via API (automated).** The same aggregate metrics, pulled
  automatically from the Data API instead of manual CSV upload. Removes the manual
  step; needs the API entitlement.
- **Phase B — events + 360 (later).** Raw events + freeze-frames → set-piece
  routines, pressing/space maps, custom metrics. Heavy storage/compute; clearly v2.
  (NB: 360 data is **not collected for the Besta deild** — every `Ball Receipts in
  Space …` and `Line Breaking Passes …` column in the CSV is empty — so Phase B for
  Iceland is events-only, no spatial layer.)

## Phase 0 — StatsBomb CSV import (the concrete, ship-first path)

Mirror the Wyscout import exactly: a **"Import StatsBomb stats"** panel (clone
`TeamStatsImportPanel`) → a new **`statsbombCsv` adapter** → the same
provider-agnostic store + resolver. No API, no secrets.

**File shape (from the real export).** One row per match for the club. The `Match`
column is `"Home vs. Away"`; the row's own metrics are the club's, and the
opponent's are in the `Opposition …` columns. So a single file yields both the
own-side and against-side of every match — no separate opponent export needed.
Parse `Match` on `" vs. "`, use the team-name inference (majority / known club) to
decide which side is us → `is_home`, `opponent`, `game_week`, `date`, `minutes`.

**Column mapping (promote the coach-relevant ~50; keep the full row in `raw` jsonb;
skip the empty 360 families).** Map to the provider-agnostic interface plus the
StatsBomb-only extras:

| Provider-agnostic / promoted | StatsBomb CSV column |
|---|---|
| goals / goals_against | `Goals` / `Goals Conceded` |
| xg / xg_against | `xG` / `Opposition xG` |
| xg_per_shot | `xG/Shot` |
| open_play_xg | `Open Play xG` |
| shots | `Shots`; shots_against ≈ `Non Penalty Shots Faced` |
| passes / passing_pct | `Passes` / `Passing%` |
| passes_into_box / deep_progressions | `Passes Into Box` / `Deep Progressions` |
| crosses / box_touches | `Crosses` / `Touches in box` |
| long_ball_pct | `Long Ball%` |
| **obv** (+ splits) | `OBV`, `Pass OBV`, `Shot OBV`, `Dribble & Carry OBV`, `Defensive Action OBV`, `Opposition OBV` |
| **pressures** / counterpressures | `Pressures`, `Counterpressures`, `Pressures in Opposing Half%`, `Aggression` |
| **set_piece_xg / _goals / _shots** | `Set Piece xG`, `Set Piece Goals`, `Set Piece Shots` |
| corners: xg / goals | `xG/Corner`, `Corner xG`, `Goals From Corners`, `Shots/Corner` |
| set-piece **against** | `Opposition Set Piece xG`, `Opposition Set Piece Goals`, `Opposition Goals from Corners` |
| goalkeeper | `Goalkeeper Long Ball%`, `Goalkeeper Pass Length` |
| discipline | `Yellow Cards`, `Red Cards` |

Notes on differences from Wyscout, to encode in the resolver/UI:
- **No `possession%` or `PPDA` column.** StatsBomb gives **pressures** (raw counts)
  and OBV instead. So for a StatsBomb-sourced season, `possession`/`ppda` are null
  (or possession proxied from `Passes / (Passes + Opposition Passes)`, labelled a
  proxy); surface pressures + OBV as the pressing/value signals instead.
- **StatsBomb xG is more conservative than Wyscout's** (e.g. Breiðablik 2026:
  StatsBomb 1.38 for / 1.54 against vs Wyscout 1.94 / 2.27). The resolver must tag
  `source` so a season is never silently mixed across providers, and the UI shows
  which model produced the number.
- **The 360 families are empty for Iceland** — the adapter should ignore
  `Ball Receipts in Space …`, `Space Received …`, and every `Line Breaking Passes …`
  column (all blank) rather than store empty columns.

**Storage for Phase 0:** reuse the `sb_team_match_stats` table below (promoted
columns + `raw jsonb`), keyed `(sb_team_id or team_id, match_id/date)`, idempotent
upsert. Because the file has both sides, populate the against-metrics from the
`Opposition …` columns in the same row. Team identity: map the StatsBomb club names
(`Breidablik`, `Thor Akureyri`, `ÍB Vestmannaeyja`, `Víkingur Reykjavík`,
`KA Akureyri`, `ÍA Akranes`, `KR Reykjavík`, …) to MicroPulse teams via
`sb_team_map` + the name matcher.

### Phase 0 also covers the **player** side (two more CSV export types)

StatsBomb IQ exports player CSVs too, confirmed with fixtures
(`docs/samples/statsbomb/`). These finally fill the player side that the Wyscout
Excel path could not — importantly, **StatsBomb CSV gives per-match player data
directly**, whereas Wyscout's per-match player stats needed the paid Data API (so
MicroPulse's `player_match_stats` table is currently empty). Two files:

- **Squad export** (`Breidablik-Squad-2026.csv`, 26 players, **216 columns**,
  season aggregates / per-90) → **`player_season_stats`** (the Player Statistics
  page). Far richer than Wyscout: `OBV` (+ Pass/Shot/Dribble&Carry/Defensive splits),
  `Non Penalty xG`, `Open Play xG Assisted` (xA), `Deep Progressions`, `Touches in
  box`, `Aerial Win%`, `Pressures`, `Tackles & Interceptions`, and full **goalkeeper**
  metrics (`Goals Saved Above Average`, `Non Penalty Save%`, `Non Penalty PSxG Faced`,
  `Shot Stopping%`, `Saves`). One file = the whole squad, so it's a single upload.
- **Player match export** (`Player-MatchStats-2026.csv`, one player × 16 matches,
  **199 columns**) → **`player_match_stats`** (per-match player analysis / the player
  game-report modal). Rich per-match: minutes, shots, passes, dribbles, duels,
  pressures/counterpressures, key passes, received passes, touches in box, defensive
  actions, carries, OBV. **Caveat:** it is one file **per player**, so a full-squad
  per-match backfill via CSV is tedious (26 files); use it for key players now, and
  prefer the Data API (Phase A) for automated full-squad per-match later.

Reuse the existing player-stats import machinery: extend
`src/app/coach/player-stats` + `player-stats/upload` with a **`statsbombSquadCsv`**
adapter (season) and a **`statsbombPlayerMatchCsv`** adapter (per match), promoting
the coach-relevant metrics and keeping the full row in `raw jsonb`. Resolve each row
to a MicroPulse player via the existing name matcher into **`sb_player_map`** /
`stat_player_mapping` (exact links auto, uncertain to review, never guessed). Ignore
the empty 360 columns (`Line Breaking Passes …`, `Ball Receipts in Space …`), which
are blank for Iceland here too. Watch units: `Minutes` is a season total but most
Squad metrics are per-90 — tag the unit so the UI doesn't mislabel them.

### Phase 0 also covers **league / opponent team** exports (season profile + League Average)

StatsBomb IQ's **Team Stats** export gives a team's **season aggregates per match**
across categories, and — crucially — every file includes a **`League Average` row**,
so benchmarking is built in. Confirmed with fixtures
(`docs/samples/statsbomb/league-team-stats/`, here scouting **Valur**): IQ splits it
into one file per category —
`shooting`, `set-pieces`, `passing`, `defensive-pressing`, `obv`, a 136-column
`all-metrics`, and a `summary` (Goal Difference, npxG Difference, …). Each has two
rows: `League Average` and the team (e.g. Valur: npxG 1.56 for / 1.87 against, npxG
diff −0.31, vs League Average 1.61).

This is the **ideal opponent-scouting input** — a target team's full StatsBomb
profile *plus* the league benchmark in one export set:
- `defensive-pressing` file carries **PPDA, Defensive Distance, Aggression,
  Defensive Regains** (note: the per-match team file has no PPDA — this one does, so
  StatsBomb team-level PPDA/pressing is available here).
- `set-pieces` file is the full set-piece suite **for & against** (xG, goals, shots,
  per corner) — feeds the set-piece report directly.
- `obv`, `shooting`, `passing` cover value, shot quality (for/against), and build-up.

Add a **`statsbombLeagueTeamCsv`** adapter that:
1. Parses each category file (keyed on `Team Name`), **merges the categories** for a
   team into one season profile, and
2. Captures the **`League Average`** row into the stored **league-average reference**
   the resolver + opponent-scouting/set-piece libs already expect (no separate
   league import needed).
It feeds the **opponent-scouting** report (season profile + benchmark), the
**set-piece** report (for/against), and the league reference — all from IQ CSV, no
API. To scout every opponent, export each team's Team Stats set (or all teams at once
if IQ allows selecting all); one target team = one upload of its category files.

> **Two team-level exports — don't confuse them.** IQ has a **Team Stats** page
> (season aggregate, 2 rows incl. a built-in `League Average`, 136 cols, strong on
> `Faced`/`Conceded` splits + OBV + set-piece types; the "Custom Parameters" export
> is just this page with a user-picked column set) **and** a **Match Stats** page
> (per-match, one row per game, 222 cols, strong on granular possession/pressing
> process metrics, no `League Average`, no PPDA). Only ~50 columns overlap. Route
> **Team Stats → season profile + league reference** (scouting/set-pieces) and
> **Match Stats → `team_match_stats`** (per-match trend / wins-vs-losses). Detection
> rule: a `League Average` row ⇒ Team Stats; a `Match`+`Date` column ⇒ Match Stats.
> Full mapping + fixtures in `docs/samples/statsbomb/EXPORTS-README.md`.

**Definition of done (Phase 0):** a coach uploads the IQ CSV, Previews, Commits
(idempotent); Team Match Insight and the set-piece/opponent reports render from it
through the resolver, with `source: "statsbomb"` shown and the new metrics (OBV,
pressures, set-piece xG/goals for & against) surfaced in plain language behind
"Show details". No API, no credentials.

## Data model (new Supabase tables; migrations saved as `.sql`)

- `sb_match` — `match_id (PK), competition_id, season_id, match_date, home_team_sb_id,
  away_team_sb_id, home_name, away_name, home_score, away_score, raw jsonb`.
- `sb_team_match_stats` — per team per match: promoted columns
  `xg, xg_against, obv, ppda, pressures, set_piece_xg, passes_final_third,
  box_touches, …` + `raw jsonb`. Unique `(sb_team_id, match_id)`.
- `sb_player_match_stats` — per player per match: `minutes, xg, xa, obv, pressures,
  progressive_passes, …` + `raw jsonb`. Unique `(sb_player_id, match_id)`.
- `sb_team_map` — `sb_team_id (PK), team_id (FK teams, nullable), sb_name`.
- `sb_player_map` — `sb_player_id (PK), player_id (FK players, nullable), sb_name,
  confidence`.
- Phase B only: `sb_event (match_id, event jsonb)`, `sb_360_frame (match_id, frame jsonb)`.

Keep the full API payload in `raw` jsonb (nothing lost); promote only coach-facing
metrics to columns. RLS-scope reads to the owning team. Save every migration under
`supabase/migrations/` with a timestamp and apply it.

## ID mapping (the glue)

StatsBomb ids are its own namespace. Seed `sb_team_map` with Breiðablik →
`sb_team_id 2041` → `teams.id 94b52a06-…`. For players, resolve `sb_player_map`
against `players` using the existing name matcher (`statsIngestion/nameMatch.ts`) —
exact links auto-map, uncertain ones go to a review list (never guessed onto the
wrong player), exactly like `stat_player_mapping`. Opponent teams are matched by name
so scouting works without every opponent being a full MicroPulse team.

## Sync job

`/api/integrations/statsbomb/sync` (cron; mirror `integrations/catapult/daily-sync`):
1. For each licensed competition/season, list matches; find those newer than the last
   synced `match_date`.
2. Phase A: pull aggregated team/player stats per new match; upsert **idempotently**
   on `(sb_team_id, match_id)` / `(sb_player_id, match_id)` — re-runs update, never
   duplicate.
3. Respect API rate limits (batch, back-off); write an audit row (matches synced).
4. A manual "Sync now" trigger for a season backfill (like the Catapult resync widget).

## Provider-agnostic read layer (the important bit)

Define one interface `TeamMatchMetrics` (and `PlayerMatchMetrics`) and a **resolver**
that returns StatsBomb data when it exists for `(team, season)` and falls back to
Wyscout `team_match_stats` otherwise. Point the existing libs at the resolver, not at
a specific table:
- `matchInsights` (Team Match Insight), the opponent-scouting lib, the set-piece lib,
  the top-4/correlation analysis — all read through the resolver.
- The resolver tags each metric set with its `source` ("statsbomb" | "wyscout") so the
  UI can show provenance and so StatsBomb-only metrics (OBV, pressures) render only
  when present, behind their own tooltips.

This means: **no UI rebuild.** The same Team Match Insight and scouting screens simply
get better numbers where StatsBomb covers the league, and honest fallback elsewhere.

## Explainability & security

- New StatsBomb-only metrics (OBV, pressures, real set-piece xG) get plain-language
  labels + tooltips; jargon stays behind "Show details"; source is labelled.
- Credentials server-side only (Supabase secrets); never sent to the client, never
  logged; the sync route is the only place they're read.
- Still descriptive — never affects the readiness colour, load, or daily decision.

## Definition of done

1. Probe confirms API access + Besta deild coverage; migrations written, applied,
   committed as `.sql`.
2. Phase-A sync pulls team + player match aggregates for the licensed comps and
   upserts idempotently, with `sb_team_map`/`sb_player_map` resolving Breiðablik and
   its squad (uncertain players to review, never guessed).
3. The resolver returns StatsBomb metrics for covered team-seasons and Wyscout
   otherwise; Team Match Insight renders with `source` shown and StatsBomb-only
   metrics behind tooltips, EN + IS.
4. `npx eslint` clean; typecheck passes; unit tests cover the resolver
   (StatsBomb-present vs fallback) and the aggregate mapper.
5. No credential ever reaches the client or the logs.

## Out of scope (v2)

- Raw events + 360 ingestion and everything they unlock (set-piece routines, pressing
  maps, custom models) — a labelled phase B.
- Video.
- Anything touching readiness, load, or the daily training decision.

## Dependencies / how it fits

- Feeds the **opponent-scouting**, **set-piece**, and **passing/attacking** briefs
  through the resolver — those features get dramatically stronger on StatsBomb data
  (real xG/OBV/pressures) where the league is covered.
- Wyscout ingestion stays for leagues StatsBomb doesn't collect (scouting reach).
