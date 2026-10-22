# Feasibility brief — Critical Speed (CS / D′), the field-sport form of the critical-power model, in MicroPulse

Question from Helgi: *can we put critical power (CP) and W′ into the system — is it calculable? It
would be great to see how players are spending energy.*

**Framing correction (Helgi, and correct):** for a GPS system this must be **Critical *Speed* (CS)**,
not Critical *Power*. Critical Power / W′ is the **cycling / ergometer** form, measured in **watts**.
Locomotion measured in **distance and speed** is described by the identical two-parameter model in its
running form — **Critical Speed (CS)** and **D′** — so CS/D′ is not a *surrogate* for CP here, it is the
**native, correct model**. Terminology map: CP (W) ↔ **CS (m/s)**; W′ (work reserve, J) ↔ **D′ (distance
reserve, m)**. The watts form only applies if you have a *power* metric (a bike power meter, or
metabolic/mechanical power W/kg) — which this GPS feed does not carry anyway.

Short answer: **partly, and the split is the whole point.** The running-world version of CP/W′ —
**Critical Speed (CS) + D′** — is buildable right now from the distance power curve we already populate,
and needs **no metabolic power at all**. **True CP/W′ in watts is *not* available in the club's current
Catapult feed** (verified live 2026-08-16: there is no MII Metabolic Power interval, and the metabolic
params now in Reporting Parameters are band *distributions*, not a power-duration series). And the part
you'd most enjoy — the live "energy being spent" trace (W′ balance) — needs a continuous per-second
stream we don't currently store. All of it is **descriptive load/conditioning context** and, like the
power curve, must never touch the readiness colour or the daily decision.

Grounded entirely in the club's own `research/Critical Power` library (citations at the end).

## 1. The model, in one paragraph

The two-parameter critical-power model is a hyperbolic power–duration relationship, most usefully
written in its linear work–time form:

> **W_lim = W′ + CP · t_lim**

**CP** (critical power) is the asymptote — the highest *sustainable* rate, the boundary between the
heavy and severe intensity domains (≈ maximal metabolic steady state). **W′** ("W-prime") is the
**fixed, finite work capacity available above CP** — the "battery" of anaerobic work (in joules),
spent when you go above CP and slowly refilled when you drop below it (Chorley & Lamb 2020; Monod &
Scherrer 1965). In running the identical model is expressed in **speed and distance**:

> **D_lim = D′ + CS · t_lim**

**CS** (critical speed) = the sustainable-speed asymptote; **D′** = the finite distance you can cover
at speeds above CS (Pettitt 2016). This running form is what maps onto MicroPulse, because we store
**distance**, not watts.

Crucially for a team sport: Pettitt (2016) explicitly derives CS and D′ from **personal records over
different distances** via linear distance–time regression — "useful when PRs are not readily available
(e.g., team-sport athletes)." Our peak-period distance curve (peak distance covered in each rolling
window) is exactly that kind of duration series. Morton & Billat (2004) further show the model holds
for **intermittent** running (critical velocity + anaerobic distance capacity), with excellent fits
(R² 0.95–0.999) — the team-sport case.

## 2. Three tiers of feasibility, mapped to our data

### Tier 1 — BUILDABLE NOW: Critical Speed (CS) + D′ from the distance power curve

We already populate `player_load_peak_period` with **distance** at 1/3/5-min windows, per player, per
session, automatically from the sync, and `computePeakPeriod` already produces each player's
**season-best** distance curve (the max distance at each window across the season — the closest thing
to a maximal effort at that duration).

From that season-best curve, fit **D = D′ + CS · t** by linear regression on the (window-seconds, peak
distance) points:

- **slope = CS** — the player's sustainable running-speed asymptote.
- **intercept = D′** — his finite "reserve" distance above CS.

This is a legitimate, literature-backed **field CS/D′ profile** per player, computed from data we
already have. No new ingestion, no raw stream. It's a new pure lib (`criticalSpeed.ts`) sitting beside
`peakPeriod.ts` / `curveShape.ts`, reading the same rows.

**Honest limits of Tier 1 (must be shown as confidence, not hidden):**

