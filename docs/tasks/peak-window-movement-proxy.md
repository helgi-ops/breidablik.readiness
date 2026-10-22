# Peak-window tactical proxy — movement-signature classification (Catapult-only)

**Decision:** the exact Ju 2022 Table-1 variables (Push up Pitch, Over/Underlap, Support Play, Covering …) are
**not obtainable** — they were **hand-coded from video** by analysts (~92% agreement). No feed exports them.
StatsBomb events would let us *approximate* some, but there is **no StatsBomb API key and the Data Locker /
event export does not work on this license**. So: **don't build the flagship on the 12 Ju labels.**

Instead, ship the flagship on a **movement-signature classification of the peak window, derived purely from the
Catapult data we already ingest** (`player_peak_window`, feed 2, shipped). This delivers the paper's core
question — "what is his peak intensity *made of*?" — at high confidence, with zero StatsBomb dependency.

## The 3–4 movement archetypes (from GPS/IMA in the window)

Classify each peak 1/3/5-min window from signals we HAVE (HSR, sprint, max vel, accel/decel efforts,
IMA CoD, IMA direction clock, distance):

| Archetype | Signals | Loosely maps to Ju family | Conf |
|---|---|---|---|
| **Straight-line high-speed — attacking** | high HSR/sprint, high top speed, low CoD, **forward** IMA bias | Run in Behind / Break into Box / Penetrate | high |
| **Straight-line high-speed — recovery** | high HSR/sprint, **backward** IMA bias (toward own goal) | Recovery Run | high |
| **Multidirectional / agility** | high CoD + accel/decel efforts, lower top speed, mixed direction | Close Down/Press / Covering / Support Play | high |
| **Low-intensity / trough** | low HSR + low PL/min | (the recovery dip after the peak) | high |

Direction is the key unlock: the **IMA directional clock** (already ingested — left/right/forward/back shares)
splits "forward sprint = attacking" from "backward sprint = recovery" — a real tactical distinction straight
from Catapult, no events needed. Accel/decel + CoD split "straight running" from "agility/pressing".

## Verdict + explainability (manifesto)
- **Verdict** (plain): "His peak minute is **forward attacking sprints**" / "…**backward recovery running**" /
  "…**multidirectional pressing/agility**." One sentence, no jargon.
- **(1) facts:** the % of peak-window HSR that was forward vs backward vs multidirectional; peak shape.
- **(2) details:** the raw signals + thresholds + the Ju citation as *inspiration* ("movement reduction of the
  contextualised-peak concept, not the hand-coded taxonomy").
- **Label honestly:** "movement pattern (derived from GPS/IMA)" — **not** the Ju tactical labels. Confidence
  high (direct movement signals), no faked tactical coding.

## Where StatsBomb (if it ever comes) fits — optional Phase 2
- A manual per-match event export (CSV/JSON) would **sharpen the on-ball ones** (Run with Ball = carry/dribble,
  Press = pressure, Interception) and add possession phase. 360 would add the relational ones (Over/Underlap,
  Covering). **Optional enrichment, not the foundation** — the movement proxy stands alone.

## Why this is the right call
- Uses data already in the system → ships now, no blocked feed.
- Answers the coaching question ("attacking vs recovery vs pressing peak") that actually changes training focus.
- Honest: no pretending we reproduced hand-coded tactical variables we can't get.
- Fits the flagship engine: `peakPeriodContext` classifies the window; here the classifier reads Catapult
  movement instead of aligned events. Same card, same layered read.

## Next step
Add a **movement-signature classifier** to `peakPeriodContext` (inputs: `player_peak_window` HSR/sprint/CoD +
IMA direction) → the archetype + the stacked "forward/backward/multidirectional/low" bar. Ship the peak card
with it. Keep the StatsBomb-events derivation (`ju-tactical-variables-derivation.md`) as a parked Phase-2 that
only activates if an event export ever lands.

## Data-availability caveat for Code (read before building)
- **Per-window IMA direction is the one gap.** The forward/backward split needs IMA direction *inside the peak
  window*. Today the IMA directional clock is **session-level** (`ima_clock_gen2` jsonb on the daily row), not
  per-window. So **v1 classifies on signals we DO have per window** — HSR, sprint, max vel, accel/decel efforts,
  CoD — and uses session-level direction only as a *soft* tie-breaker. The precise forward-attacking vs
  backward-recovery split is **v1.5**, once per-window direction lands (via the CTR/MII window export). Never
  fake window-level direction from session totals — gate the "attacking vs recovery" label on real per-window
  direction; until then, collapse those two into one "straight-line high-speed" archetype with a note.
- **Newly added Catapult params strengthen this** (coach added them to Reporting_Parameters, 24 Aug): **RHIE**
  (repeated high-intensity efforts: bouts / efforts-per-bout / recovery) is an excellent signal for the
  **multidirectional / repeated-sprint** archetype — wire it in. **Velocity (Gen 2)** bands = the per-window HSR.
  **MII Interval 1/3/5 Start/End Time** = the window clock position (also unlocks the event path later). These
  flow in once the coach re-exports/re-syncs and the parser maps the new fields.

Ref: `ju-tactical-variables-derivation.md` (the approximations, parked), `catapult-ctr-peak-window-ingest.md`
(feed 2, shipped), `catapult new params` (RHIE / velocity gen2 / MII start-end),
`football-peak-period-context-vs-research.md` (Ju taxonomy + Table-2 benchmark).
