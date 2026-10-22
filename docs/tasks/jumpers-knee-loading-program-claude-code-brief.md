# Claude Code task — Jumper's-knee (patellar tendinopathy) staged loading program

Paste to Claude Code (or `@docs/tasks/jumpers-knee-loading-program-claude-code-brief.md`).

Build a **criteria-based, pain-monitored staged loading program for players with jumper's knee
(patellar tendinopathy)** inside MicroPulse — the same shape and quality as the existing
**Hamstring Rehab** module (`src/app/coach/hamstring-rehab/page.tsx`), which this should mirror.

## Goal (and the one-line why)

Give a coach a single screen that takes a player with patellar tendinopathy through the four
evidence-based tendon-loading stages, **gated by pain and by objective force-plate criteria — never
by the calendar** — and pushes each stage to the player's app. The why: jumper's knee is a load-
management problem, not a rest problem; the fix is the right dose of load at the right stage, tracked
against pain that is allowed but bounded.

## The model to implement (Cook & Purdam continuum / Malliaras 2015 staged loading)

Four stages. Progression is **criteria-based** (pain within limits + strength/symmetry restored),
shown as a tab set exactly like hamstring-rehab (`overview | s1 | s2 | s3 | s4 | testing | videos`).
Clinical doses stay in **English** (source language, medical precision); the shell is bilingual IS/EN.
Each stage is a typed `Row[]` of `{ ex, dose, notes }`.

**Stage 1 — Isometric loading (pain relief + load tolerance).**
For the irritable/high-pain tendon. Isometric quad loading gives an analgesic window (reduced tendon
pain for up to ~45 min) and lets the player keep training around it.
- Spanish squat / leg-extension / wall-sit hold at ~60° knee flexion: **5 × 45 s, ~70% MVC, 2–3×/day**,
  strictly at an acceptable pain level (see gate). Rest ~2 min between holds.
- Isometric single-leg decline-squat hold once tolerated.
- Keep all non-provocative strength (posterior chain, calf, trunk, uninjured leg) at normal load.
- *Source: Rio et al. 2015 (isometric analgesia); `research/Isometric Training for Tendon Injury
  Rehabilitation and Prevention.docx`, `research/Optimizing Isometric Training Parameters for Tendon
  Adaptation.docx`, `research/'Pushing' versus 'holding' isometric muscle actions…pdf`.*

**Stage 2 — Isotonic / Heavy Slow Resistance (HSR) (tendon remodeling).**
The core of the program. HSR matches eccentric decline-squat for symptoms but with the **best long-term
satisfaction and elevated collagen turnover** in the head-to-head RCT.
- Leg press · squat · hack squat · decline squat: **3–4 sets, slow 6 s tempo (3 s up / 3 s down),
  3×/week on alternate days**, progressive load **15RM (wk 1) → 12 → 10 → 8 → 6RM (wk ~12)**.
- Run for a **minimum 12 weeks**; tendon adaptation is slow — this is not a two-week fix.
- Pain during the session is allowed up to the gate; morning stiffness is the key day-to-day marker.
- *Source: Kongsgaard et al. 2009, `research/Corticosteroid injections, eccentric decline squat
  training and heavy slow resistance training in patellar tendinopathy.pdf`;
  `research/Achilles and Patellar Tendinopathy Loading Programmes … Systematic Review.pdf`;
  `research/Rehabilitation of Achilles and patellar tendinopathies.pdf`;
  `research/Treatment of patellar tendinopathy—a systematic review of randomized controlled trials.pdf`.*

**Stage 3 — Energy-storage loading (reintroduce the spring).**
Only once pain is controlled at Stage 2 loads **and** force-plate criteria are met (see Integration).
Progressive plyometrics that reload the stretch-shortening cycle, **every 3rd day** to respect tendon
recovery.
- Low → high SSC: pogos → box jumps (land soft) → CMJ → depth drops → single-leg hops.
- Track intensity via RSI-modified from the Force-Plate CMJ; progress by symmetry, not by feel.
- *Source: `research/Programming Plyometric-Jump Training in Soccer: A Review.pdf`;
  `research/Quantifying plyometric intensity via rate of force development, knee joint, and ground
  reaction forces.pdf`; `research/Using the reactive strength index modified to evaluate plyometric
  performance..pdf`.*