- **Only 3 points, all in the 1–5 min band.** CS (the slope) is reasonably stable; **D′ (the
  intercept) is a long extrapolation back to t=0 and will be uncertain** with no sub-minute points.
  Adding a ~15–30 s window and a ~10-min window to the peak-period extractor would materially tighten
  both — and the ADI curve spans 5 s–15 min for exactly this reason. **This is the single highest-value
  upgrade** and it's a small extractor change, not new architecture.
- **Peak periods are maximal *observed* efforts, not maximal-effort-to-exhaustion tests.** So this is a
  **field estimate** ("field CS/D′"), not a lab test to exhaustion. Label it as such and surface the fit
  **R²** so a coach sees when the line actually fits.
- Needs a **mature baseline** (reuse `MIN_MATURE_PEAKPERIOD_SESSIONS = 4`) before showing a value.

### Tier 2 — NOT NATIVE TO GPS + BLOCKED IN THE FEED: the watts form (critical *power*)

This is the **cycling / ergometer** form — critical **power** in **watts** — and it only applies if you
have a genuine *power* metric (a bike power meter, or running **metabolic/mechanical power in W/kg**).
It is **not** what a distance/speed system natively needs (that's Tier 1, CS/D′). It would require a
metabolic-power *power-duration series* (best 1-min, 3-min, 5-min average W/kg). **Player Load is
arbitrary accelerometer units, not power**, so it can't yield critical power in watts either.

**Verified in OpenField (2026-08-16, live) — the data for this does NOT exist in the club's feed:**

- The **power curve comes from the "Maximum Intensity Intervals" (MII)** parameter family via the v6
  /stats API (`max_intensity_interval_..._interval_{n}` + start/end times → windows). The **complete
  MII set in this org is only `Distance` and `Player Load`** (Interval 1/2/3 each). **There is NO MII
  Metabolic Power interval** — so metabolic power at rolling windows is simply not produced.
  *Re-verified 2026-08-16 after the coach added every MII parameter to Reporting Parameters: the full
  MII library still contains only Distance + Player Load intervals — there is no metabolic-power MII
  parameter to add. Enabling one would require Catapult/Hudl to provision it for the org; it is not a
  MicroPulse-side or coach-side setting.*
- The **Metabolic Power parameter group** that's now in Reporting Parameters is **band distributions**
  (Bands 1–8: average power / total distance / total duration / % / # efforts) plus High Metabolic
  Load Distance and a single session "Peak Meta Power." **That is an intensity *histogram*, not a
  power-duration series** — you can't fit CP/W′ to it.

So true CP/W′ in watts is **not** "one extractor change on the sync" (my earlier assumption was wrong —
corrected after checking). It needs one of: (a) Catapult to expose an **MII Metabolic Power interval**
(a platform feature we don't control), or (b) a **raw metabolic-power trace** we then window ourselves
(the same raw-data gate as Tier 3). The metabolic band params, useful as they are for describing
intensity distribution, don't unlock it.

Note (bonus, descriptive only): because **Player Load DOES have MII intervals**, we *could* fit the
same two-parameter hyperbola to the player-load curve → a "critical Player Load" + a finite
"player-load reserve." That's an internal-consistency profile (arbitrary units), **not** physiological
CP/W′ — worth a mention but must never be dressed up as watts.

### Tier 3 — NEEDS THE RAW TRACE: the live "energy being spent" view (W′ balance)

The part you called out — *seeing how players spend energy* — is the **W′ balance** model: a continuous
trace that **depletes W′ when the athlete is above CP/CS and reconstitutes it when below**, second by
second (Skiba et al. 2012; reconstitution kinetics reviewed in Chorley & Lamb 2020). It's the most
compelling visual — a live "battery draining and recharging" through a session.

It requires a **continuous per-second (or 10 Hz) power/speed trace** plus CP/CS. MicroPulse stores
**session summaries and peak-period windows, not the continuous trace**, so W′ balance is **not
computable from what we currently hold** — the same raw-data gate as ADI's mechanical-power pillar. The
realistic pathway: ingest a **per-second speed stream** (Catapult can export 1 Hz/10 Hz velocity) and
run a **distance/speed-based W′-balance approximation** against each player's CS — an honest field
version, clearly labelled, of the "energy expenditure" view. Also note (Chorley & Lamb 2020) that
individual **reconstitution time constants (τ) are still an open research question**, so the recharge
side is an estimate, not a settled number.

## 3. Proposed design (if we build Tier 1 now)

- **`src/lib/micropulse/load/criticalSpeed.ts`** — pure, side-effect free. Input: a player's
  season-best **distance** `PowerCurve` from `peakPeriod.ts`. Output: `{ cs, dPrime, rSquared,
  nWindows, confidence, verdict: Bi, citation, caveat }`. Fit `D = D′ + CS·t` by least squares; return
  R² and the window count so confidence is visible. Cap confidence low if `nWindows < 3` or R² is poor.
- **Reuse the existing table and read route** — no migration. It's a second read over the same
  `player_load_peak_period` rows the power curve already uses.
- **Squad benchmark** — reuse the `benchmarkPeak` percentile pattern so CS and D′ can be shown vs the
  squad (a high-CS / low-D′ player is an engine; low-CS / high-D′ is a sprinter — this dovetails with
  `curveShape.ts` Explosive/Engine).
- **Surface** — a small "Conditioning profile" block on the Load Intelligence page next to the power
  curve: CS, D′, the fitted line over the points, R², confidence, citation.
- **Explainability-first (non-negotiable):** descriptive context only. CS/D′ **never** feeds the
  readiness colour, the load target, or the daily decision. Every value shows its **confidence (R² +
  window count + baseline maturity)** and carries its **citation**. Missing/poor fit → "not enough of a
  curve yet," never a fabricated number.

## 4. Bottom line

- **Yes, calculable now:** CS + D′ per player from the distance power curve we already populate — a
  field critical-speed profile, one new pure lib, no new data. Ship it with R²/confidence and the
  caveat that 3 windows in the 1–5 min band make D′ the shaky parameter.
- **Biggest cheap win:** widen the **MII windows in OpenField** — add a ~15–30 s and a ~10-min interval
  to `Distance` and `Player Load` (Averages / MII config). More points across a wider band → far better
  CS/D′ (and a better power curve and shape read too), no code change.
- **The watts form (critical *power*): not native to GPS, and not in the feed anyway (checked live).**
  Critical power in watts is the cycling/power-meter form; for running it needs metabolic/mechanical
  power (W/kg). There is no MII Metabolic Power interval — only Distance + Player Load — and the
  metabolic params in Reporting Parameters are band *distributions*, not a power-duration series. Gated
  on Catapult exposing MII metabolic power, or a raw metabolic-power trace we window ourselves.
  (Correction to an earlier assumption that the metabolic export would unlock it — it wouldn't.)
- **The live "energy being spent" W′-balance trace:** the best visual, but gated on a **continuous
  per-second speed stream** we don't yet ingest; realistic as a labelled speed-based approximation
  against CS once that stream lands.

## Citations (all from `research/Critical Power`)

- Monod, H. & Scherrer, J. (1965). *The work capacity of a synergic muscular group.* — origin of the
  power-duration / critical-power model.
- Chorley, A. & Lamb, K.L. (2020). *The Application of Critical Power, the Work Capacity above Critical
  Power (W′), and Its Reconstitution: A Narrative Review.* Sports 8(9):123. — CP/W′ model, single-test
  methods, W′ reconstitution and the open τ question.
- Pettitt, R.W. (2016). *Applying the Critical Speed Concept to Racing Strategy and Interval Training
  Prescription.* IJSPP 11:842–847. — CS/D′ from distance PRs, the team-sport-friendly running form.
- Morton, R.H. & Billat, L.V. (2004). *The critical power model for intermittent exercise.* EJAP
  91:303–307. — intermittent (team-sport) validity; critical velocity + anaerobic distance capacity.
- Vanhatalo/Jones et al., *Critical Power: An Important Fatigue Threshold in Exercise Physiology*, and
  *The 'Critical Power' Concept: Applications to Sports Performance with a Focus on Intermittent
  High-Intensity Exercise* — physiological domain framing and team-sport application (in-folder).
- Skiba, P.F. et al. (2012), *Modeling the W′ balance* — the depletion/reconstitution trace (Tier 3).
- Companion: `research/Anaerobic Power Reserve` (Anaerobic Speed Reserve = MSS − MAS) — a related
  profiling lens; CS/D′ is the direct CP/W′ analogue, ASR a complementary one.
