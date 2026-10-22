# Spec — Game-Plan Fit (differentiator #1)

**One line:** per matchday, per player — *is he physically ready TODAY to execute the specific
tactical-physical demands his role requires against THIS opponent?* A transparent composite of
**role demand × opponent modifier × player capacity × readiness**, explained, advisory only.

This is the metric no competitor has: Catapult/Hudl read load in isolation; StatsBomb reads tactics with
no physical/readiness; nobody fuses **opponent scouting + player readiness + movement capacity** into a
prospective, per-player, per-game-plan fit. It's also the one the literature explicitly asks for.

## Why this is scientifically grounded (read before building — done)

- **Bradley & Ade — "Are Current Physical Match Performance Metrics in Elite Soccer Fit for Purpose or
  is the Adoption of an Integrated Approach Needed?"** The core mandate: physical output read in
  isolation is "one-dimensional / blind distances." The **integrated approach** contextualizes a
  sensitive physical metric against the **key tactical activities of each position** (overlap for a
  full-back, run-in-behind for a centre forward, closing-down collectively). Their conclusion: *"the
  tactical role of a player is a powerful determinant"* of physical demand — some positions are
  constrained by tactics, not fitness. → **read capacity against role, not a generic average.** This
  paper is the academic argument FOR exactly this feature (a stated gap).
- **Modric, Versic, Sekulic & Liposek (IJERPH 2019) — running ↔ game performance, position-specific.**
  Which running quality drives the game-performance index is **different per position**: forwards →
  **sprint distance (r = 0.80)**; full-backs → **decelerations (r = −0.43)**; central defenders →
  **running distance (r = 0.42) + high-intensity accelerations (r = 0.49)**; central midfielders →
  greatest total distance. → **the per-role demand weights come from here.**
- **Janetzki et al. (2023) — readiness markers meta-analysis (165 studies).** **CMJ jump height** is
  the validated readiness marker that predicts sprint/acceleration qualities (**r = 0.69** with 10 m
  sprint); HRV/HRR were weak/non-significant for Yo-Yo. → **weight the readiness input toward
  neuromuscular (CMJ / personal-norm) where available.**
- **"Acute and Residual Soccer Match-Related Fatigue" (systematic review + meta-analysis).** Match cost
  and the multi-day recovery timeline → the **days-since-match recovery modifier** and next-match
  availability angle.

## What it computes (four transparent layers — rules compose, AI explains)

**1. Role demand profile** — per position/role, a weighting over MicroPulse capacity axes, from Modric +
Bradley/Ade:

| Role | Primary demand (up-weight) | Source |
|---|---|---|
| Centre forward | sprint / D′ (run-in-behind), aerial | Modric r=0.80 sprint; Ade arc-runs |
| Full-back | deceleration capacity, repeatable overlap (CS) | Modric r=−0.43 decel; Ade overlap |
| Centre back | high-intensity accel, covering (CS) | Modric r=0.42/0.49 |
| Central midfielder | sustained CS / total volume, multidirectional | Modric greatest distance |
| Wide midfielder | multidirectional style, repeated sprints | Ade wide HI profile |

**2. Opponent / game-plan modifier** — from the opponent scouting report + coach week setup, the
opponent's style shifts which qualities are taxed. Encoded as modifiers on the role weights, e.g.:

- **Low-block, cross-heavy opponent (e.g. Fram: PPDA 12.7, 20.4 crosses, wins 60% duels)** → up-weight
  **sustained CS + multidirectional creation + aerial/set-piece defence**; the game will be a
  possession-chase, not a track meet.
- **High-press opponent** → up-weight **deceleration + short-burst (D′/explosive) + quick transition**.
- **Direct / counter opponent** → up-weight **recovery-run CS + decel + aerial**.

(MVP: the coach picks the opponent style from 3–4 tags. V2: infer it from the scouting report we already
generate.)

