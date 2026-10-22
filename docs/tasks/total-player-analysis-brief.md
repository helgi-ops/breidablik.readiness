# Claude Code brief — **Total Player Analysis** (footballer + athlete profile)

## Goal & framing

Build a **performance profile** that assesses a player on **two distinct axes**:

- **As a footballer** — technical/tactical, from Wyscout / StatsBomb.
- **As an athlete** — physical qualities, from GPS/IMA + VALD (force plates) + VBT /
  Load-Velocity + the physical-assessment battery.

For each axis: **strengths and weaknesses**, benchmarked. **Performance-only** — no
readiness colour, no injury/medical (that stays in the RTP/readiness modules). **Never a
single blended "player score"** — two separate, labelled reads. It **extends** the existing
`/coach/player-analysis` (footballer-only today) by joining athlete data on `players.id`; it
does **not** re-ingest or rebuild the existing physical modules — it aggregates and links to
them.

This is mostly **aggregation + presentation of data already in the system**, not new
ingestion. The value is the *combination*: most clubs silo footballer vs athlete data; seeing
them together — and where one translates into the other — is the differentiator.

## The athlete quality model → real columns

Assemble an `AthleteProfile` from these qualities. Every metric records its **source, date,
unit, position-percentile, and confidence**. Tables/columns are the ones that exist today
(keyed to `players.id`).

| Quality | Signals (table.column) |
|---|---|
| **Speed** | `player_external_load_daily.max_velocity` (in-game top speed); `physical_assessment_metrics` codes `max_velocity_ms`, `flying_10m_s`, `sprint_30m/40m_s` (tested). **Momentum** = `body_mass_kg` × max velocity (skip if no mass). |
| **Acceleration / explosiveness** | `player_external_load_daily.accelerations`, `ima_accel`, `explosive_distance`; tested `sprint_5m/10m_s`. |
| **Deceleration / braking** | `player_external_load_daily.decelerations`, `ima_decel`, `tot_ds`. |
| **Reactive strength / power** | `vald_forcedecks_results.rsi_mod`, `peak_power_w`, `relative_peak_power_w_kg`, `jump_height_cm`; assessment `rsi`, `drop_jump_cm`, `cmj_height_cm`. |
| **Max / relative strength** | `lv_profile_tests.est_one_rm` (per `exercise_key`); IMTP from `vald_test_metrics` (`metric_code` in `PEAK_VERTICAL_FORCE`, `ISO_BM_REL_FORCE_PEAK`); `vald_forceframe_results` (hip/groin isometric). |
| **Force–velocity profile (VBT)** | `lv_profile_tests.slope`, `profile_type`/`profile_reason` (force- vs velocity-dominant), `dsi_ratio`/`dsi_tier`; `gymaware_vbt_sessions` load–velocity (`load_kg`, `mean_velocity`, `peak_power`). |
| **Change of direction** | `player_external_load_daily.ima_cod`, `cod_events`. |
| **Work capacity / endurance (the engine)** | `player_external_load_daily.high_speed_distance`, `sprint_distance`, `hir_dist`, `total_distance`, `player_load`; **second-half maintenance / fade** (already computed in match-movement); repeated-sprint density. *No dedicated aerobic test table exists — use these GPS work-rate proxies and label them as such.* |
| **Anthropometry / robustness** | `physical_assessment_metrics` `height_cm`, `body_mass_kg`, `body_fat_pct`, `lean_mass_kg`; **asymmetry** `asymmetry_percent` from `vald_forcedecks_results` / `vald_nordbord_results` / `vald_forceframe_results` — **framed as a performance/robustness quality, not injury risk** (link to the RTP module for the medical read; do not reproduce it). |

**Footballer axis:** reuse `buildPlayerAnalysis` (`src/lib/micropulse/playerAnalysis`) as-is —
within-squad per-90 percentiles, role, `byCategory`, strengths/weaknesses from
`player_season_stats`.

## Benchmarking — by position (critical)

Raw numbers are meaningless without context ("32 km/h" means different things for a centre-back
vs a winger). Benchmark each athlete quality as a **percentile by position** (from
`players.position` / position group), plus squad and — where a reference exists — age/league.
Mirror the footballer side's within-squad percentile approach; add a position-group percentile.
Show the percentile, not just the raw value, in the primary view.

## The cross-link — footballer ↔ athlete (the unique insight)

Compute a few **translation flags** where athletic qualities do or don't show up in match
output. Each is rule-based and cites both numbers. Examples:

- High tested max velocity but low in-game top speed / high-speed distance → *"speed not
  expressed in games."*
- Strong VBT/1RM but low sprint/HSR output → *"gym strength not translating to the pitch."*
- High work capacity + low xG/OBV → *"covers ground, low end-product."*

This is the part no siloed tool gives. Keep them as labelled, overridable prompts.

## Trajectory

Each source is dated (`test_timestamp`, `session_date`, `date`, `assessment_date`). Show a
**trend per quality** (rising / stable / falling), so the profile reflects development, not just
a snapshot — especially valuable for young players.

## Integration — the hard part (keys)

