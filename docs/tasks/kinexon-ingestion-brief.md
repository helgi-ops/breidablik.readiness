# Code brief — Kinexon (Perform IMU) → MicroPulse ingestion

## Why this matters

Kinexon Perform is a rich IMU / local-positioning load system with an **open REST API** (demo account
already provisioned). Its export carries ~190 metrics and — importantly — **fills the two gaps the Titan
feed has**: per-session **Duration** and **Changes of Direction (total + left/right)**. It also adds
Mechanical Load, Jump Load, Metabolic Power and full HR zones. So Kinexon maps cleanly onto
`player_external_load_daily` and lets several surfaces that are currently degraded (CoD stress in MLI,
per-minute normalisation) run on real data.

Sample export confirmed: 200 columns, semicolon-delimited, UTF-8 BOM, `Duration` as `hh:mm:ss`, speed in
km/h, distances in m, metabolic power in W, jump load in J. Many values are 0/blank in the demo session
(no HR belt, indoor config) — the *schema* is what matters here.

## Two ingestion paths

**Path A — API (preferred).** Pull per-player per-session metrics from the Kinexon API and upsert into
`player_external_load_daily` with `source = 'kinexon'`. **Do not hard-code endpoints from memory** — get
the exact base URL, auth scheme (the account's open API key → header/bearer) and the
sessions/activities + metrics endpoints from the Kinexon demo account's own API reference (behind their
developer portal; not public). Store the key in an env var (`KINEXON_API_KEY`), never in code.

**Path B — Export parser (grounded fallback, ship first).** Parse the Excel/CSV export. It is
semicolon-delimited with a BOM; read headers exactly as below. This path is fully specified here and does
not depend on confirming the API, so it can land immediately and de-risk Path A.

Reuse the existing ingest infrastructure rather than building a parallel one: the Titan/Catapult pattern
(`src/lib/integrations/titan/parseSyncedData.ts`, `ingestServer.ts` with the `foldDiacritics` name matcher,
`toExternalLoad.ts`). Add a Kinexon parser + the mapping below; reuse the accent-folding player matcher.

## Variable mapping (Kinexon → `player_external_load_daily`)

| Kinexon column | MicroPulse column | Transform |
|---|---|---|
| `Player` | (match to players) | reuse `foldDiacritics` / `normName` |
| `Duration` (hh:mm:ss) | `session_duration_minutes` | parse → minutes **(fills the duration gap)** |
| `Distance (m)` | `total_distance` | — |
| `Distance (speed \| high) (m)` + `… very high` | `high_speed_distance`, `hir_dist` | sum high+very-high |
| `Distance (speed \| extreme) (m)` | `sprint_distance`, `velocity_band6_total_distance` | — |
| `Distance (speed \| very high) (m)` | `velocity_band5_total_distance` | — |
| `Speed (max.) (km/h)` | `max_velocity`, `max_vel` | ÷ 3.6 → m/s |
| `Accumulated Acceleration Load` | `player_load`, `total_player_load` | Kinexon's PlayerLoad equivalent |
| `Accumulated Acceleration Load / min` | `player_load_per_minute` | — |
| `Accel 1..4`, `Decel 1..4` | `accelerations`, `decelerations` | sum all bands |
| `Accel 3`+`Accel 4`, `Decel 3`+`Decel 4` | `accel_b2_3_tot_effs_gen2`, `decel_b2_3_tot_effs_gen2` | high-intensity bands |
| `Changes of Direction` | `cod_events`, `ima_cod` | **(fills the CoD gap)** |
| `Changes of Direction (left)` / `(right)` | `ima_cod_left_*` / `ima_cod_right_*` | — |
| `Mechanical Load` | (Kinexon mechanical load field) | surface directly / feed MLI GDS; label as Kinexon |
| `Jumps` (+ band cols) | `jumps` | — |
| `Jump Load (J)` | (jump-load field / raw_payload) | — |
| `Metabolic Power (Ø) (W)` / `(max.)` | `metabolic_power`, `metabolic_power_peak` | — |
| `Metabolic Work (kcal)` | `metabolic_energy_kj` | kcal → kJ (× 4.184) |
| `High Metabolic Power Distance (m)` | `high_metabolic_load_distance_m` | — |
| `Heart Rate (Ø/max./min.) (bpm)` | `avg_/max_/min_heart_rate` | — |
| `Heart Rate (time \| …%)` zones | `hr_zone_*_time_s` | map 6 Kinexon zones → zone columns |
| `Steps` | `footstrikes` | — |
| `Exertions`, `FCTs`, `MCTs`, sport events (Passes/Shots/Pick&Roll/Ball Possession) | `raw_payload_json` | keep raw; not load-table columns |

Set `source='kinexon'`, `source_team_id` null, `date` from the session date, `indoor` flag per the
session (Kinexon LPS indoor vs GPS outdoor — infer from config or make it a team setting). Put the full
original row in `raw_payload_json` so nothing is lost.

## Guardrails

- **Confirm, don't invent, the API.** Endpoints/auth come from the Kinexon demo account's docs; the parser
  path (above) is the grounded spec that can ship without them.
- **European number formats / BOM / `;` delimiter / `-` and blank = null.** Handle `hh:mm:ss`, km/h→m/s,
  kcal→kJ conversions explicitly; don't silently coerce blanks to 0 (that corrupts baselines).
- **Descriptive load only.** Never writes `readiness_entries.color`; no injury/tissue claim (external
  proxy — Vanrenterghem 2017). Kinexon "Mechanical Load" is a vendor metric — label it as such, don't
  equate it with tissue load.
- Reuse the existing name matcher and external-load mappers; `source='kinexon'` so it joins the existing
  `source IN ('catapult','manual','titan')` filters (add `'kinexon'` to those `.in(...)` lists — e.g.
  `load-intelligence/page.tsx` line ~118, and the dashboard GPS fetch).
- English default + IS; `npx eslint` on changed files; any DB change saved as a migration.

## Verify

- Importing the demo export creates `player_external_load_daily` rows with `source='kinexon'`, correct
  Duration (from hh:mm:ss), CoD populated, distances/speed/accel-decel mapped, raw kept.
- The GPS/Load Intelligence and Today load surfaces render for a Kinexon team (after adding `'kinexon'` to
  the source filters).
- MLI's CSS (CoD stress) now computes from real `ima_cod` for a Kinexon team (previously null on Titan).
- Boundary: readiness colour unchanged.

## Out of scope

Sport-event analytics (passes/shots) — those belong in match-stats, not the load table. Any readiness or
training-action write. Replacing Titan/Catapult — Kinexon is an additional source alongside them.

## Note for the pitch / partnership

Kinexon filling the CoD + duration gaps is a concrete reason the integration strengthens MicroPulse's
mechanical-load surfaces — tie this to the Kinexon commission partnership already in discussion.
