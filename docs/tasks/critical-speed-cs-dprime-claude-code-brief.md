# Claude Code brief — Critical Speed (CS) + D′ from the distance power curve

Goal: add a **Critical Speed (CS)** and **D′** ("distance reserve") read per player, fitted from the
distance power curve we already populate, and surface it as a small "Conditioning profile" card on the
Load Intelligence page. This is the **field-sport (running) form of the critical-power model** — CS is
in speed, D′ in metres. It is **descriptive load/conditioning context only** and must NEVER feed the
readiness colour, the load target, or the daily decision (same rule as `peakPeriod.ts`).

Background + feasibility already established in
`docs/tasks/critical-power-w-prime-feasibility-brief.md`. Read that first. Key facts it settles:
- The watts form (critical *power*) is not native to a GPS feed and isn't available here (no MII
  metabolic power). **Do not attempt CP/W′ in watts.** This task is CS/D′ only.
- Data is already flowing: `player_load_peak_period` has `metric='distance'` at `window_min` 1/3/5,
  populated automatically by the daily sync, ~21 days and growing.

## NEW: a maximal-effort test anchor now exists (`player_running_test`)

A dedicated table **`player_running_test`** was created and populated (migration
`20260817140000_player_running_test.sql`) with each player's **best 4-minute maximal running effort**
(20 players, 975–1090 m). Columns: `player_id, team_id, test_date, test_name, duration_s (=240),
distance_m, speed_m_per_min, source='catapult_run_test_4min', notes`.

**Why it's a separate table, not `player_load_peak_period`:** these are *maximal test* efforts and their
sustained 4-min speed **exceeds the incidental MII "peaks"** for ~14/19 players (verified). Merging them
into the MII distance curve would make the speed–duration curve rise then fall (non-monotonic) and
corrupt the power curve + shape read. So they live apart and are consumed as a **true maximal-effort CS
anchor**.

