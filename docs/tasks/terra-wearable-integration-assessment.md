# Terra (tryterra.co) — wearable-integration assessment for MicroPulse

**Verdict:** strategically strong, gated on demand. Terra is a unified API (500+ wearables — Garmin,
Oura, Whoop, Fitbit, Apple Health, Polar, Eight Sleep …) with a single normalised schema + real-time
HR streaming. It would give MicroPulse **objective overnight recovery data** (sleep, HRV, resting HR)
via ONE integration — the exact gold-standard readiness signals the research supports and the one gap
the readiness core still has. Build it **when player device-adoption + willingness-to-pay justify the
monthly cost**, not before.

## Why it fits MicroPulse (the strategic case)
- Readiness today is mostly **subjective** (check-ins: sleep, soreness, fatigue) + Catapult GPS + VALD +
  HR belts. It lacks **objective overnight** signals (HRV/RMSSD, resting HR, measured sleep).
- The HR/HRV evidence base (`docs/research/heart-rate-football-evidence.md`) names morning/overnight
  HRV, resting HR and sleep as the strongest recovery/readiness markers — and the check-in reliability
  work showed self-report can be auto-filled/erratic. Objective data **backs the subjective check-in**.
- One integration unifies the wearable side (today Polar/STATSports/WIMU/Catapult are each built
  separately); future devices become one API + one schema.

## What to ingest (start minimal)
- **Overnight HRV (RMSSD / Ln rMSSD)** → the HRV recovery-trend signal (`checkin-reliability` +
  `heart-rate-intelligence-thresholds-brief.md`): 7-day rolling vs personal band, descriptive.
- **Resting heart rate** (morning) → recovery companion + fitness-trend context.
- **Sleep** (duration + quality/stages) → objective backing for the sleep check-in question.
- (Later) daily activity / steps for non-training-day load context.
Skip the noisy stuff first (beat-by-beat streaming, workouts) — MicroPulse already has GPS for training.

## Where it plugs in (all descriptive — never the readiness colour)
1. **Readiness confidence + the HRV recovery-trend chip** — objective HRV/RHR/sleep raises confidence
   and can surface a "recovery trend" chip beside the colour (via `coach_signals`), never as the colour.
2. **Check-in reliability** — when a player's watch data disagrees with their self-report (says "slept
   4h" but reported "great sleep"), that's a strong reliability signal (extends
   `checkin-reliability-signal-brief.md`).
3. **HR Intelligence v2** — resting HR + HRV feed the recovery/fitness reads already briefed.

## Blockers / gates (why NOT now)
- **Device adoption.** Value = players actually wearing Garmin/Oura/Whoop consistently. Spotty at
  Icelandic club level. Start **opt-in per player**; only worth wiring when a club has a wearing cohort.
- **Cost.** Terra ~$399/mo (annual) / ~$499/mo, credit-scaled on active authentications + events. Real
  monthly cost for a founder-stage startup — gate on demand; fits the **ELITE** tier value story
  (objective recovery = a premium differentiator), not FREE/LITE.
- **GDPR / consent.** Wearable health data = special-category (GDPR Art 9). MicroPulse already has the
  player-owned consent model (`player_consents`) + DPA — **add a new consent type "connect my wearable"**
  and keep it player-revocable (the existing Friðhelgi-tab pattern). Data stays on EU servers.

## Build shape (when triggered)
- New integration `src/lib/integrations/terra/` (auth widget → webhook → normalise → store), mirroring
  the existing `integrations/*` pattern (Catapult/VALD/Polar). Terra pushes via webhook (like the VALD
  webhook already in place) — reuse that shape.
- Store to a `player_wearable_daily` table (sleep, hrv_rmssd, resting_hr, provenance, source='terra').
  Save the migration `.sql` under `supabase/migrations/`.
- Per-player opt-in connect flow + consent row; unmatched/unconnected players simply have no wearable
  signal (graceful, like the no-GPS gate).

## Pricing the add-on (unit economics — verified from Terra's pricing page)
Sell it as a **plan-independent wearable add-on** (Pro or Elite): **14.990 kr/mo per club**.

**Terra's cost to us (Quick Start):** **$399/mo billed annually (~56.000 kr)** or $499/mo monthly
(~70.000 kr), **including 100,000 credits/mo**. Credits scale on active authentications + events, but
**the first 400 events per authenticated user are free**; overage beyond 100k is $0.005/credit.

**Why the cost is mostly FIXED, not per-player:** a footballer syncing sleep + HRV + resting HR daily
generates ~150–300 events/mo — under the 400-free threshold — so each player costs ≈ 0 billable credits
until the total crosses 100k. So the $399 base covers **many players across several clubs** before any
overage. Terra even ships a "Team Sports API" for the coach use-case.

**Break-even at 14.990 kr/club (vs Terra's ~56.000 kr annual base):**

| Clubs | Revenue (14.990) | Terra cost | Margin |
|---|---|---|---|
| 4 | 59.960 | ~56.000 | ≈ break-even |
| 6 | 89.940 | ~56.000 | **+34k** |
| 10 | 149.900 | ~56.000 | **+94k** |

- Break-even at **~4 clubs** (vs ~7 at 7.990). Above that it's **high margin** (fixed cost, 100k credits
  cover a lot).
- Still a **bargain for the club**: objective HRV/sleep for the whole squad < 15k/mo, vs Whoop team
  ~$30/athlete (≈ 105.000 kr for 25 players). We charge a fraction.

**Watch-outs:**
- **Overage** only if many clubs × many players exceed 100k credits/mo → $0.005/credit (cheap, and a
  good problem). Monitor credit usage as it scales; move to Enterprise (volume discounts + BAA/DPA) later.
- **Skip the Streaming API add-on** ($99/mo) — real-time HR isn't needed (GPS covers training); we only
  want overnight recovery via the standard webhook. Keeps cost to the base.
- Confirm real credit consumption on **one pilot club** before rolling out; **launch at ~4-club demand**
  so the fixed base isn't paid into a vacuum.

## Recommendation
Put it on the roadmap as a **gated future readiness-depth addition** (plan-independent add-on, 14.990
kr/mo/club). Trigger when: a
pilot/founder club has a cohort of players wearing devices AND wants objective recovery. Then it's a
high-value, well-scoped build (one integration, feeds signals already briefed). Until then, the
subjective check-in + belt HR + VALD cover readiness, and this stays parked.

For a separate/other project that only needs Garmin: Terra is a good direct choice (one integration,
normalised, avoids the Garmin Health API approval process).

Ref: `docs/research/heart-rate-football-evidence.md`, `heart-rate-intelligence-thresholds-brief.md`,
`checkin-reliability-signal-brief.md`, `coach-signals-cache-and-today-chips-brief.md`,
`integrations/vald` (webhook pattern), the pilot contract (consent model + DPA, EU servers).
Terra facts (2026): https://tryterra.co/integrations · https://tryterra.co/integrations/garmin
