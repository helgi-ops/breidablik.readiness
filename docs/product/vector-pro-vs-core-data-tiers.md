# Vector Pro vs Vector Core — what each club actually gets

Reference for sales + support. Explains why two ELITE clubs can see different surfaces, which
signals each hardware tier produces, and how MicroPulse gates it. Grounded in the live data
(project `ameccgiqgokibirwfyfa`) and the code (`catapultTier`, `CoachSidebar` gating).

## Samantekt (IS)
Plan-stigið (FREE / LITE / PRO / ELITE) er **hugbúnaðurinn** sem klúbbur kaupir. Það er óháð
**gagna-stiginu**, sem ræðst af Catapult-vélbúnaðinum: **Vector Pro** (fullur IMU) á móti **Vector
Core** (GPS-grunnur). Klúbbur getur verið á ELITE-plani en samt „lite" gagna-stigi af því Core-vélin
skilar ekki IMU-breytunum. MicroPulse felur sjálfkrafa IMU-síðurnar fyrir Core-lið svo þau sjái ekki
tómar síður — og sýnir GPS-lagið sem þau hafa raunverulega.

## Two independent axes
1. **Plan tier** (`teams.plan_tier`: FREE / LITE / PRO / ELITE) — the software subscription
   (features, branding, seats). Sales-facing.
2. **Catapult data tier** (`get_catapult_data_tier` → `full` / `lite`) — what the *hardware* actually
   streams. Data-driven: honors `teams.catapult_data_tier_override`; otherwise looks at the last 30
   days of `player_external_load_daily` and returns `full` only if ≥5 rows carry B2-3 accel/decel
   efforts, else `lite`. Default `lite` (under-promise, auto-promote when data arrives).

These are orthogonal. **A club can be ELITE plan but `lite` data tier** — exactly the case below.

## Vector Pro vs Vector Core — what flows into MicroPulse

| Signal / column | Vector Pro | Vector Core |
|---|---|---|
| GPS distance, speed, HSR, sprint distance/count | ✅ | ✅ |
| Player Load, load/min, session duration | ✅ | ✅ |
| Max velocity, velocity bands (B5/B6) | ✅ | ✅ |
| Belt HR (avg/max, %HRmax, 8 zone bands) | ✅ (if belt) | ✅ (if belt) |
| **Gen2 accel/decel B2-3 high-intensity efforts** | ✅ | ✖ (B1+ aggregate only) |
| **IMA directional clock (`ima_clock_gen2`)** | ✅ | ✖ |
| **Metabolic power / FMP indoor bands** | ✅ | ✖ |
| **IMA CoD (left/right)** | ✅ | ✖ |
| **RHIE, Running Symmetry, Footstrikes** (new params) | ✅ | ✖ |

Confirmed in the live data: the four Core clubs below have **0 rows with B2-3 efforts and 0 rows with
IMA** in the last 30 days; Pro clubs (Breiðablik, HK) carry both.

## What each tier SEES in the app (gating)

- **Full (Vector Pro):** everything — Decel Intelligence (McBurnie 2022), Indoor Load (FMP), IMA
  Intelligence, full Quadrant, the peak-window **movement signature** (#2) and the IMU-driven
  **robustness** signals (#5).
- **Lite (Vector Core):** the IMU pages are **hidden** (`LITE_HIDDEN_HREFS`: `ima-intelligence`,
  `indoor-load`, `decel-intelligence`) so no empty pages appear. Instead they get **HSR Intelligence**
  (Malone 2017 — the GPS-based injury-risk counterpart to Decel). **Quadrant is kept** (it uses the
  Gabbett volume-axis variant, total-distance × sRPE, which works without B2-3). Direct navigation to a
  hidden page shows a friendly "limited Catapult tier" banner (`LiteTierBanner`), never a broken page.
- Basketball indoor teams keep IMA (it's inertial and works indoors) via `BASKETBALL_KEEP_LITE_HREFS`.

So Core clubs still get the full **GPS / load / readiness / HSR / sprint / belt-HR** layer — just not
the IMU-derived analytics.

## Current status (live, ELITE men's football)

| Club | plan_tier | override | resolved data tier | B2-3 rows (30d) | IMA rows (30d) |
|---|---|---|---|---|---|
| Afturelding | ELITE | auto | **lite** | 0 | 0 |
| Fylkir | ELITE | lite (forced) | **lite** | 0 | 0 |
| Þór | ELITE | auto | **lite** | 0 | 0 |
| Grindavík | ELITE | auto | **lite** | 0 | 0 |

(Breiðablik, HK = Vector Pro → `full` data tier.)

All four correctly resolve to `lite`, so the IMU surfaces are already hidden for them.

## Open follow-up (small)
The newer IMU-driven surfaces — the peak-window **movement signature** card (#2, on the peak-demands
surface) and the coming **robustness** signals (#5) — consume the IMA clock / RHIE. For Core clubs
they currently **degrade to an honest "no IMA data" empty-state** rather than being hidden like the
IMA Intelligence page. To match the rest of the Lite experience, add `movementSignature` (and #5) to
the `CatapultTierFeatures` gate so they're hidden on `lite` tier. Low-risk polish; nothing is broken
today (the engine already returns a graceful empty verdict).

## For sales — the one-liner
"ELITE gives you the whole platform. What you *see* also depends on your Catapult unit: **Vector Pro**
unlocks the movement/biomechanical intelligence (IMA direction, deceleration load, metabolic power,
injury-mechanics signals); **Vector Core** gives the full GPS load, high-speed running, readiness and
heart-rate layer. MicroPulse shows exactly what your hardware supports and hides the rest — no empty
screens."

Ref: `src/lib/micropulse/catapultTier/index.ts`, `CoachSidebar.tsx` (`LITE_HIDDEN_HREFS`),
`get_catapult_data_tier` (migration 20260502170000), `peakMovementSignature` (#2 engine, graceful
empty-state), `robustness-injury-early-warning-spec.md` (#5).
