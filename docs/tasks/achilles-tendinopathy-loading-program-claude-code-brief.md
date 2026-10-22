# Claude Code task — Achilles tendinopathy staged loading program

Paste to Claude Code (or `@docs/tasks/achilles-tendinopathy-loading-program-claude-code-brief.md`).

Build a **criteria-based, pain-monitored staged loading program for players with Achilles
tendinopathy** — the sibling of the jumper's-knee module
(`docs/tasks/jumpers-knee-loading-program-claude-code-brief.md`) and the same shape as **Hamstring
Rehab** (`src/app/coach/hamstring-rehab/page.tsx`). Reuse everything from the jumper's-knee build;
this brief only calls out what is **different for the Achilles**.

## Goal (and the one-line why)

Take a player with Achilles tendinopathy through the evidence-based calf/plantarflexor loading stages,
**gated by pain and by objective calf/hop criteria — never by the calendar** — and push each stage to
the player's app. The why: the Achilles responds to progressive load, not rest; the fix is the right
dose at the right stage, with pain allowed but bounded.

## Classify first — this is the Achilles-specific gate that changes the exercises

Before any stage, the coach/clinician must set **midportion vs insertional**, because it changes the
allowed range of motion:

- **Midportion (non-insertional)** — pain 2–6 cm above the heel. Full range allowed, **including heel
  drops below neutral off a step** (the classic decline/eccentric position).
- **Insertional** — pain at the heel bone. **Avoid dorsiflexion beyond neutral** (loading into
  dorsiflexion compresses the tendon against the calcaneus and flares it). Heel raises are done **on the
  floor to neutral only — no step, no decline.**

The module must carry this toggle and swap the exercise range/notes accordingly. Getting this wrong is
the most common way an Achilles program fails.
*Source: `research/Achilles Tendinopathy: Evaluation, Rehabilitation, and Prevention.pdf` (midportion vs
insertional treatment differences).*

## The model to implement (staged tendon loading, Achilles-specific doses)

Four stages, criteria-based progression, same tab layout as jumper's-knee
(`overview | s1 | s2 | s3 | s4 | testing | videos`). Clinical doses in **English**; shell bilingual IS/EN.
Each stage a typed `Row[]` of `{ ex, dose, notes }`.

**Stage 1 — Isometric loading (pain relief + load tolerance).**
For the irritable tendon. Isometric plantarflexion gives an analgesic window and starts loading.
- Isometric heel-raise hold (double → single leg), **5 × 45 s, 2–3×/day**, mid-range, at an acceptable
  pain level. Insertional: hold on the floor at neutral, not off a step.
- Keep all non-provocative strength (knee, hip, trunk, uninjured side) at normal load.

**Stage 2 — Isotonic / Heavy Slow Resistance + eccentric heel raises (tendon remodeling).**
The core. Two evidence-based routes; both work — pick per clinician/equipment:
- **HSR calf raises:** seated + standing, **3–4 sets, slow 6 s tempo (3 s up / 3 s down), 3×/week
  alternate days**, progressive load **15RM → 6RM over ~12 weeks**. Straight-knee (gastroc) and
  bent-knee (soleus).
- **Alfredson eccentric heel-drop (midportion only):** **3 × 15, twice daily, 7 days/week, 12 weeks**,
  straight-knee and bent-knee, progress load with a loaded backpack. Off a step (below neutral).
  *Insertional: do NOT use the step — floor to neutral only.*
- Pain during loading allowed up to the gate; **morning stiffness is the key day-to-day marker**.
- Run for a **minimum 12 weeks** — tendon adaptation is slow.
*Source: `research/Achilles and Patellar Tendinopathy Loading Programmes … Systematic Review.pdf`
(HSR vs eccentric); `research/Achilles Tendinopathy: Evaluation, Rehabilitation, and Prevention.pdf`
(Alfredson protocol); `research/Rehabilitation of Achilles and patellar tendinopathies.pdf`.*

**Stage 3 — Energy-storage loading (reintroduce the spring).**
Only once pain is controlled at Stage 2 loads **and** calf/hop criteria are met (see Integration).
Progressive plyometrics that reload the stretch-shortening cycle, **every 3rd day**.
- Bilateral pogo/skip → single-leg hops → bounding → progressive running.
- Track intensity via CMJ RSI-modified and single-leg hop symmetry.
*Source: `research/Programming Plyometric-Jump Training in Soccer: A Review.pdf`; jumper's-knee brief
Stage 3 refs.*

**Stage 4 — Energy storage + release / Return to sport.**
Sport-specific running, acceleration/deceleration, cutting, graded back to full training along a
**control → chaos** continuum (planned → reactive, low → high speed/volume), pain-monitored.
*Source: `research/A Proposed Return-to-Sport Program … Midportion Achilles Tendinopathy: Rationale and
Implementation.pdf` (RTS template); `research/Progressing rehabilitation after injury: the
control-chaos continuum.pdf`.*

## The pain-monitoring gate (Silbernagel model) — the safety rail on every stage

Identical rule to the jumper's-knee module, and specifically validated for the Achilles: continued
running/jumping is safe **within a bounded pain range**.

- Pain **during** loading up to **5/10 VAS is acceptable**; above 5/10 → reduce load / drop back a stage.
- Pain **must settle to baseline by the next morning**.
- **Morning stiffness must not increase week to week** — the primary tendon marker.
- Single-leg heel-raise pain (VAS 0–10) is the daily provocation test (jumper's-knee used the decline
  squat — the Achilles equivalent is the heel raise).
