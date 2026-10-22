# Claude Code brief — Titan (Integrated Bionics / Hudl) indoor IMU ingestion → external_load

Goal: ingest **Titan** indoor IMU load for Njarðvík Women's Basketball (and future indoor teams) into
MicroPulse's existing `external_load`, so the readiness/load engine runs on it exactly like a Catapult
indoor team. Titan has **no usable GPS indoors** — the signal is IMU: **Player Load + Impacts + Jumps +
active durations**. Source is a **Titan Workbook that auto-syncs to a Google Sheet** (`_synced_data` tab).
Descriptive; indoor/Lite tier; never fabricate; GPS stays null.

## Confirmed source schema (verified in the live Titan→Google-Sheet sync)

The Titan "Example Indoor Report Printout" workbook syncs per-session rows to the **`_synced_data`** tab.

**Upload source — the `_synced_data` tab ONLY.** The workbook also has `_ib` ("DO NOT EDIT"), `pivots`,
`bigstat`, and `Training Report` tabs — those are internal/printout views full of `#DIV/0!` / `#REF!` and
merged cells; never ingest them (nor the "Training Report" CSV or the PDF printout). Ingest only the flat
`_synced_data` table. A ready import template with the exact (trimmed) headers is at
`titan_synced_data_import_template.csv` in the repo root — build/test the parser against it.

**Header hygiene:** the real header is `Impacts ` **with a trailing space** — trim every header before
matching (the alias set must be whitespace-insensitive).

Header row (A1:I1), exact strings (shown trimmed):

| Col | Header | → MicroPulse `external_load` | Notes |
|---|---|---|---|
| A | `Date` | `load_date` | session date |
| B | `Player Name` | `player_id` (via name match) | reuse `integrations/playerMapping` |
| C | `IMU Player Load` | **`player_load`** (anchor) | the core indoor load |
| D | `IMU Duration` | `session_duration` | minutes (col exists: `add_session_duration_to_external_load`) |
| E | `Load / Minute` | derived (`player_load`/duration) | recompute; don't need to store |
| F | `Low Active Duration` | `low_active_min` (new, optional) | intensity-minutes |
| G | `High Active Duration` | `high_active_min` (new, optional) | intensity-minutes |
| H | `IMU Jumps` | **`jumps`** | exists in `LOAD_KPIS` |
| I | `Impacts` | **`impacts`** | col exists (`add_catapult_ima_metrics`) |
| — | (no GPS columns indoors) | GPS fields → **null** | "null not zero" (data-quality) |

So the three load KPIs that matter — `player_load`, `jumps`, `impacts` — plus `session_duration` already
have homes. `low_active_min` / `high_active_min` are the only new (optional) columns.

## Reuse (don't rebuild)

- **`integrations/providers.ts`** — add a **`TITAN`** provider descriptor (alongside CATAPULT, STATSPORT,
  POLAR, GARMIN, GENERIC_CSV). Mark it **indoor / IMU-only**.
- **`integrations/` adapter + `normalize.ts` + `playerMapping.ts` + `conflicts.ts` + `status.ts`** — the
  existing alias-based ingestion pipeline (built for Catapult OpenField CSV). Titan is the same pattern:
  a fixed alias set for the 9 `_synced_data` headers → `external_load` rows.
- **`external_load`** columns `player_load`, `jumps`, `impacts`, `session_duration` — already exist.
- **Readiness/load engine** — runs on `player_load` as the anchor + ACWR, exactly as for Catapult indoor.
  No new load math. Indoor tier hides GPS surfaces (as today).

## Two ingestion paths (ship A first, B as the auto-sync upgrade)

**A. CSV upload (simplest, ship first).** Coach does `File → Download → CSV` of the **`_synced_data`** tab
→ MicroPulse CSV import with the `TITAN` alias set → `external_load`. Same upload UX as Catapult CSV.

