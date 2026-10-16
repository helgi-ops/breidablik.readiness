# Claude Code brief — Provenance tags on load numbers (measured / estimated / stale / away)

## Why
Every readiness **verdict** already carries its provenance: `v_coach_readiness_today_v8.is_imputed`
marks a colour that was auto-filled (no check-in), and the UI surfaces it so an estimated flag never
reads as a measured hard ALERT (`DevCoachDashboardClient.tsx:491-494`, threaded through the attention
list). **Load numbers have no equivalent.** We routinely write *estimated* `player_external_load_daily`
rows — the pod-forgot fallback (`buildEstimateRow` in `estimatePod.ts`, `raw_payload_json.estimated=true`,
a squad/personal average pro-rated by minutes) and, now, *away* camp rows from the national-team upload
(`raw_payload_json.away=true`). On screen those render **identically to a real device reading**: a coach
looking at Anton's, Hlynur's or Höskuldur's distance/player-load/ACWR cannot tell a measured number from
an estimate or a carried-forward stale one.

That violates the manifesto's first principle (decision provenance is mandatory) on the load side, and
it's the natural follow-on to the pipeline health-monitor (#2.1): the monitor proves the *pipeline* is
alive; this proves each *number* is what it claims to be. **Trust is the product.**

## Principle
Every load number a coach sees should be able to say where it came from, at a glance:
- **measured** — a real device/manual reading (`raw_payload_json.estimated !== true` and not away).
- **estimated** — the pod-forgot fallback (`raw_payload_json.estimated === true`). The value is a model
  fill, not a measurement.
- **away** — a real measurement, but taken elsewhere (national-team / away camp, `raw_payload_json.away
  === true`). Real, but not the club's own context.
- **stale** — the freshest row feeding this number is older than expected for a player who has been
  training (carried forward / no new reading in N days). Computed, not stored.

Estimates and away rows **still feed baselines and ACWR** (they're the best available truth, and
`estimated:false` is deliberate for away) — this brief does **not** change any math. It only makes the
provenance **visible** so the coach can weigh the number. Layered read (manifesto): the tag is a small,
unobtrusive marker on the number; the "why" (method, baseline, date) lives in a tooltip / Show-details.

## What already exists (reuse — this is mostly a surfacing feature)
- **The data is already tagged.** `player_external_load_daily.raw_payload_json` carries `estimated`
  (`estimatePod.ts:119-126`: `{ estimated:true, method, fallback, baseline, minutes, entered_by }`) and
  `away` (`catapult-openfield/parser.ts openFieldDayToDbRow`: `{ away:true, estimated:false, event,
  source_detail }`). Real device rows have neither flag set. **No new columns needed** to distinguish the
  three — only a read + a tag.
- **The readiness mirror to follow.** `is_imputed` is exposed on `v_coach_readiness_today_v8`
  (`supabase/migrations/20260721090000_expose_is_imputed_on_coach_readiness_view_v8.sql`) and surfaced as a
  non-alarming provenance marker. Mirror that treatment for load.
- **Freshness constants.** `dataQuality.ts` `FEED_SILENT_DAYS = 14`; the pipeline-health
  `external_load_ingestion` check already reasons about silent GPS feeds. Reuse the idiom for "stale".
- **The load read layer.** Load surfaces read `player_external_load_daily` (and the load-plan / ACWR
  engines). The read already selects rows per player-day; it just drops `raw_payload_json` before display.

## The gap (what to build)

**1. One pure helper + one shared badge.**
- `src/lib/micropulse/load/provenance.ts` (pure, tested): `loadRowProvenance(row, { today, trainedButStale? })
  → { tier: "measured"|"estimated"|"away"|"stale"; why: Bi; method?: string; ageDays?: number }`.
  - `estimated:true` → `estimated`; `away:true` → `away`; else `measured`. A `stale` overlay when the row
    (or the latest row feeding an aggregate) is older than a freshness threshold for a player who has been
    training since. Keep thresholds as named constants (reuse `FEED_SILENT_DAYS`-style).
  - For an **aggregate** (e.g. an acute-week sum, ACWR, a 28-day mean): `aggregateProvenance(rows)` →
    the worst/most-cautious tier among the contributing rows + the count estimated/away, so a week that is
    "4 measured + 1 estimated" reads honestly ("1 of 5 days estimated").
