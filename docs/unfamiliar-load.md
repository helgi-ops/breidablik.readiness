# Unfamiliar Load — movement-drift detection (design)

**Status:** design / not yet built. This document specifies the next major signal layer for MicroPulse. It exists so we build the right thing before touching code; it must satisfy [`explainability-first.md`](./explainability-first.md).

---

## Why this, why now

After the June 2026 conversation with Niklas Virtanen (Head of Sports Science, FC Midtjylland) and his Catapult article *"Data as a Language"* (March 2026), one idea stands out as both his core mental model and our biggest unbuilt differentiator:

> The primary risk signal is **not high load — it is _unfamiliar_ load.**

Players tolerate very demanding movements **when those movements are part of their normal behaviour**. Risk and performance drop rise when an athlete is suddenly exposed to **unfamiliar movement patterns at high intensity** — drifting into behaviours their body is less prepared to repeat — *even when total load looks normal*.

This reframes our whole load story. ACWR (volume up/down) is necessary but shallow; it answers "how much?". The deeper question Niklas acts on is "**is this player still moving like himself?**" — and that is answerable today from data we already ingest.

### The Engine / Driver split (Niklas's framing)

| Layer | Source | Question it answers | MicroPulse status |
|---|---|---|---|
| **Engine** | GPS — total distance, HSR, sprint | Is the player physically capable / robust enough to compete? | Built (Load Intelligence, ACWR, load-plan) |
| **Driver** | IMA / FMP — change-of-direction, explosive micro-actions, multi-directional intensity, contacts | Is the player moving the way his role demands — and the way *he normally does*? | **Partly built** (IMA band 5–8 distance, per-band data) — **not yet surfaced as a behaviour-drift signal** |

Unfamiliar Load lives in the **Driver** layer. We already have the inertial data; we have not yet turned it into "is he drifting from his own movement signature?".

---

## What we already have (the engine is here)