- Track function with the **VISA-A questionnaire (0–100)** weekly (higher = better) — the Achilles
  outcome measure (jumper's-knee used VISA-P).
*Source: `research/Continued Sports Activity, Using a Pain-Monitoring Model, During Rehabilitation in
Patients With Achilles Tendinopathy.pdf` (Silbernagel — this study IS the Achilles pain-monitoring
evidence); `research/Physical therapies for Achilles tendinopathy: systematic review and
meta-analysis.pdf`.*

## Where to build

- New page `src/app/coach/achilles-tendinopathy/page.tsx` — **copy the jumper's-knee module** and swap:
  the midportion/insertional toggle, calf/heel-raise exercises, VISA-A (not VISA-P), heel-raise daily
  marker (not decline squat), and the citations. Factor any shared pieces into
  `components/rehab/` so the two tendinopathy modules share the tab shell + pain-gate component.
- Sidebar link next to Jumper's Knee / Hamstring Rehab in `CoachSidebar.tsx`; reuse the
  `BREIDABLIK_TEAM_ID` guard if it's a Breiðablik-only resource.
- Reuse `SendProtocolToPlayerButton` and the player daily check-in.

## Integration with the rest of MicroPulse

- **Force-Plate / objective progression gate.** Use plantarflexor-relevant tests as the Stage 3/4 gate:
  **single-leg heel-raise height / work and single-leg hop LSI ≥ 90%** vs the uninjured side (and
  restored calf endurance). Surface as a counterfactual ("heel-raise LSI 82% → needs ≥ 90% to progress
  to Stage 3"). If the force-plate battery doesn't yet expose heel-raise/hop, gate on the coach-entered
  single-leg heel-raise rep count + hop test in the Testing tab.
- **Injury flag:** `injury_events` marks the player as managing Achilles tendinopathy (record
  midportion/insertional + side); link the active stage.
- **Push to player:** `recovery_protocol_assignments` + `SendProtocolToPlayerButton`; daily player
  check-in for single-leg heel-raise pain (VAS) + morning stiffness feeds the gate.
- **Readiness stays clean.** Tendon stage and pain scores are **descriptive** — they must never move the
  player's green/amber/red readiness (`readiness_entries.color` / `v_coach_readiness_today_v8.final_color`).

## Reference layout (build to this)

Same as the jumper's-knee module, with these swaps:
1. Add a **midportion / insertional** segmented control near the header — it drives the exercise range.
2. Metric cards: **heel-raise pain today (VAS)**, morning stiffness, **VISA-A** (not VISA-P).
3. Force-plate gate card: **heel-raise / hop LSI ≥ 90%** counterfactual (not CMJ asymmetry).
4. Stage tables show calf/heel-raise work; insertional variant hides the step/decline rows.
5. Player app: current stage → today's calf work → daily check-in (heel-raise pain VAS, morning
   stiffness, "did yesterday's pain settle?") → within-limits banner → "never changes your readiness".

## Gates & honesty (manifesto)

- **Criteria-based, never calendar-based**; the screen names the blocking criterion (counterfactual).
- **Clinician decides; the tool explains.** Every stage cites its source; recommendations overridable and
  logged. Label as an **educational protocol reference**, not medical advice.
- **No-data ≠ zero.** Missing VISA-A / heel-raise test shows pending, never a pass.
- **Provenance on every number** (source + date). Bilingual EN/IS, English default; clinical doses English.
- **Layered read:** stage + progressing? → why (pain in limits? symmetry?) → detail (stage tables, VISA-A
  trend) behind "Show details".

## Acceptance

- `/coach/achilles-tendinopathy` renders the four stages + testing + videos, mirroring jumper's-knee,
  bilingual shell, English clinical detail, citations visible.
- The **midportion/insertional toggle** changes the allowed range (insertional hides step/decline work).
- The pain gate (≤5/10, settles by next morning, stiffness not rising) drives a clear progress/hold/drop
  state; VISA-A trend shown.
- Stage 3 is locked until the heel-raise/hop LSI criterion is met, with a counterfactual.
- Coach can push the stage to a player; player gets a daily heel-raise pain/stiffness check-in.
- Nothing changes the readiness colour. `npx eslint` clean; stage specific files only; DB changes also
  saved under `supabase/migrations/`.

## Do NOT

- Do not load an **insertional** Achilles into dorsiflexion / off a step — floor-to-neutral only.
- Do not make progression calendar-based or auto-advance without the pain + symmetry criteria.
- Do not let tendon pain or stage influence the readiness verdict / daily decision.
- Do not present this as medical advice — educational, clinician-supervised protocol reference.
- Do not hardcode a single dose as "the" answer — show progression ranges; the clinician sets the load.

## Papers used (all in `research/`)

- *A Proposed Return-to-Sport Program for Patients With Midportion Achilles Tendinopathy: Rationale and
  Implementation* (Stage 4 RTS template, midportion focus).
- *Achilles Tendinopathy: Evaluation, Rehabilitation, and Prevention* (midportion vs insertional,
  Alfredson eccentric protocol, loading).
- *Continued Sports Activity, Using a Pain-Monitoring Model, During Rehabilitation in Patients With
  Achilles Tendinopathy* (Silbernagel — the pain gate + continued play, VISA-A).
- *Achilles and Patellar Tendinopathy Loading Programmes — A Systematic Review* (HSR vs eccentric,
  mechanisms).
- *Rehabilitation of Achilles and patellar tendinopathies* (staged loading).
- *Physical therapies for Achilles tendinopathy: systematic review and meta-analysis* (evidence base).
- *Progressing rehabilitation after injury: the control-chaos continuum* (Stage 4 return grading).
- *Programming Plyometric-Jump Training in Soccer: A Review* (Stage 3 energy storage).