- `src/components/coach/LoadProvenanceBadge.tsx` (shared): a small pill/dot (not a full label) rendered
  next to a load number; bilingual tooltip explaining the tier + the estimate method/baseline or the
  staleness age. Colour-neutral (it is NOT a traffic-light; it must never be mistaken for a readiness
  colour — use a muted grey/outline style, an "ℹ"/"~" marker for estimated, a small plane/"away" glyph).

**2. Thread provenance through the load read.**
- Wherever load rows are loaded for display, keep `raw_payload_json.estimated` / `away` and the row `date`
  on the lite row (they're currently dropped), and compute the tier via the helper. Representative readers
  to update: the GPS/External-Load Today tab + `load-intelligence` tabs, `SquadLoadTable.tsx`,
  `PlayerLoadAcwrCard.tsx`, `PlayerHistoricalSnapshotCard.tsx`, `PeakPeriodCurveCard.tsx`,
  `MdHsrComparisonCard.tsx`, `FosterMonotonyStrainCard.tsx`. (One shared lite-row shape so the badge is
  wired once, not re-derived per card.)

**3. Apply the badge on the key surfaces (layered-read, unobtrusive).**
- A per-day cell/number that is estimated/away/stale gets the badge; a measured number shows nothing
  (silence = measured, so the screen isn't peppered). Hover → the "why" (method, baseline, the camp event
  name for away, or "last reading N days ago" for stale).
- For **aggregates/ACWR**: a single badge + "N of M days estimated/away" in the tooltip, so a coach knows
  how much of an acute:chronic ratio rests on fills.
- **PDF exports** (season report, KSÍ report) that print load numbers should carry a footnote/marker for
  estimated/away rows, so an exported number is as honest as the on-screen one.

**4. (Optional, flag) a one-line legend** on the External-Load surface ("~ estimated · ✈ away camp ·
stale = carried forward") so the markers are self-explanatory the first time.

## Guardrails / tests
- **No math change.** Estimated + away rows still feed baselines/ACWR exactly as today; `estimated:false`
  on away rows is preserved. This brief only reads `raw_payload_json` and renders a marker.
- **Not a readiness colour.** The badge is provenance, not a verdict — muted, never green/amber/red, never
  mistaken for `final_color`. Boundary: nothing here reads or writes `readiness_entries.color` /
  `v_coach_readiness_today_v8` as a verdict, and no data is changed.
- **Silence = measured.** A measured number shows no badge (don't clutter); only estimated/away/stale are
  marked. Mirrors "don't cry wolf on healthy Lite teams" from `dataQuality.ts`.
- **Real-data check:** Anton Logi, Hlynur Freyr, Höskuldur — their known estimated / camp rows render as
  `estimated` / `away` respectively, with the method/event in the tooltip; their genuine device days read
  as `measured` (no badge).
- **Pure helper tested:** `estimated:true → estimated`; `away:true → away`; neither + recent → `measured`;
  neither + old-while-training → `stale`; aggregate of mixed rows → cautious tier + correct counts.
- `npx eslint` on changed files; typecheck; `npx vitest` the provenance helper. No migration expected (the
  flags already exist in `raw_payload_json`); add one only if a surface needs a column the read doesn't yet
  select.

## Why this shape
It mirrors the readiness `is_imputed` provenance exactly, one layer down, and finishes the trust layer:
the pipeline monitor says the feed is alive, the provenance tag says each number is measured / estimated /
away / stale. Together they make "what the coach sees is what the data actually is" true on the load side —
and they set up P4 (every engine emits a provenance-carrying chip to Today).