**Stage 4 — Energy storage + release / Return to sport.**
Sport-specific jumping, cutting and deceleration, graded back to full training.
- Progress along a **control → chaos** continuum (planned → reactive, low → high speed/volume).
- Deceleration and cutting exposure built gradually; pain-monitored throughout.
- *Source: `research/Progressing rehabilitation after injury: consider the 'control-chaos
  continuum'.pdf`; `research/A Proposed Return-to-Sport Program … Rationale and Implementation.pdf`
  (staged RTS template, applied to patellar).*

## The pain-monitoring gate (Silbernagel / Thomeé model) — the safety rail on every stage

Continued loading (and even continued play) is safe **within a bounded pain range** — this is the
evidence-based rule, and it must be encoded as the visible gate on every stage, not buried:

- Pain **during** loading up to **5/10 on a VAS is acceptable**; above 5/10 → reduce load / drop back a stage.
- Pain **must settle to baseline by the next morning**; if it doesn't, the dose was too high.
- **Morning stiffness must not increase week to week** — it is the primary day-to-day tendon marker.
- Single-leg decline-squat pain (VAS 0–10) is the standard daily provocation test.
- *Source: `research/Continued Sports Activity, Using a Pain-Monitoring Model, During Rehabilitation in
  Patients With Achilles Tendinopathy.pdf` (Silbernagel), pain-monitoring model orig. Thomeé.*

Track function with the **VISA-P questionnaire (0–100)** weekly as the outcome measure (higher = better).
Show the trend; it is the "are we winning?" number.

## Where to build (mirror hamstring-rehab exactly)

- New page `src/app/coach/jumpers-knee/page.tsx` — copy the structure of
  `src/app/coach/hamstring-rehab/page.tsx`: tabbed client component, `Row[]` per stage, bilingual
  shell + English clinical doses, educational disclaimer, header comment with full citations, and the
  `SendProtocolToPlayerButton` (`@/components/recovery/SendProtocolToPlayerButton`) to push a stage to
  the player.
- Add the sidebar link next to Hamstring Rehab in `CoachSidebar.tsx`. If this is a Breiðablik-only
  resource, reuse the same `BREIDABLIK_TEAM_ID` guard pattern (both sidebar + direct-URL guard).
- If a shared component makes sense (like `IsometricProtocolLibrary`), factor the stage tables into a
  small `components/rehab/JumpersKneeProtocol.tsx` and keep the page thin.

## Integration with the rest of MicroPulse

- **Force-Plate / RTP as the objective progression gate.** Read the existing RTP assessment
  (`/api/coach/rtp/[playerId]`, `v_coach_readiness_today_v8` is unrelated — use the RTP CMJ block):
  require **CMJ limb asymmetry < 10%** (and restored jump height / RSI-mod) before unlocking Stage 3,
  and symmetry maintained under energy-storage load before Stage 4. Surface it as a counterfactual
  ("asymmetry 14% → needs < 10% to progress to Stage 3").
- **Injury flag.** Use `injury_events` to mark the player as managing patellar tendinopathy so they
  appear in the injuries/RTP surfaces; link the active stage.
- **Push to player.** Reuse `recovery_protocol_assignments` + `SendProtocolToPlayerButton` so the
  player sees their current stage and daily work in the player app, and add a **daily player check-in**
  for single-leg decline-squat pain (VAS) + morning stiffness that feeds the gate.
- **Readiness stays clean.** The tendinopathy stage and pain scores are **descriptive** — they must
  **never** move the player's green/amber/red readiness colour (`readiness_entries.color` /
  `v_coach_readiness_today_v8.final_color`). Rehab load can flow into load/RPE as usual, but the
  tendon stage is its own labelled signal, exactly like every other descriptive layer in the system.

## Reference layout (build to this)

**Coach screen (`/coach/jumpers-knee`), top to bottom:**
1. Header: title + player switcher + `Send stage to player` button; educational-reference disclaimer pill.
2. Current-stage verdict card (amber/current-stage tint): "Stage 2 · Heavy Slow Resistance ·
   progressing — pain within limits · week N of ≥12 · Kongsgaard 2009".
