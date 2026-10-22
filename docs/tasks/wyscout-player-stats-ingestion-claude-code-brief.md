# Claude Code task — Wyscout player statistics ingestion (two sources, one schema)

Paste to Claude Code (or `@docs/tasks/wyscout-player-stats-ingestion-claude-code-brief.md`).

## What this is (and the one-line why)

A source-agnostic ingestion layer that brings **per-player football statistics** (goals, assists,
minutes, plus Wyscout's deep metrics — passes, shots, xG, duels, ratings) into MicroPulse and links
them to each player, so the coach can read football output **next to** the physical GPS/IMA data
MicroPulse already holds. Deep per-player stats are **not available for the Icelandic Besta deild from
any cheap API** (API-Football reports `statistics_players = false` for league 164; verified). Wyscout
(Hudl Wyscout) is the only realistic source, and clubs already have it.

**Design principle — two front-ends, one back-end.** MicroPulse is multi-club (Breiðablik, Fylkir, …)
and clubs have different Wyscout tiers. Build ONE normalized data model with **two interchangeable
adapters** feeding it, chosen per team in config:

- **Adapter A — Excel/CSV import** (works for every club with just the Wyscout platform): the coach
  clicks *Export to Excel* in Wyscout (Advanced Search or a match report), uploads the file, MicroPulse
  parses it and maps players. Zero extra cost. This is the DEFAULT and must ship first.
- **Adapter B — Wyscout Data API sync** (optional, for clubs that bought the Wyscout Data API add-on):
  a scheduled server job pulls the same stats automatically. Uses the club's Wyscout API credentials,
  stored as a secret, never in code.

Both adapters write to the **same tables** with a `source` provenance tag, so everything downstream
(linking, dashboards, per-player views) is identical regardless of source.

## Data model (new — save every migration as timestamped `.sql` under `supabase/migrations/`)

Normalize to source-agnostic tables. Do NOT bake Wyscout column names into the schema — map them in the
adapter.

- **`player_match_stats`** — one row per player per match. Columns: `team_id`, `player_id` (FK to
  `players`, nullable until mapped), `match_date`, `opponent`, `home_away`, plus a stable core set
  (`minutes`, `goals`, `assists`, `shots`, `shots_on_target`, `passes`, `pass_accuracy_pct`,
  `key_passes`, `duels_won`, `xg`, `rating`, …) AND a `metrics jsonb` catch-all for the long tail of
  Wyscout's 150+ metrics so nothing is lost. Provenance: `source` (`'wyscout_excel' | 'wyscout_api' |
  'manual'`), `source_ref` (Wyscout match/player id or file name), `synced_at`. Unique on
  (`team_id`, `player_id`, `match_date`, `source`) for idempotent upserts.
- **`player_season_stats`** — one row per player per season (aggregates), same shape minus match fields.
- **`stat_ingestion_config`** — per team: `source` (`'excel' | 'wyscout_api'`), `wyscout_team_id`
  (for the API), enabled flag. No secrets here — the API key is a Supabase secret.
- **`stat_player_mapping`** — persists resolved `wyscout_player_name/id → players.player_id` so a name is
  matched once, then remembered (see matching below).

## Player name matching (the hard part — get it right, keep a human in the loop)

Wyscout names won't perfectly equal MicroPulse names (accents, order, nicknames, "B. Þorsteinsson").

- Normalize (strip diacritics, lowercase, trim) then match against the team's squad. Exact → auto-map.
- Fuzzy (token/Levenshtein) near-misses → surface a **review UI**: "Wyscout ‘Gudmundsson A.’ → map to
  Ágúst Orri Þorsteinsson? [confirm]". Never silently guess a low-confidence match.
- Persist every confirmed mapping in `stat_player_mapping` so it's a one-time cost per player.
- Rows that stay unmapped are kept with `player_id = null` and shown in an "unmatched" tray — **never
  dropped, never fabricated onto the wrong player**.

## Adapter A — Excel/CSV import (ship first)

- Build against a REAL Wyscout export. **Implementation step 1: obtain a sample export** (the user will
  provide one) and pin the parser to its actual columns/sheets. Wyscout exports vary by report
  (Advanced Search player list vs match report) — support the player-stats export shape, be tolerant of
  column order and extra columns, and read the metric long-tail into `metrics jsonb`.
- Upload UI on a new **Player Stats** admin/coach page: drop `.xlsx`/`.csv` → preview parsed rows +
  mapping review → confirm → upsert. Use SheetJS server-side or a Node xlsx parser in an API route.
- Idempotent: re-importing the same match/file updates, never duplicates.

## Adapter B — Wyscout Data API sync (optional, per team)

- Only active when `stat_ingestion_config.source = 'wyscout_api'` and the club has API access.
- Wyscout Data API is OpenAPI 3.0. Confirm exact endpoints against the club's API docs; expect
  team-matches, match player advanced-stats, and player season advanced-stats resources. Auth per
  Wyscout's scheme (basic/token) — store credentials as a **Supabase secret** (`WYSCOUT_API_*`), read
  in an edge function; never in the repo, never returned to the client.
- A scheduled edge function (daily / after matchdays) pulls finished matches for the configured
  `wyscout_team_id`, maps players (reusing `stat_player_mapping`), and upserts into the same tables.
- Mirror the existing `apifootball-sync` edge-function pattern; secure it (verify_jwt or a cron secret),
  not open.

## Linking to what MicroPulse already has

- Join `player_match_stats` to `player_drill_load` (GPS/IMA) and `match_player_minutes` on
  (`player_id`, `match_date`) so a player's **football output sits beside his physical output** for the
  same match. Also upsert results into `team_matches` (add `home_away`, `goals_for`, `goals_against`,
  `result`) from whichever source is active — one results source, not two.

## Explainability & honesty (manifesto — non-negotiable)

- **Provenance on every stat**: show `source` + `synced_at` ("from Wyscout export, 12 Aug" / "Wyscout
  API, auto"). Principle #1.
- **No fabrication**: unmapped players and missing metrics are shown as unmapped / "–", never zero,
  never guessed onto another player.
- **This is descriptive football data, not a readiness signal.** It must **not** touch
  `v_coach_readiness_today_v8.final_color` or the daily decision.
- **Bilingual** EN/IS, English default; jargon behind tooltips.

## Where to build

- Pure, tested adapters under `lib/micropulse/statsIngestion/` (`wyscoutExcel.ts`, `wyscoutApi.ts`)
  that both emit the same normalized `PlayerMatchStat[]` — no IO in the mappers.
- API routes for upload/parse/confirm-mapping under `api/coach/player-stats/`.
- Edge function for Adapter B (mirror `apifootball-sync`), secured + scheduled.
- New **Player Stats** page: import/upload, mapping review tray, and a per-player view that shows
  football stats alongside GPS/IMA for the same matches.
- Migrations saved under `supabase/migrations/` (CLAUDE.md). Stage specific files only; `npx eslint`
  clean; unit tests for the parser, the name-matcher (accents/order/nickname cases, confidence floor),
  and idempotent upsert.

## Acceptance

- With Adapter A: uploading a real Wyscout export creates `player_match_stats` rows, auto-maps exact
  names, surfaces fuzzy matches for review, and leaves unmatched rows visible — re-upload is idempotent.
- A per-player match view shows his Wyscout stats next to his GPS/IMA for the same date.
- Switching a team's config to `wyscout_api` (with a valid secret) makes Adapter B produce identical
  rows automatically; switching back to `excel` still works. Same schema, both sources.
- Nothing touches the readiness colour; every stat shows its source + sync time.

## Do NOT

- Do **not** hardcode Wyscout column names into the DB schema — normalize in the adapter, keep the
  long tail in `metrics jsonb`.
- Do **not** auto-map low-confidence names or drop unmatched rows — review + keep, never fabricate.
- Do **not** put Wyscout API credentials in code or return them to the client — Supabase secret only.
- Do **not** let football stats influence the readiness verdict or the daily decision.
- Do **not** build Adapter B as an open endpoint — secure and schedule it.

## Build order

1. Schema + `player_match_stats` / mapping tables.
2. Adapter A (Excel import) against a real sample export + mapping review UI. **Ship this.**
3. Per-player football-vs-physical view.
4. Adapter B (Wyscout API) for clubs that have the add-on — same tables, secured edge function.