- **Bridge footballer ↔ `players.id`.** `player_season_stats` is **name-matched**
  (`wyscout_player_name`), while athlete tables key on `players.id` (`microplayer_id`,
  `player_id`, `client_id`). Resolve via the existing `stat_player_mapping` / name-fold logic;
  **surface unmatched players, never guess-merge**.
- **VBT/LV lives in the trainer subsystem** (`lv_profile_tests.client_id`,
  `gymaware_vbt_sessions.player_id`, gated by `trainer_client_addons.addon_key='lv_profile'`).
  Bridge `client_id = players.id`; if the addon isn't enabled for a player, the VBT/LV section
  simply doesn't render (graceful, not an error).
- **`gymaware_vbt_sessions` has no tracked migration** — verify the table exists in the live DB
  and guard the read; if absent, skip VBT cleanly.
- **Anthropometry is sparse** (6-monthly `physical_assessment_metrics`) — use the latest row and
  label its date; if missing, skip mass-dependent metrics (momentum, relative strength).
- **No cross-source rollup table exists** (`vald_daily_player_snapshot` only rolls up VALD).
  v1 **computes the profile on read** from the source tables; a materialized rollup is a later
  optimisation (out of scope).

## Lib + API

- New pure lib `src/lib/micropulse/playerAnalysis/athleteProfile.ts` → `AthleteProfile`
  (`qualities[]`, each with value(s), unit, source, date, positionPercentile, verdict
  strength/neutral/weakness, confidence). Thresholds/weights are constants at the top; every
  flag records the numbers that fired it.
- Extend `buildPlayerAnalysis` to return `TotalPlayerAnalysis = { footballer, athlete,
  crossLinks, coverage }`.
- API: extend `GET /api/coach/player-analysis` (e.g. `?include=athlete`), coach/team-scoped like
  today. `?list=1` squad picker unchanged.

## Coach UI

On the (consolidated) **Player Analysis** page, add a **Total profile** overview at the top:

- **Two radars** — *Footballer* and *Athlete* — side by side, each with its
  strengths/weaknesses list. **Never merge them into one score or one radar.**
- **Cross-link callouts** (the translation flags).
- **Drill-down links, don't rebuild:** CMJ / force-plate → `/coach/rtp`, LV profile →
  `/coach/lv-profile`, movement → the movement pages, footballer detail → the existing
  role/percentile view. The Total profile is a **hub**.
- Explainability-first: a one-line verdict (e.g. *"strong athlete, developing footballer — pace
  and power above squad, end-product below"*) → 2–3 facts → **"Show details"** tables. Every
  metric shows source + date + confidence; percentiles are rules, any AI prose is labelled "AI"
  and only phrases the numbers. Bilingual EN/IS via the `T`-map.

## Guardrails (house rules)

- **Performance-only.** Nothing here touches the readiness colour, load decision, or medical
  view. Asymmetry and force-plate metrics are framed as **performance/robustness**, not injury
  prediction — the injury read stays in RTP/readiness (link out, don't reproduce).
- **No single blended score** — two labelled axes, always.
- **Provenance + confidence per metric**, and a **coverage** indicator (which sources this
  player has).
- **Graceful degradation** — a player with only GPS, or only footballer data, still gets a valid
  profile showing what exists; gaps read "no data yet," never broken/empty. Consistent with the
  single-source rule in the IA consolidation brief.
- **Role-scoped**, coach/performance surface; not exposed in the player app (out of scope).

## Definition of done

1. `athleteProfile.ts` joins VALD + `player_external_load_daily` + VBT/LV +
   `physical_assessment_metrics` per `players.id`, producing per-quality value/source/date/
   position-percentile/verdict/confidence; unit-tested with a fixture player (full data) and a
   sparse player (GPS-only).
2. `buildPlayerAnalysis` returns `{ footballer, athlete, crossLinks, coverage }`; percentiles
   rule-based; cross-link flags fire on the fixture; any AI prose labelled.
3. Player Analysis page renders the dual-radar Total profile + per-axis strengths/weaknesses +
   cross-links + drill-down links; explainability layered (verdict → facts → details); EN + IS.
4. Degrades gracefully for missing sources (no VALD / no VBT / no assessment / footballer-only);
   no blended score; no readiness/medical leakage; asymmetry framed as performance.
5. Name→`players.id` bridge surfaces unmatched players; VBT addon-gate + missing-table guard
   handled; mass-dependent metrics skipped when anthropometry absent.
6. `npx eslint` clean on changed files; typecheck passes; nothing touches the readiness colour
   or daily decision.

## Out of scope

- New data ingestion (uses existing VALD / GPS / VBT / assessment pipelines).
- Medical / injury / readiness integration (stays in RTP / readiness).
- A dedicated aerobic-capacity test (none exists; work capacity uses GPS proxies — noted).
- A materialised cross-source rollup table (v1 computes on read).
- Player-app exposure of the athlete profile.

## Dependencies

- **IA consolidation brief** (`stats-pages-ia-consolidation-brief.md`) — the Total profile sits
  at the top of the merged Player Analysis page and inherits its source-toggle + single-source
  rules.
- `EXPORTS-README.md` — footballer source detection (Wyscout / StatsBomb).
