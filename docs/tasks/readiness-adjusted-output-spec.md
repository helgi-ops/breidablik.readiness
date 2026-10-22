# Spec — Readiness-Adjusted Tactical Output (differentiator #2)

**One line:** read a player's tactical/technical output (OBV, xG, pressures, duels, line-breaking
passes, InStat index) **in light of his readiness state and match context**, to separate the two things
coaches constantly confuse: *"he's out of form"* vs *"he was physically compromised."* Transparent,
explained, advisory.

Nobody does this. StatsBomb shows the output with no physical/readiness context; Catapult shows the
physical with no output. MicroPulse holds both **and** the daily readiness signal — so it can say whether
a dip is a skill/form problem or a readiness/context artifact. That disambiguation is the product.

## The core insight

A low OBV day means opposite things depending on state:
- **Green readiness, neutral opponent, home** → the output is a genuine **form/skill** signal.
- **Amber/red readiness, or away to a top side** → the output is **suppressed by physical/context**, not
  a form problem — and a *strong* output while compromised is genuinely excellent.

Reading output without this context mislabels tired players as out-of-form (and benches the wrong man),
and misses the fresh player who is genuinely declining.

## Why it's scientifically grounded (read before building — done)

- **"Red, Amber, or Green? Athlete Monitoring in Team Sport: The Need for Decision-Support Systems."**
  Traffic-light monitoring is common but under-standardized; the paper calls for **decision-support that
  contextualizes** monitoring and is used for *"evaluating individual performance and informing
  selection."* → the mandate for a contextualized read of a player's performance rather than a raw
  number. This is MicroPulse's whole thesis, applied to tactical output.
- **"High-intensity efforts in elite soccer matches and associated movement patterns, technical skills
  and tactical actions."** Translates high-intensity physical efforts into the **technical skills and
  tactical actions** they co-occur with, position-specifically. → physical state and technical/tactical
  output are **coupled**, so adjusting output by physical/readiness state is legitimate, not a stretch.
- **Modric et al. (IJERPH 2019).** Running/physical performance is **associated with the game-performance
  index**, position-specifically (forwards' index ↔ sprint distance r=0.80, etc.). → the physical↔output
  link that the adjustment exploits.
- **"The Effect of Weekly Training Load across a Competitive Microcycle on Contextual Variables in
  Professional Soccer."** *"Physical and technical responses are determined by tactical behaviours;
  contextual variables condition competitive demands."* The most influential contexts: **opponent level
  (high/med/low), match location (home/away), result.** → output MUST be read against context, not just
  readiness — build **opponent level + home/away** into the adjustment.
- **Saw et al. — "subjective self-reported measures trump commonly used objective measures"** (systematic
  review). Subjective well-being/readiness is a **sensitive, valid** marker of the training response
  (impaired under load). → the personal-norm readiness signal is the right variable to adjust by; it
  moves before objective measures do. (Supported by Janetzki 2023 on readiness→performance validity.)

## What it computes (transparent — rules + shown context, AI explains)

For each player, over a window of matches, join **tactical output ↔ readiness-on-match-date ↔ context**,
and produce a plain read that separates form from state.

**Inputs per match:**
- Output: OBV (and components), xG / xG assisted, pressures, duels won %, line-breaking passes, InStat
  index — the player's tactical/technical layer (StatsBomb / InStat).
- Readiness on the match date: `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`
  (+ confidence, + is_imputed).
- Context: opponent level (high/med/low, from `scout_team_season` / league position), home/away, result.

**Two depths:**
- **MVP (fully transparent, no model):** tag each match's output with the readiness colour and context,
  then summarize: *"OBV down 30% over the last 5 — but 3 were amber/red and 2 away to top-4 sides.
  Adjusted for readiness and context, his underlying output is steady. Not a form flag."* vs *"OBV down
  30% over 5, all green, all home/neutral — a genuine form dip."* Rules count the coincidences; nothing
  is hidden.
- **V2 (personal-norm expected band):** a per-player **expected-output band conditioned on
  readiness + context**, and the residual (actual − expected). Still explainable: show the band, the
  drivers, and the confidence. Never a black-box "form score."

**Output:** a per-player **"form vs state" read** — is the recent output trend a real form change, or
explained by readiness/context? With the counterfactual and the raw numbers always visible.

## Explainability (mandatory — the moat)

- **Layered read:** (0) verdict — "genuine dip" / "explained by state" / "over-performing while
  compromised"; (1) 2–3 facts — the raw trend, the readiness mix over those matches, the context mix;
  (2) details — per-match table (output · readiness colour · opponent level · home/away), the band, and
  citations.
- **Confidence:** from sample size (matches in window), readiness coverage (were colours real or
  imputed — respect `is_imputed`), and context completeness. Thin → "not enough matches to separate form
  from state," never a guess.
- **Counterfactual:** *"on his green matches only, his OBV is at his season norm — the dip is state, not
  form."*
- **Citation:** Red/Amber/Green (Robertson-style decision support); Modric 2019; microcycle contextual
  variables; Saw et al.
- **Rules compute the tag/residual; AI writes the sentence, labelled AI, citing the layers.**

## Guardrails (non-negotiable)

- **Descriptive/advisory.** It's an analysis lens on tactical output — it does **not** create a new
  verdict, auto-bench, or auto-praise. It informs the coach's judgement.
- **Never touches the readiness colour or the daily decision.** Readiness stays the canonical daily
  verdict (`v_coach_readiness_today_v8`); this reads *past* output against *past* readiness.
- **Respect imputed readiness.** Where the match-date colour was estimated (`is_imputed`), lower
  confidence and say so — don't attribute a dip to a state you inferred.
- Provenance, confidence, counterfactual — or it isn't shown.

## Data sources (all in the system)

`player_match_stats` / `player_season_stats` (OBV, xG, pressures, duels, LBP, InStat) · `readiness_entries`
/ `v_coach_readiness_today_v8` (colour + confidence + is_imputed, by date) · `scout_team_season` /
`team_match_stats` (opponent level, home/away, result) · match schedule · `players.position` (for
position-relevant output metrics, per Modric).

## MVP → V2

- **MVP:** readiness- and context-tagged output over the last N matches, with the "form vs state" verdict
  + counterfactual, on the player analysis page. No model — pure transparent tagging.
- **V2:** personal-norm expected-output band conditioned on readiness + opponent level + home/away;
  residual trend; position-specific output metric selection (Modric).

## Output surface

On **Player Season / Total Player Analysis:** a "Form vs State" panel — the verdict, the trend, and the
per-match output × readiness × context table behind "Show details." Bilingual (EN default, IS toggle).

## Citations

- Robertson et al. *Red, Amber, or Green? Athlete Monitoring in Team Sport: The Need for
  Decision-Support Systems.*
- Modric, T. et al. (2019) *Association between Running Performance and Game Performance Indicators.*
  IJERPH 16:4032.
- *High-Intensity Efforts in Elite Soccer Matches and Associated Movement Patterns, Technical Skills and
  Tactical Actions.*
- *The Effect of Weekly Training Load across a Competitive Microcycle on Contextual Variables in
  Professional Soccer.*
- Saw, A.E. et al. *Monitoring the athlete training response: subjective self-reported measures trump
  commonly used objective measures — a systematic review.*
- Janetzki, S.J. et al. (2023) *Assessing athlete readiness using physical, physiological, and perceptual
  markers.*
- (All in `research/Football`, `research/Training Load`, `docs/research`.)