3. Three metric cards: decline-squat pain today (VAS, green ≤5), morning stiffness (steady/rising),
   VISA-P (0–100 with weekly delta).
4. Force-plate gate card: "Stage 3 locked" + counterfactual ("CMJ asymmetry 14% → needs < 10%").
5. Stage tab bar (Overview · 1 Isometric · 2 HSR · 3 Energy storage · 4 Return to sport · Testing),
   active stage renders its `Row[]` table (exercise · dose · notes).
6. Pain-gate strip footer: "≤ 5/10 during loading · settles by next morning · stiffness not rising.
   Descriptive only — never changes readiness colour."

**Player app screen:** current stage badge → today's work checklist → daily check-in (decline-squat
pain VAS slider 0–10, morning stiffness better/same/worse, "did yesterday's pain settle by this
morning?" yes/no) → a within-limits/hold banner → the "this never changes your readiness" note. This
check-in is what feeds the coach pain-gate.

## Gates & honesty (manifesto)

- **Criteria-based, never calendar-based** — progression unlocks on pain + symmetry, and the screen
  says which criterion is blocking (counterfactual on every gate).
- **The clinician/coach decides; the tool explains.** Every stage carries its citation; every
  recommendation is overridable and the reason logged. Label clearly as an **educational protocol
  reference**, not medical advice — progression decisions belong to the treating clinician.
- **No-data ≠ zero.** A missing VISA-P or force-plate test shows as pending, never as a pass.
- **Provenance on every number** (source + date). Bilingual EN/IS, English default; clinical doses in
  English for precision.
- **Layered read:** verdict (current stage + is-it-progressing) → why (pain within limits? symmetry?)
  → detail (full stage tables, VISA-P trend) behind "Show details".

## Acceptance

- `/coach/jumpers-knee` renders the four stages + testing + videos, mirroring hamstring-rehab, bilingual
  shell, English clinical detail, citations visible.
- The pain-monitoring gate (≤5/10, settles by next morning, stiffness not rising) is shown on every
  stage and drives a clear "progress / hold / drop back" state.
- Stage 3 is locked until the Force-Plate CMJ asymmetry criterion is met, with a counterfactual.
- A coach can push the current stage to a player; the player gets a daily pain/stiffness check-in.
- Nothing on this screen changes the readiness colour. `npx eslint` clean; stage specific files only;
  any DB change also saved under `supabase/migrations/`.

## Do NOT

- Do not make progression calendar-based or auto-advance without the pain + symmetry criteria.
- Do not let tendon pain or stage influence the readiness verdict / daily decision.
- Do not present this as medical advice — it is an educational, clinician-supervised protocol reference.
- Do not hardcode a single dose as "the" answer — show the progression ranges and let the clinician set
  the load.

## Papers used (all in `research/`)

- Kongsgaard et al. 2009 — *Corticosteroid injections, eccentric decline squat training and HSR in
  patellar tendinopathy* (HSR core evidence).
- Silbernagel et al. — *Continued Sports Activity, Using a Pain-Monitoring Model…* (the pain gate).
- Peers & Lysens 2005 — *Patellar Tendinopathy in Athletes: Current Diagnostic and Therapeutic
  Recommendations* (diagnosis + overview).
- *Achilles and Patellar Tendinopathy Loading Programmes — A Systematic Review* (mechanisms, HSR vs ECC).
- *Rehabilitation of Achilles and patellar tendinopathies*; *Treatment of patellar tendinopathy — a
  systematic review of RCTs* (staged loading, outcomes).
- *A Proposed Return-to-Sport Program … Rationale and Implementation* (Stage 4 RTS template).
- *Progressing rehabilitation after injury: the control-chaos continuum* (Stage 4 return grading).
- *Programming Plyometric-Jump Training in Soccer*; *Quantifying plyometric intensity…*; *Using the
  RSI-modified…* (Stage 3 energy storage).
- Isometric tendon set (`Isometric Training for Tendon Injury Rehabilitation and Prevention.docx`,
  `Optimizing Isometric Training Parameters for Tendon Adaptation.docx`,
  `'Pushing' versus 'holding' isometric muscle actions…pdf`) (Stage 1 dosing).
- `TENS exercise_protocol_jumpers_knee.pdf` (jumper's-knee-specific loading protocol).
