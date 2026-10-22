# Strength periodization across the season (off / pre / in-season) — research synthesis for MicroPulse

Purpose: a research-grounded model for how **strength training** should be periodised across the football
season, to add a **season-phase strength layer** on top of MicroPulse's existing in-season MD-microdose
engine. Framed for the Icelandic calendar (season ≈ May–Sept/Oct; long off/pre-season Oct–April).

## What MicroPulse already has (build on, don't duplicate)

- **Season-phase detection on the LOAD side:** `periodization/index.ts` `detectSeasonPhases` →
  `preseason | competitive | offseason`, macro→meso→micro (blocks + MD week).
- **In-season MD-microdose strength engine:** `strengthProgramming` — MD-4 strength, MD-3 power, MD-2
  activation, MD-1 primer, MD+1 recovery.
- **Missing:** the strength program does not yet *change its goal by season phase* (hypertrophy → max
  strength → power in pre-season; maintenance in-season; reconditioning off-season). That is the gap.

## The season map (Iceland)

| Phase | Iceland timing | Strength goal | Volume / intensity |
|---|---|---|---|
| **Off-season / transition** | ~2–4 wk after last match (Oct–Nov) | Recover, then STOP the bleed — minimum maintenance | Low volume, moderate intensity; avoid full detraining |
| **Pre-season (prep)** | ~Nov–April (long, in Iceland) | Build: hypertrophy → **max strength** → **power/speed** | High→moderate volume, rising intensity; block-sequenced |
| **In-season (competitive)** | ~May–Sept/Oct | **Maintain** strength/power + express it; manage match fatigue | Low volume, HIGH intensity (neural), microdosed |

Iceland's unusually long prep window is an asset: there is time for a full hypertrophy→strength→power
progression that congested European calendars can't fit.

## 1. Off-season / transition — don't detrain

- **The reality:** strength detrains *slower* than aerobic fitness, but meaningful loss appears within
  ~2–4 weeks of complete rest, and neuromuscular/power qualities fade first (Mujika & Padilla 2000).
- **Model:** a short true rest (physical + mental recovery), then **reconditioning** — re-grease movement
  patterns, restore work capacity, address the season's accumulated asymmetries/deficits before loading
  heavy. Keep a **minimum maintenance dose** (even 1 low-volume session/wk) to protect the pre-season
  starting point. Screen (movement, force plates, isokinetic) to set individual pre-season targets.

## 2. Pre-season — the block sequence (the core of the build)

Block/phase-sequenced, primary quality per mesocycle (managing concurrent-training interference):

1. **Hypertrophy / strength-endurance (~3–4 wk):** cross-sectional area + force-production base +
   tissue tolerance. Higher volume, moderate load. Foundation that makes the later phases respond
   (stronger athletes gain more from power training — Cormie/Suchomel).
2. **Maximal strength (~4 wk):** heavy, low-rep, neural. Raises the force ceiling — the single biggest
   lever on sprint/jump/change-of-direction. Velocity-based or RPE-autoregulated to individualise load.
3. **Power / high-velocity + speed (~3–4 wk):** ballistic, contrast/complex, plyometric, sprint. Converts
   strength into fast force. Taper volume into the season opener.

Cross-cutting in pre-season: **injury-prevention foundation** built here and kept year-round (Nordic
hamstring, Copenhagen adduction, calf/eccentric); **concurrent training** — sequence heavy strength and
high-intensity running to limit interference (well-structured concurrent can raise power + aerobic +
speed *without* more total volume — Barça IH). **Less volume, more intensity** as the season nears.

## 3. In-season — maintenance by microdosing (this is where MicroPulse already lives)

- **Minimum effective dose:** **one quality strength session per week maintains** the strength, sprint
  and jump gains of pre-season across the first ~12 weeks; **one session every two weeks loses ~10% of
  1RM half-squat** (Rønnestad et al. 2011). So the in-season job is *retention*, not building.
- **Frequency vs distribution:** over 6–12 wk, frequency matters little if weekly volume is equated
  (Cuthbert et al. 2021) — so volume can be **distributed across the microcycle** (MD-4 strength, MD-3
  power…) rather than one big day. This is exactly MicroPulse's MD-microdose model.
- **Congested caveat:** with ≥2 matches/week and recovery-dominant weeks, strength *will* erode over a
  full season unless protected — so congested blocks need a deliberate top-up, and international/domestic
  breaks are **in-season mini-strength-blocks** to re-stress the ceiling.
- **Express, don't just maintain:** MD-3 power / MD-2 activation keep fast-force sharp near the match;
  MD-1 primer potentiates; MD+1 rebuilds by match minutes (already in the engine).

## Cross-cutting principles (all phases)

- **Individualisation:** load off the player's own 1RM/e1RM (VBT or the non-VBT RPE/e1RM path) and his
  deficits (isokinetic hamstring, force-plate asymmetry, position demands).
- **Autoregulation:** velocity caps (Pareja-Blanco) or RPE/RIR when no VBT — adjust to daily readiness.
- **Injury prevention is not a phase** — eccentric hamstring/adductor/calf work runs year-round; it's the
  one thing you never fully drop.
- **Monitor, don't guess:** ACWR/load context, readiness, and retest (strength every 4–6 wk; the fitness
  tests) confirm the phase is working.

## How this maps to MicroPulse (the build)

The in-season microdose is done. The addition is a **season-phase strength goal** that rides on the
existing `detectSeasonPhases`:

- Off-season → reconditioning + minimum-maintenance templates.
- Pre-season → a **block sequence** (hypertrophy → max strength → power) driving the strength engine's
  emphasis + %1RM/velocity zones, tapering into the opener.
- In-season → the current MD-microdose (retention), with a **break = mini-block** trigger and a
  **congested-week strength-protection** flag.

Each phase sets the strength emphasis, intensity zone and volume the engine already knows how to lay out
— so it's a periodisation *layer*, not a new engine. Descriptive/coach-owned; never the readiness colour.

## Citations

- Rønnestad, Nymark & Raastad 2011 — *In-season strength maintenance training frequency in professional
  soccer* (1×/wk maintains; 1×/2wk loses ~10% 1RM).
- Cuthbert et al. 2021 (Sports Medicine) — resistance-training frequency meta-analysis; volume can be
  distributed across the microcycle.
- Mujika & Padilla 2000 — detraining (strength vs aerobic loss timelines).
- Cormie, McGuigan & Newton 2011; Suchomel et al. 2016 — strength underpins power; stronger athletes
  respond better to power training.
- Pareja-Blanco et al. 2017 — velocity-loss thresholds (autoregulation).
- Silva et al. 2015; Pillitteri et al. 2026 (narrative review) — strength training methods in soccer.
- McCall et al. / Bahr — year-round injury-prevention (Nordic, Copenhagen, eccentric).
- Barça Innovation Hub — pre-season: less volume, more intensity; concurrent training.

## Sources (verification)
- Rønnestad in-season maintenance: https://www.ovid.com/jnls/nsca-jscr/abstract/10.1519/jsc.0b013e31822dcd96
- Frequency meta-analysis (in-season implications): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8363540/
- Concurrent strength+HIIT pre-season: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10099725/
- Barça IH pre-season (less volume, more intensity): https://barcainnovationhub.fcbarcelona.com/blog/pre-season-in-football-less-volume-more-intensity/