**B. Google-Sheet auto-sync (no manual step, the upgrade).** The workbook keeps `_synced_data` current.
MicroPulse pulls it on a cron: either the **published-CSV URL** (`File → Share → Publish to web →` that
tab `→ CSV`) — no auth, read-only — or the **Sheets API** (service account the coach shares the sheet
with). Store the sheet id + gid per team. A daily cron (like `catapult/daily-sync`) reads new rows,
dedupes on (`player_id`,`load_date`), writes `external_load`. Prefer published-CSV for simplicity; note
the choice.

## New pure lib `src/lib/micropulse/integrations/titan/parseSyncedData.ts`

```ts
export interface TitanRow {
  date: string; playerName: string;
  imuPlayerLoad: number|null; imuDurationMin: number|null;
  lowActiveMin: number|null; highActiveMin: number|null;
  imuJumps: number|null; impacts: number|null;
}
/** Map the fixed _synced_data headers (alias-tolerant) to typed rows; null (not 0) for blanks. */
export function parseTitanSyncedData(headers: string[], rows: string[][]): TitanRow[];
/** Row → external_load upsert shape (GPS metrics left null; indoor). */
export function titanRowToExternalLoad(r: TitanRow, playerId: string): ExternalLoadUpsert;
```

- Alias set (case/space-tolerant): `Date`, `Player Name`, `IMU Player Load`, `IMU Duration`,
  `Load / Minute` (ignored — derived), `Low Active Duration`, `High Active Duration`, `IMU Jumps`,
  `Impacts`.
- **Null-safe:** empty / `#DIV/0!` / `#REF!` cells → null, never 0 (the summary tabs show those error
  strings before data exists — the parser must treat them as missing).
- **Name match** via `playerMapping` with a review step for unmatched names (coach confirms); never guess.

## Migration (save under `supabase/migrations/`)

- Optional: `alter table external_load add column if not exists low_active_min numeric null,
  add column if not exists high_active_min numeric null;` (only if we surface active-duration split).
- `team_integration_source` row for `TITAN` per team (sheet id + gid for path B), RLS coach/staff.

## Guardrails / tests

- Pure parser; deterministic; null-safe (blanks/`#DIV/0!`/`#REF!` → null). GPS metrics always null for
  Titan rows. Never fabricate.
- Reuse the integrations pipeline + `external_load` + readiness/load engine — no new load engine, no new
  readiness path. Indoor tier.
- **Boundary:** ingestion writes `external_load` only; the colour still comes from the normal
  readiness pipeline. No direct writes to `readiness_entries.color` / `v_coach_readiness_today_v8`.
- Tests: the 9-header `_synced_data` row maps to player_load/jumps/impacts/session_duration; `#DIV/0!` and
  blank → null (not 0); GPS fields null; name-match + unmatched-review; dedupe on (player, date); CSV path
  and published-CSV path both parse the same; indoor team hides GPS surfaces.

`npx eslint <changed files>` + tests; lint-clean. Migration saved with a timestamp prefix.

## Acceptance
- [ ] `TITAN` provider added; CSV upload of the `_synced_data` tab imports into `external_load`
      (`player_load`, `jumps`, `impacts`, `session_duration`), GPS null, indoor tier.
- [ ] Optional Google-Sheet auto-sync (published-CSV or Sheets API) on a daily cron, deduped.
- [ ] Error strings / blanks → null; name-match with coach review; descriptive-only boundary test passes.
- [ ] Readiness/load runs on `player_load` + ACWR for Njarðvík W like any indoor team; eslint+tests clean.

## Prerequisites (club side — not code)
1. Assign each `titan3` sensor to a player (Org Admin → sensors "Assigned To" — currently empty).
2. Record + USB-sync at least one session so `_synced_data` populates (it was empty: "0 sessions").
3. Keep the Indoor Report workbook's Sync on (it auto-fills `_synced_data`).

## Source of truth
Confirmed from the team's own Titan account (`stats.integratedbionics.com`, team 14613) + the synced
Google Sheet `_synced_data` tab. Indoor Titan exposes IMU only (Player Load, Impacts, Jumps, Duration,
Low/High Active Duration); GPS is empty indoors by design.
