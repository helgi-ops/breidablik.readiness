# Control-Chaos Continuum (CCC) → MicroPulse Return-to-Training — assessment + Code brief

*Reviewed Oct 2026. Four uploaded papers, all the Taberner et al. CCC body of work.*

## The papers
1. **Taberner, Allen, Cohen — BJSM 2019** ("Progressing rehabilitation after injury: consider the
   control-chaos continuum"). The original framework.
2. **Allen, Wilson, Cohen, Taberner — Phys Ther Sport 2021** ("Drill design using the CCC … knee injury").
   Applies CCC to on-pitch drill design for RTS.
3. **Taberner — SPSR 109** ("Adapting the High Chaos phase: a bridge to team training").
4. **Taberner et al. — JOSPT 2025, Part 2** ("Evolving the CCC: shifting attention to progress on-pitch
   rehabilitation"). Adds visual-cognitive / decision-making load and coaching integration.

## The framework (the usable core)
A **criteria-based (not time-based), GPS-load-driven, per-injury return-to-running progression** that moves
an injured footballer through phases from **High Control → Moderate Control → Moderate Chaos → High Chaos →
team training**, progressing **two axes together**:

- **Running load (GPS)** — expressed relative to the **player's own game load** (e.g. 0.5× → 1× → 2× game):
  total distance, high-speed running (>5.5 m/s), sprint distance (>7 m/s), explosive distance
  (accel/decel 2–4 m/s in <1 s), **accel/decel magnitude *and* frequency**, max speed, and change-of-direction
  **angle** (45°→180°).
- **"Chaos"** — control = planned/linear/structured running; chaos = reactive, unpredictable, multidirectional,
  with added **visual-cognitive dual-task + decision-making** (Part 2's VC-CCC) that mirrors the game model.

Two more load-bearing ideas:
- **Criteria-based gates between phases** — progress when the player meets **load tolerance + strength/power
  criteria**, assessed with force-plate / isokinetic diagnostics (iso peak force, RFD, CMJ height & force/impulse
  **asymmetry**, 10-5 hop **RSI**, Nordic eccentric for hamstring), tailored per injury. *Not* calendar days.
- **Per-injury load planning (their Table 1)** — e.g. hamstring: progress running **speed** (>70% max) and
  accel/decel magnitude, late-stage combine sprint + chaos; adductor: accel/decel + COD angle + technical
  actions; calf/ankle: progress **volumes** (TD, HSR, sprint) then speed; ACL: build volume first, add chaos to
  HSR/COD last. Coaches are involved from the Moderate Control phase (Part 2).

## Fit to MicroPulse — strong, because the data already exists
| CCC needs | MicroPulse already has |
|---|---|
| GPS load variables | `player_external_load_daily`: total_distance, high_speed_distance, sprint_distance, accelerations/decelerations (+ velocity/accel bands), max_vel, explosive_distance, **ima_cod** (COD) |
| Player's own **game load** as the 100% reference | match-average baseline per player (we already compute it — used for the pod-estimate for Höskuldur) |
| Per-injury context + phase | `injury_events` (injury_type, **rtp_stage 1-5**) + the rehab-protocol modules |
| Criteria gates | VALD / force-plate / CMJ / RSI / asymmetry already ingested |
| A return load plan to build on | `/coach/return-to-training/[playerId]` + the existing Gabbett 7–10%/wk ramp |

So the CCC is essentially a **more rigorous, football-specific, criteria-based version of the ramp
MicroPulse already does** — and every input it needs is already flowing in.

## Why it's the right kind of feature (scope + manifesto)
- **In-scope, not clinical diagnosis.** This is on-pitch **running-load progression** — the S&C/physio side we
  agreed MicroPulse should own ("when to progress / what the targets are"), not differential diagnosis.
- **Manifesto-perfect:** criteria-based (rules decide), every phase decision **cites its numbers** (GPS vs the
  player's own game load + force-plate), coach/physio-owned and overridable, research-cited (Taberner 2019/2025).
- **Deepens the moat (brainstorm #4).** It's football-specific return-to-running that uses the GPS + force-plate
  data a club already gives MicroPulse — exactly the vertical depth Bridge / generic tools don't have.

## Code brief — "CCC return-to-running" in the Return-to-Training module
Augment `/coach/return-to-training/[playerId]` (and its API) with a CCC layer:

1. **Phase model.** Add the 5 CCC phases (High Control → … → High Chaos → team training) as a seedable config.
   Place the returning player on the continuum from where their recent on-pitch load sits **relative to their
   own game-load baseline**, by injury type.
2. **Per-phase target bands.** For each phase, show target bands for the key GPS variables **as % of the
   player's own game load** (e.g. "this phase: HSR up to ~40% of your game; accel/decel magnitude capped; no
   sprint yet"). Compare the player's actual recent sessions to the band → on-track / under / over.
3. **Criteria-based gates (not time).** Per injury type, seed the exit criteria from Table 1 (force-plate /
   RSI / asymmetry thresholds + load tolerance). Show "cleared to progress to next phase?" with the numbers.
   Seed the injury→considerations map (hamstring/quad/calf/adductor/ankle/ACL) in a small config table.
4. **Chaos tag on sessions.** Let the coach tag each on-pitch rehab drill's chaos level
   (linear/planned → reactive/COD → decision-making/game-speed); track whether the player has met the chaos
   exposure a safe return needs. Use `ima_cod` as an objective COD proxy alongside the tag.
5. **Provenance + override.** Every phase/gate decision cites the GPS + force-plate numbers and the paper
   (Taberner). The physio can override with a logged reason (audit trail) — criteria inform, they don't lock.
6. **Boundary (mandatory):** descriptive decision-support; progresses the player's **own** on-pitch running
   load; **never** sets `readiness_entries.color` / `v_coach_readiness_today_v8`; not shown to players as a
   medical instruction. A chip can surface on Today ("Player X — RTP phase gate met / behind") per P4.

## Honest caveats
- The CCC is from **elite EPL football** with full GPS + force-plate kit; a no-GPS or no-VALD club can only use
  the qualitative chaos progression, not the load bands — gate the quantitative part on data availability
  (same tiering MicroPulse already does).
- It's a **framework/decision-support**, not a validated injury-risk predictor — keep the framing "structure +
  provenance for the physio's decision", never a guarantee.
- Don't reproduce the papers' figures/Table 1 verbatim in-product; implement the *method* with your own data and
  cite the source.