- **IMA / FMP band data** per player per day in `player_external_load_daily` (per-band distances incl. `ima_fr_band58_total_distance`, accel/decel B2–3 effort counts).
- **Personal-norm engine**: `src/lib/micropulse/baselines` — `flagAgainstBaseline()` computes a z-score deviation from a player's own rolling baseline for any metric. Today it is used mostly for wellness, not movement.
- **ACWR on IMA running load**: `src/lib/micropulse/imaRunningLoad.ts` (z-score of today vs the player's recent training-day distribution).
- **Attention surfaces** (player-level): Daily Briefing `topAttention`, load-plan `topAttention`, Weekly Narrative.

The gap is a dedicated **signal-level** layer that says: *"Player X's movement signature drifted from his own norm this week — here is which component, by how much, and what to do"* — and surfaces it on the morning brief, not buried in a tab.

---

## The signal: a Movement Signature, and drift from it

### 1. Define a per-player Movement Signature
A vector of role-relevant inertial components, each expressed **relative to the player's own recent norm** (not absolute, not squad-relative):

- Multi-directional / change-of-direction volume (FMP dynamic; IMA band 5–8 distance)
- Explosive micro-actions (high-intensity accel + decel B2–3 effort counts)
- Deceleration share (decel effort relative to accel — braking signature)
- High-intensity multidirectional **share of total** (IMA distance ÷ total distance) — catches the "same distance, different movement" case Niklas describes

Each component → a personal baseline (mean + SD) over a rolling window (default **28 training days**, minimum **8 observed** before it reports, mirroring `playerLoadAcwr`).

### 2. Compute drift
For each component today (or this micro-cycle), compute the z-score vs the player's own baseline. Two drift modes matter:

- **Intensity drift** — a component is ≥ ~1.5 SD above his norm (he's doing more of a movement than he's built up to).
- **Shape drift** — the *mix* changed: e.g. multidirectional share jumps while total distance holds flat. This is the literal "same meters, different movement" fatigue source.

### 3. Role normalization (phase 2)
Niklas's "pocket midfielder vs winger" point: a midfielder's normal multidirectional share is high; a winger's is sprint-heavy. So the baseline should be **the player's own role-norm**, and a secondary reference is the role-group norm (to catch players with too little history). Start with personal norm (phase 1); layer role norm in phase 2.

### Why drift, not absolute thresholds
"Unfamiliar" is by definition relative to the individual. A high multidirectional volume is fine for a player who always produces it; it is a flag for one who doesn't. This is also why it is *more* defensible than ACWR-as-injury-risk: we make a descriptive claim ("he is operating outside his usual envelope"), not a predictive injury claim.

---

## How it surfaces — the "what to look at" layer

This doubles as the **Attention Router** (signal-level attention) discussed after the meeting. Output for a coach, in priority order, suppressing everything normal:

> **Player X — unfamiliar load.** Multidirectional volume is **+2.1 SD** above his 4-week norm this week, while total distance is normal. He is moving more sharply than his body has recently been prepared for.
> **Why it matters:** unfamiliar high-intensity movement, not total load, is the drift Niklas flags.
> **Suggested action:** keep his total load, but reduce role exposure to tight-space / change-of-direction tasks for 1–2 days, or phase the new demand in gradually.
> **Confidence:** 31 training days of baseline · 5/5 inertial components present today.

Ranking score = `deviation magnitude × actionability × confidence`. Only exceptions are shown; a player moving like himself never appears.

---

## Explainability-first compliance (the five-question check)

1. **Provenance?** Yes — every flag names the component, the player's own baseline (mean/SD/window), and today's value. Click-through shows the trace.
2. **Readable in five seconds by a non-S&C coach?** Yes — headline is "he's moving more sharply than usual", jargon (IMA, FMP, z-score, SD) sits in tooltips per principle #2.
3. **Answers "why" as well as "what"?** Yes — "unfamiliar high-intensity movement is the drift that matters", with the counterfactual ("if multidirectional share were within ±1 SD → no flag").
4. **Recommendation visible and overridable?** Yes — suggested action is shown with reasoning; coach can dismiss with a logged reason (principle #6).
5. **AI labelled, cites real data?** The detector is **rules**, not AI (rules decide). An optional AI layer may *summarise* the week's drift narrative — labelled "✨ AI synthesis", citing the same components (principle #5).

Confidence is quantified (baseline maturity + component coverage), never hidden (principle #4). Citations: Catapult FMP whitepaper; the "unfamiliar load" thesis (Niklas Virtanen / Catapult 2026); personal-norm flagging (Robertson 2017); CoD/asymmetry context (McBurnie 2022, Bishop 2020).

---

## Relationship to ACWR (and the reframe already shipped)

ACWR stays — as the **Engine-layer volume check**, reframed away from injury-prediction toward workload management (done: user-facing strings now say "load spike / workload-management signal, not an injury predictor — Impellizzeri 2020"). Unfamiliar Load is the **Driver-layer behaviour check** that sits beside it. Together they read as Niklas's two layers:

- Engine (ACWR/GPS): *is the volume jumping faster than he's built up to?*
- Driver (Unfamiliar Load/IMA): *is he still moving like himself?*

Method note: prefer pairing the rolling ratio with an **EWMA** variant and an absolute week-over-week delta so the "spike" is the headline, not the ratio (Williams 2017, Murray 2017). Tracked as a follow-up to this doc.

---

## Phased build

1. **Phase 1 — personal-norm drift detector (lib + endpoint).** `movementSignature` lib over `flagAgainstBaseline`; per-player drift on the four components; an endpoint returning ranked exceptions. Deterministic, cited, confidence-gated.
2. **Phase 2 — Attention Router surface.** Signal-level "what to look at today" card on the coach Today view; counterfactual + suggested action per item; dismiss-with-reason.
3. **Phase 3 — role normalization.** Role-group baselines as a secondary reference; "pocket vs winger" specificity.
4. **Phase 4 — Engine/Driver information architecture.** Reframe the load surfaces as Engine (GPS) vs Driver (IMA) so the whole product speaks Niklas's language; player "movement narrative" / profile view ("moving like himself over the season").

Phase 1 is the smallest shippable proof and the right place to start.

---

## Open questions

- FMP dynamic/linear split: do we have the raw FMP categories per session, or only the derived band distances? (Determines how cleanly we model "shape drift".)
- Micro-cycle vs daily granularity for the baseline window (MD-relative may be cleaner than calendar days).
- Minimum history before role norms are trustworthy.
- Whether "shape drift" (mix change at flat volume) needs its own visual distinct from "intensity drift".
