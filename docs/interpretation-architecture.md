# Spec — Capability-driven interpretation (one engine, all Catapult tiers)

> **Principle: branch on the SIGNALS a club actually has, not on its tier name.**
> Tier labels (Pro S7 / Core / Lengjudeild) are wrong/changeable; data presence is
> ground truth. A Core club that adds HR belts "upgrades" automatically; a Pro club
> with a broken IMA export degrades automatically. One interpretation engine adapts
> — we never maintain a separate "Core product" and "Pro product".
>
> This is the architecture around `loadVerdict`
> (`docs/load-intelligence-explainability.md`) and the Core upside
> (`docs/core-tier-upside.md`). Grounded in the verified Core parameter inventory
> read from Þór's OpenField (22 Jun 2026).

## Three layers

### Layer 1 — per-metric interpretation primitive (REUSE existing)
One function: value + the player's own rolling baseline → z-score → band
(low / normal / high / spike) + plain-language. **Already exists:**
`flagAgainstBaseline()` in `src/lib/micropulse/baselines` (used by
`movementSignature`). Do not rebuild — wrap it. This is the only place that
computes "vs his own norm".

```
interpretMetric(metricKey, todayValue, baseline) -> {
  z, band: "low"|"normal"|"high"|"spike",   // spike = z>=2.0, mature baseline
  plain: { EN, IS },                         // "braking efforts well above his usual"
  confidence: { baselineDays, mature: baselineDays>=8 }
}
```

### Layer 2 — DIMENSIONS, not raw variables (the key idea)
Define ~5 coach-readable dimensions. For each, pick the **best available metric the
club actually has** (capability detection). Same dimension, different underlying
column per tier → graceful degradation done right.

| Dimension (coach-facing) | Pro S7 metric | Core metric | Lengjudeild metric |
|---|---|---|---|
| **Volume** | `total_player_load` | `total_player_load` | `total_player_load` / `total_distance` |
| **Intensity** | `player_load_per_minute` | `player_load_per_minute` | `meterage_per_minute` |
| **Braking / hard efforts** | IMA `ima_decel` | `decel_b2_3_tot_effs_gen2` (Gen2 decel efforts) | `accel_decel_efforts` |
| **Sprint exposure** | IMA + `velocity_band5/6_efforts` + HSR | `velocity_band5/6_total_efforts_gen2` + `high_speed_distance` | `high_speed_distance` + `sprint_distance` |
| **Internal load** | HR (`avg_heart_rate`, if belts) | readiness check-in (sRPE) | readiness check-in |

Rules:
- Each dimension has an **ordered preference list** of metric keys; resolver picks
  the first one with data for that club/window.
- A dimension with no available metric is **omitted** (not faked) and lowers
  confidence.
- Each metric carries its plain-language label (EN/IS) and a `contested` flag
  (e.g. di Prampero metabolic power → low weight, never flips a band).

### Layer 3 — verdict synthesizer (extends `loadVerdict`)
Combine the available dimensions → one plain-language sentence + named drivers +
confidence. Identical UX for every tier; lower tiers simply have fewer dimensions
and lower confidence, shown honestly.

```
synthesizeVerdict(dimensions[]) -> {
  band, sentence{EN,IS}, drivers[], 
  confidence: { level, dimensionsCovered: n/5, baselineDays }
}
```
Band logic = rules (ACWR > ~1.5 OR any dimension spike → SPIKING, etc.). AI, if
used, only rephrases the rule-chosen sentence (labelled AI). Rules decide.

## The signal → dimension registry (single source of truth)

New file `src/lib/micropulse/interpretation/registry.ts`: a table mapping every
Catapult column → `{ dimension, plainLabel{EN,IS}, preferenceRank, contested,
unit, tooltip }`. This replaces ad-hoc metric handling scattered across the five
cards. Everything else (resolver, verdict, UI) reads from it.

```
type MetricDef = {
  key: string;                 // db column, e.g. "decel_b2_3_tot_effs_gen2"
  dimension: "volume"|"intensity"|"braking"|"sprint"|"internal";
  preferenceRank: number;      // lower = preferred when multiple present
  plain: { EN: string; IS: string };
  tooltip: { EN: string; IS: string };
  contested?: boolean;         // metabolic power, HID -> low weight
};
```

## Capability resolver (per team/window)

```
resolveCapabilities(teamId, window) -> {
  // coverage = % rows non-null & non-zero over the window, per metric key
  // a metric is "available" if coverage >= ~50%
  available: Set<metricKey>,
  dimensions: { [dimension]: metricKey | null },  // best available per dimension
  coverageByDimension: { [dimension]: number },
}
```
Detect from data, never from a `tier` column. Cache per (team, day) since it's
stable within a day. This same coverage feeds the confidence chip.

## How it maps to existing code (don't duplicate)

- Per-metric z + band → `flagAgainstBaseline()` (`baselines`). 
- ACWR band driver → `computePlayerLoadAcwr` (`playerLoadAcwr`).
- Monotony/strain corroboration → `computeFosterMetrics` (`foster`).
- Verdict shell + endpoint → `loadVerdict` lib + `/api/coach/load-verdict`
  (already specced). This architecture is the **registry + resolver + dimension
  layer** that feeds those.
- Metabolic power stays `contested` (low weight) per the integrity guardrail.

## Why this is the right way

- **One engine, not two products** — no Core branch vs Pro branch to maintain.
- **Self-upgrading** — add HR belts or change tier → new dimensions light up
  automatically, no config.
- **Honest** — the confidence layer already shows exactly which dimensions are
  missing; nothing is faked.
- **Reuses ~80%** — `flagAgainstBaseline`, `playerLoadAcwr`, `foster`, `loadVerdict`
  already exist; this wires them through a registry + capability resolver.

## Order of work

1. `registry.ts` — the metric→dimension table (start with the verified Core +
   Pro columns; mark contested).
2. `resolveCapabilities()` — coverage detection per (team, window); unit test on
   Þór (Core: braking=decel efforts, no IMA) vs Breiðablik (Pro: braking=IMA decel).
3. Dimension resolver + extend `loadVerdict` synthesizer to consume dimensions
   (not hard-coded signals).
4. Confidence = dimensionsCovered/5 + baseline maturity; surface in `LoadVerdictCard`.
5. Sanity: Anton (Pro) still reads SPIKING(braking via IMA); a Core player with a
   decel-efforts spike reads SPIKING(braking via Gen2 efforts) — same sentence,
   different underlying metric, lower confidence.
Verify: `npx eslint` per file; the user runs dev server + git.