**How the CS lib should use it:** treat each `player_running_test` row as a point `(t = duration_s/60,
D = distance_m)` on `D = D′ + CS·t`. Prefer these maximal-test points; you may combine them with MII
distance points **only** where the combined set stays monotonic in speed (drop MII points whose per-min
speed is below the test-derived line if they'd distort the fit). The 4-min anchor sits between the 3-
and 5-min MII points and most sharpens **D′**. (Note: `distance_m` is the coach's **as-recorded** best
4-min running distance — the coach confirms the distance is the true 4-min figure; the period-tag time
varied 3:55–4:50 only because of when the Catapult marker was started, and the extra tag time added
little distance, so the raw distance is trusted over the tag duration. Use `t = 4 min`, `D = distance_m`.)

## The model (get the units right — this is the one place to be careful)

Two-parameter critical-speed model, distance–time linear form:

> **D(t) = D′ + CS · t**

where `t` = window length, `D(t)` = peak distance covered in that window, slope = **CS** (speed),
intercept = **D′** (metres). Fit by ordinary least squares over the player's **season-best** distance
curve points.

**CRITICAL units detail.** `peakPeriod.ts` stores the distance curve value as **per-minute intensity**
(`m/min`), i.e. `PowerCurve.points[i].value = D(t) / t` (see `miiPeakPeriod.ts`, which divides the
cumulative interval by `windowMin`). So to reconstruct distance you must multiply back:

```
t_i (min)      = point.windowMin
D_i (m)        = point.value * point.windowMin      // undo the per-minute normalisation
```

Then regress `D_i` on `t_i`:

```
CS  = slope        // in m/min  → also expose km/h (× 0.06) and m/s (÷ 60)
D'  = intercept    // in metres
R²  = coefficient of determination of the fit
```

Worked sanity check (fake numbers): if the season-best distance curve is
`{1min: 190 m/min, 3min: 170 m/min, 5min: 160 m/min}` → distances `{190, 510, 800} m` at `{1,3,5} min`
→ CS ≈ 152 m/min (≈ 9.1 km/h) , D′ ≈ 40 m, R² ≈ 0.99. (A downward-sloping speed curve gives a
positive CS and a small positive D′; if the fit yields a **negative D′ or negative CS**, treat it as an
invalid/immature fit — see guardrails.)

## Files

### 1. NEW: `src/lib/micropulse/load/criticalSpeed.ts` (pure, no I/O — mirror `peakPeriod.ts` style)

Export:

```ts
import type { PowerCurve, Bi, Confidence } from "./peakPeriod";

export interface CriticalSpeedRead {
  metric: string;                 // "distance"
  csMetresPerMin: number | null;  // slope
  csKmh: number | null;           // csMetresPerMin * 0.06
  csMs: number | null;            // csMetresPerMin / 60
  dPrimeM: number | null;         // intercept, metres
  rSquared: number | null;        // fit quality 0–1
  nPoints: number;                // windows used in the fit
  csPercentile: number | null;    // vs squad, when squad CS values supplied
  dPrimePercentile: number | null;
  confidence: Confidence;         // "low" | "medium" | "high"
  verdict: Bi;                    // one plain-language line, EN + IS
  citation: string;
  caveat: Bi;
}

/** Fit CS + D′ from ONE metric's power curve (default "distance"). Pure. */
export function computeCriticalSpeed(
  curve: PowerCurve | null | undefined,
  opts?: { sessions?: number; squadCs?: Array<number | null>; squadDPrime?: Array<number | null> },
): CriticalSpeedRead;
```

Implementation notes:
- Reconstruct `D_i = value * windowMin`; drop points with null/≤0 value. Need **≥ 2** valid points or
  return an "insufficient" read (all numeric fields null, `confidence: "low"`, verdict = "not enough of
  a curve yet").
- OLS: `CS = Σ((t−t̄)(D−D̄)) / Σ((t−t̄)²)`, `D′ = D̄ − CS·t̄`, `R² = 1 − SS_res/SS_tot`.
- Percentiles: reuse the exact percentile helper pattern from `benchmarkPeak`/`curveShape.ts`
  (`below + 0.5·(equal−1)` over the pool, self-inclusive pool, need > 1 value).
- **Confidence** (reuse the peak-period maturity constant):
  - `low` if `sessions < MIN_MATURE_PEAKPERIOD_SESSIONS` (import it) OR `nPoints < 3` OR `R² < 0.90` OR
    invalid fit (CS ≤ 0 or D′ < 0).
  - `high` if `sessions ≥ 2·MIN_MATURE_PEAKPERIOD_SESSIONS` AND `nPoints ≥ 3` AND `R² ≥ 0.95`.
  - `medium` otherwise.
- **verdict** (Bi, plain language, no jargon in the primary line): e.g.
  EN: `"Critical speed ≈ 9.1 km/h with a ~40 m reserve above it — a sustainable-pace profile."`
  IS: `"Critical speed ≈ 9,1 km/klst með ~40 m forða yfir henni — úthalds-prófíll."`
  If invalid/immature: EN `"Not enough of a curve yet to fit critical speed reliably."` /
  IS `"Ekki næg kúrfa enn til að meta critical speed áreiðanlega."`
- **citation** (from `research/Critical Power`):
  `"Pettitt 2016 (critical speed & D′ from distance) · Monod & Scherrer 1965 (power-duration) · Morton & Billat 2004 (intermittent running)"`
- **caveat** (Bi) must say: CS/D′ is the running form of the critical-power model fitted from the peak
  distance at each window (1/3/5 min); it's a **field estimate** from maximal *observed* efforts, not a
  test to exhaustion; with only 3 points in the 1–5 min band **D′ (the intercept) is the uncertain
  parameter**; descriptive context that never changes the readiness verdict or the daily plan.

### 2. EDIT: `src/app/api/coach/load/peak-period/route.ts`

Add a `criticalSpeed` block to the existing response (don't create a new route — reuse the auth + the
rows already fetched). After `const read = computePeakPeriod(rows);`:

```ts
import { computeCriticalSpeed } from "@/lib/micropulse/load/criticalSpeed";
// ...
const distanceCurve = read.seasonBest.find((c) => c.metric === "distance") ?? null;
const criticalSpeed = computeCriticalSpeed(distanceCurve, { sessions: read.dataCoverage.sessions });
return NextResponse.json({ ok: true, read, criticalSpeed });
```

(Squad percentiles are optional in v1 — leave `squadCs`/`squadDPrime` unset unless you already have a
cheap squad fetch. If you add them, fetch each team-mate's season-best distance curve the same way and
pass their CS/D′ arrays.)

### 3. EDIT: the Load Intelligence page — add a "Conditioning profile (Critical Speed)" card

Mirror the existing power-curve card (`MatchPeakDemandsCard.tsx` is the pattern) and place the new card
next to the power curve on the Load Intelligence page (the page that already renders the peak-period
read, e.g. `/coach/load-intelligence`). Layered read per the explainability manifesto:
- **(0) verdict line** first and boldest (the `verdict.en`/`.is`).
- **(1) 2–3 plain facts** without a click: CS in km/h (and m/s), D′ in metres, and a confidence chip.
- **(2) "Show details"** toggle: the fitted line drawn over the reconstructed distance points, R²,
  window count, the jargon terms (CS, D′) with tooltips, and the citation.
- Respect the EN default / IS toggle already used on the page (consume the `Bi` fields).
- If `confidence === "low"` or fields are null, show the "not enough of a curve yet" state, not zeros.

## Guardrails (do not skip)

- **Descriptive only.** No import of `criticalSpeed` into any readiness/decision path — grep to confirm
  it's only referenced by the load route + the card. It must not touch `readiness_entries`,
  `v_coach_readiness_today_v8`, `stage4_*`, or any load-target code.
- **Never fabricate.** Missing/invalid fit → null + "insufficient" verdict, never 0 and never an
  extrapolated guess presented as data. Show R² so the coach sees fit quality.
- **No new DB objects.** Reads the existing `player_load_peak_period` rows via the existing route.

## Verification (run before calling it done)

1. `npx tsc --noEmit` clean; `npx eslint` clean on the new lib, the route, and the card.
2. **Unit tests** `src/lib/micropulse/load/__tests__/criticalSpeed.test.ts` (mirror
   `curveShape.test.ts`): the worked example above (CS ≈ 152 m/min / ≈ 9.1 km/h, D′ ≈ 40 m, R² ≈ 0.99);
   a 2-point fit; a flat curve; an insufficient (<2 points) input; a pathological curve that yields
   negative D′ → invalid/low confidence.
3. Hit `GET /api/coach/load/peak-period?player=<uuid>` for a player with ≥4 distance sessions and
   confirm the `criticalSpeed` block: positive CS, sane D′, R², confidence.
4. Screenshot the card in the running app and check the layered read (verdict → 2 facts → details),
   both EN and IS, and the low-confidence empty state.

## Out of scope (explicitly)

- Critical **power** / W′ in **watts** (needs metabolic/mechanical power W/kg — not in the feed; see the
  feasibility brief). Do not implement.
- The live W′-balance "energy being spent" trace (needs a continuous per-second speed stream we don't
  store).
- Feeding CS/D′ into training prescription or the readiness engine. Descriptive surfacing only.

## Citations (all in `research/Critical Power`)

- Pettitt, R.W. (2016) — CS/D′ from distance PRs / the running distance–time model (team-sport friendly).
- Monod, H. & Scherrer, J. (1965) — the power-duration / critical-power origin.
- Morton, R.H. & Billat, L.V. (2004) — the intermittent (team-sport) critical-velocity model.
