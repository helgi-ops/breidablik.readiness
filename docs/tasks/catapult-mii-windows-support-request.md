# Catapult / Hudl support request — additional Maximum Intensity Interval (MII) windows

Ready-to-send text (English — Catapult/Hudl support). Copy the body below into the ticket/email.

---

**Subject:** Enable additional Maximum Intensity Interval (MII) windows — Breidablik Male Team (EU OpenField)

Hi Catapult/Hudl team,

We're building a duration-specific intensity profile (a full power-duration / "power curve") for our
players and would like to extend the **Maximum Intensity Interval (MII)** parameters on our account.

**Account:** Breidablik Male Team — EU OpenField (eu.openfield.catapultsports.com), football, GPS/pods.

**Current state:** our MII parameter family only contains **Distance** and **Player Load**, each with
**3 intervals** that resolve to **1, 3 and 5 minutes**. Those come through the v6 /stats API and we
already ingest them automatically.

**What we'd like:**

1. **More MII windows for Distance and Player Load** — ideally the full set
   **5 s, 10 s, 30 s, 1 min, 3 min, 5 min, 10 min, 15 min** (or as many of these as the platform
   supports). We want the short end (5–30 s) and the long end (10–15 min) as well as the current
   1/3/5 min, so the power-duration curve spans the whole range.
2. **Are the MII interval durations configurable** by us (e.g. in Averages / a parameter config), or
   is this something you provision on the account? If it's self-serve, please point us to where.
3. **Is MII available for Metabolic Power (W/kg)?** We'd like a metabolic-power MII interval series
   too (same windows), if the platform can compute it — to derive critical power in watts, not only
   critical speed from distance.

**Why:** we're fitting a critical-speed / critical-power model (D = D′ + CS·t) and profiling short-burst
vs sustained capacity. More window lengths across a wider range materially improve the fit, especially
the short-duration end.

Could you let us know what's possible on our plan, and whether any of this needs a plan change?

Thanks,
Helgi Gudfinnsson — MicroPulse / Breiðablik

---

## Context (for our own records — not part of the message)

- Verified in OpenField (2026-08): MII library = Distance + Player Load only, 3 intervals (1/3/5 min);
  no MII Metabolic Power; Metabolic Power group is band distributions, not a rolling-window series.
- Custom parameters are formulas over existing parameters (+ math functions) — they **cannot** define a
  new rolling window (5 s / 15 min), so this genuinely needs Catapult-side provisioning.
- If granted, the extra windows flow automatically through the existing sync (`miiPeakPeriod.ts` derives
  the window from each interval's start/end time — no code change needed for new Distance/Player Load
  windows; a new metric like metabolic_power would need one small extractor addition).