**3. Player capacity** — from MicroPulse, each normalized to the player's own norm + squad percentile:
CS / D′ (`criticalSpeed`), movement style (linear↔multidirectional), decel capacity (Decel
Intelligence), power-curve shape (Explosive/Engine), fitness tests (MAS / VIFT, `player_fitness_test`),
aerial where available.

**4. Player readiness** — personal-norm readiness colour (`v_coach_readiness_today_v8.final_color`) +
CMJ neuromuscular readiness (VALD `vald_forcedecks_results`, per Janetzki) + days-since-match recovery
state.

**Fit** = weight the player's capacity axes by the role×opponent demand, then gate by readiness →
a plain verdict per player: **strong fit / caution / poor fit today**, with the single driver.

Example: *"Aron — CF. Plan needs a sustained sprint threat behind Fram's low block. His engine (CS 91st
pct) is strong and he's GREEN → strong fit."* / *"Full-back Y — plan needs repeated overlaps + recovery
decel. He's AMBER with decel capacity 18% below his norm → caution; consider reduced overlap or
rotation."*

## Explainability (mandatory — this IS the moat)

- **Layered read:** (0) one-line verdict; (1) 2–3 plain facts — the role demand, the enabling/limiting
  capacity, the readiness; (2) "Show details" — the weights, percentiles, and citations.
- **Confidence** from data coverage (has CS/D′? CMJ? ≥4 sessions?) + baseline maturity. Thin data →
  "not enough to judge fit today," never a guess.
- **Counterfactual** for every non-strong verdict: *"if his readiness were green → strong fit"* /
  *"at his own decel norm → fit."*
- **Citation** on the card: Bradley & Ade; Modric 2019; Janetzki 2023.
- **Rules compute the fit; AI only writes the sentence, labelled as AI, citing the layers.**

## Guardrails (non-negotiable)

- **Advisory only.** It informs the selection conversation — it does **not** auto-pick the XI or override
  the coach. Coach overrides are logged with a reason (audit trail).
- **Never replaces the readiness verdict.** Readiness stays the daily decision; Game-Plan Fit is a
  matchday *planning lens* layered beside it, never feeding back into the colour.
- **Descriptive/advisory**, per the explainability manifesto: it carries provenance, confidence, and a
  counterfactual, or it isn't shown.

## Data sources (all already in the system)

`v_coach_readiness_today_v8` · `player_load_peak_period` + `criticalSpeed` · movement style/signature ·
Decel Intelligence · `player_fitness_test` · `vald_forcedecks_results` (CMJ) · opponent scouting
(`scout_team_season` / `team_match_stats` / match-report-read) · `coach_week_setup` (fixture, formation)
· `players.position`.

## MVP → V2

- **MVP:** role-demand weights (Modric) × readiness colour × CS/D′ + decel, with a **manual opponent-
  style tag** the coach picks; verdict + driver + confidence per player on a matchday board.
- **V2:** auto opponent modifier from the scouting report; add CMJ + fitness tests; per-instruction
  advice ("reduce his overlaps today"); next-match availability from match-fatigue recovery timeline.

## Output surface

A **"Game-Plan Fit" board** on the matchday / week page: one row per player — role · fit chip · one-line
driver · confidence; expandable to the four-layer breakdown. Bilingual (EN default, IS toggle).

## Citations

- Bradley, P.S. & Ade, J.D. *Are Current Physical Match Performance Metrics in Elite Soccer Fit for
  Purpose or is the Adoption of an Integrated Approach Needed?* (integrated, role-contextualized model).
- Modric, T., Versic, S., Sekulic, D. & Liposek, S. (2019) *Analysis of the Association between Running
  Performance and Game Performance Indicators in Professional Soccer Players.* IJERPH 16:4032.
- Janetzki, S.J. et al. (2023) *Assessing athlete readiness using physical, physiological, and perceptual
  markers: A systematic review and meta-analysis.*
- *Acute and Residual Soccer Match-Related Fatigue: A Systematic Review and Meta-analysis.*
- (All in `research/Football`, `research/Fatigue`.)
