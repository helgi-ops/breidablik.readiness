# Brief — Periodization Hub restructure: Macro / Meso / Micro tabs + goal recommender

One document for the whole "The plan / hub" restructure. Three parts: (1) rename the tabs onto the
macro→meso→micro periodisation spine, (2) reorder the Meso tab so the planner leads and drop the redundant
"MD week" box, (3) add a block-goal recommender. All grounded in logic the hub already computes.
Descriptive planning — nothing here touches the readiness colour. Rules recommend; the coach decides.

File: `src/app/coach/periodization-hub/page.tsx`. Logic lib: `src/lib/micropulse/periodization/index.ts`.

## Part 1 — rename the tabs to the periodisation spine (macro → meso → micro)

Today the tab state is `"season" | "demands" | "plan" | "players"` (labels ~line 282–285), and the week
lives on a **separate page** (`/coach/week-setup`, linked out ~line 603). Restructure so the hub's own
tabs *are* the periodisation hierarchy — the coach drills season → block → week without leaving:

| New tab (primary label) | Plain subtitle | = current | Notes |
|---|---|---|---|
| **Macro Cycle** | the season | `season` | season phases + fixtures + block sequence map |
| **Meso Cycle** | the 4–6 week block | `plan` | the planner (calendar + PDF) — see Part 2 |
| **Micro Cycle** | the week | *(new)* Week Setup | mount the existing Week Setup here, not a link-out |
| **Demands** | position baselines & the match unit | `demands` | the inputs that feed all three cycles |
| **Players** | per-player individualisation | `players` | unchanged |

Tab order left→right: **Macro Cycle · Meso Cycle · Micro Cycle · Demands · Players** — the three cycles are
the spine; Demands + Players are supporting. Keep the EN/IS toggle: IS = `Makró-lota` / `Mesó-lota` /
`Míkró-lota` (+ subtitles `tímabilið` / `4–6 vikna lotan` / `vikan`), `Kröfur` / `Leikmenn`.

**Why plain subtitles are non-negotiable:** Macro/Meso/Micro is sport-science jargon, and the manifesto
keeps jargon behind plain language. This is the S&C planning surface so the terms belong — but render each
tab as a two-line label (bold cycle name + small grey subtitle) so a head coach glancing at the hub still
reads "the season / the block / the week". Don't ship the three Latin words alone.

**Micro Cycle = the existing Week Setup, reused as-is** (the coach's requirement: "same as Week Setup is
now"). Week Setup is currently its own route. Preferred: extract its content into a component and mount it
in the Micro Cycle tab so it's one hub. If that's too big for now, the tab may embed/redirect to
`/coach/week-setup` — but the *goal* is one macro→meso→micro flow in the hub, and the tab label is the
commitment. Keep the existing "Apply to Week Setup" sync (line ~495) working: the Meso planner still writes
`week_setups`/`week_plans`, which the Micro Cycle tab then shows — the meso→micro handoff becomes visible in
one place.

Update the page's intro copy (lines ~258–259) to describe the new spine ("Macro cycle — the season · Meso
cycle — the block · Micro cycle — the week"), and the header comment (line ~7).

## Part 1a — Macro Cycle IS the control: set it up first, everything flows from it

**The architecture principle (make this explicit in the code and the UI):** Macro Cycle is the single
source of truth for the whole plan. The coach sets it up **first**, and Meso + Micro are **generated from
it** — not edited in isolation. Today the Meso planner carries its own start date + week count, half-
independent; flip that so Macro drives Meso drives Micro (top-down cascade).

**What the coach sets on Macro Cycle (the two anchors + the deload cadence):**

1. **First pre-season training date** — the macro start anchor.
2. **First match of the season** — the pre-season → competitive boundary.
3. *(optional)* **Season end** — else auto from the last fixture.
4. **Deload cadence** — a segmented control: **every 4th / 5th / 6th week**. This *is* the mesocycle
   length (classic 3:1 / 4:1 / 5:1 load:unload). Default 4; let the coach pick — deload frequency is
   individual/age-dependent (younger/fitter tolerate 5–6, older need 4 more often). `detectSeasonPhases`
   already accepts `preseasonStart` / `seasonEnd`; add the cadence.

**What the system computes from those anchors (and shows on Macro):**

- Pre-season length = first-match − first-training (tell the coach: "8-week pre-season → 2 blocks").
- The competitive span, tiled into **meso blocks of the chosen cadence**, each = (cadence−1) build weeks +
  **1 deload week** at the end, aligned to the fixtures.
- The **block-goal sequence** placed along the macro — only **Accumulation → Transmutation → Realization**
  (three goals) via `recommendBlockGoal` (Part 3). Pre-season opens Accumulation; in-season cycles
  Transmutation ↔ Realization around fixtures.
- **A deload is a WEEK, never a block.** It is the final week of every block — do **not** render "Deload"
  as its own full-width segment in the macro arc (current bug). Draw it as a thin **stripe/marker at the
  end of each block's segment**. Each block keeps its goal colour; the last week is the deload stripe.
- **In-season deload-week placement:** snap each block's deload week to the **lightest fixture week nearest
  the block end** (a bye or easy match) — the coach can override. On a load spike / readiness drop the
  deload week can be **pulled forward** (or an extra deload week inserted); it never becomes a standalone
  block.

**Propagation is the whole point — one source of truth.** Changing the first-match date, the first-training
date, or the cadence **re-flows everything**: the meso blocks regenerate and the micro weeks with them. Wire
the anchors as shared state that the Meso and Micro tabs read; they consume it, they don't own it. Surface a
one-line "set these first" nudge on Macro if the anchors are empty, and show a soft warning on Meso/Micro if
the coach opens them before Macro is set.

## Part 1b — Macro Cycle tab: "How the cycle is built" explainability

Add, at the top of the **Macro Cycle** tab, an explainability panel that shows **how a periodisation cycle
is structured — where Accumulation, Transmutation, Realization and Deload sit** — anchored to *this* team's
season, not a textbook. It's the big picture the block recommender (Part 3) lives inside: the coach sees
the whole arc, then why a given block is recommended. Rules compute the placement; this panel *explains* it
(manifesto: rules decide, the panel narrates + cites). It reads the data the hub already has
(`detectSeasonPhases` + the meso `blocks` array) — no new computation.

**The macrocycle map (the visual):** a horizontal band across the season, segmented by meso block, each
segment coloured by its **goal** — Accumulation cobalt `#2740E6`, Transmutation purple `#7A5CC4`,
Realization green `#1C7A4A` — with the **deload week drawn as a thin amber `#DE9328` stripe at the end of
each segment** (a week, not a segment). No standalone "Deload" blocks in the sequence. Labelled with dates +
goal, with a **"you are here"** marker on today. Above the band, the pre-season / competitive phase split from `detectSeasonPhases`. This is the
season arc — the same blocks the Meso map lists, drawn as one timeline so the *sequence* is legible.

**The layered read (per `docs/explainability-first.md`) — never jump 0 → 2:**

- **Level 0 — one-sentence verdict** (bold, first, ~5s glance): the season's shape + where they are now.
  *Template:* "Your season opens with a {N}-week pre-season **Accumulation** block, then repeats
  **Transmutation → Realization** around the fixtures, each block ending in a **deload week**. You're in week
  {W} of {phase} — next up: {recommended goal}." Fill from the phases + blocks + `recommendBlockGoal`.
- **Level 1 — 2–3 plain facts** (the ~15s "why", no click), each naming its place in the cycle:
  1. *The arc.* "Accumulation builds the base, Transmutation sharpens it to football-specific, Realization
     peaks you for matches — in that order."
  2. *Where it repeats.* "In-season you cycle Transmutation ↔ Realization around fixtures; you
     re-accumulate after a deload or a break."
  3. *Deload's place.* "A deload sits at the end of a block, or whenever load spikes or readiness drifts —
     it's planned recovery, not lost time."
- **Level 2 — "How the cycle is built" toggle** (default collapsed): the model + the honest anchor —
  MicroPulse places the blocks on *your* fixtures and load, so the lengths/positions are the team's own,
  not a fixed template; block-goal choice stays the coach's call. Plus the citations.

**A static "anatomy of a block cycle" strip** (optional but recommended for the workshop): even before a
team's data is rich, show the canonical order as a teaching aid — **three block-goal chips Accumulation →
Transmutation → Realization**, each with its one-line role, plus a separate small note that **every block
ends with a deload week** (drawn as the amber stripe). Deload is not a fourth block — it's the unload week.
This makes the tab teach the concept cold, then the live map shows it on the team's real season.

**Evidence/citations:** block (sequenced) periodisation and the Accumulation→Transmutation→Realization
order — Issurin 2010; taper/realization into fixtures — Martín-García 2018 + Owen 2017; deload on load-trend
+ readiness (not ACWR) — Teixeira 2021 + the club's "Dismiss ACWR" note. All in
`docs/research/football-periodization-evidence.md`.

**House rules:** EN/IS; descriptive only — never sets the readiness colour; confidence follows data
maturity (thin fixtures/load → "read as a hint"). Keep it a lens, not a mandate.

## Part 2 — Meso Cycle tab: planner first, drop the "MD week" box

The Meso Cycle tab **consumes the Macro anchors** (Part 1a): its blocks, dates, weeks and deload weeks are
generated from the first-training/first-match anchors + the chosen cadence, not entered from scratch. The
planner pre-fills from the current macro-generated block (the coach can still fine-tune days), and the meso
map shows the auto-generated block sequence. If Macro isn't set, show the "set Macro first" nudge here.

Inside the Meso Cycle tab, current order is `MD week — targets anchored to matchday` → `Meso — 4-week
blocks` → `Plan a block — calendar + PDF`. The coach's actual work is buried. New order:

1. **`Plan a block — calendar + PDF`** — move to the **top**. This is the block the coach is laying out
   (calendar skeleton + computed session-by-session + Export PDF). It leads.
2. **`Meso — 4-week blocks`** — keep below the planner: the season-long map of blocks (goals, dates, TMr,
   deload calls). Add the goal recommendation here (Part 3).
3. **`MD week — targets anchored to matchday`** — **remove.** It duplicates the planner's per-day day-type +
   MD targets and the exported PDF's microcycle template. Preserve its one unique asset — the "what each MD
   day-type means" legend — as a small collapsible **"What the day-types mean"** disclosure inside the
   planner (default collapsed). Fold its citations (Owen 2017 · Oliveira · Teixeira · Martín-García) into
   the planner footer.

Net Meso tab: **Planner (primary) → Meso map (context)**, one top-to-bottom read.

## Part 3 — recommend the block goal (Accumulation / Transmutation / Realization)

**The coach's question:** "can the system tell me which block goal is best right now?" Yes — the block goals
follow a known sequence (block periodisation: Accumulation → Transmutation → Realization), and the hub
already computes the signals to pick one. Make it a **recommendation with its reasoning** on the Goal
dropdown (planner) and the Meso map — never an auto-set. **Deload is not one of the recommendable goals** —
it's the unload *week* every block already ends with (Part 1a); fatigue triggers "pull the deload week
forward" (signal 1), not a goal change.

### The three block goals

- **Accumulation** — build the base: work capacity, max-strength, aerobic/HSR capacity. High volume,
  general. Pre-season, and the rebuild block after a break.
- **Transmutation** — convert to football-specific: strength-power, speed, more intense/specific. Middle of
  the macro, once capacity exists.
- **Realization** — peak & freshen: low volume, high intensity, taper into key fixtures.

*(Deload = the final week of each block; on a load spike / readiness drop it's pulled forward or an extra
deload week inserted — a week-level action, not a goal.)*

### The recommender (deterministic — rules decide)

New pure function `recommendBlockGoal(...)` in `periodization/index.ts`, returning
`{ goal, confidence, reasons: Bi[], alternative: { goal, when: Bi }, deloadNow: boolean }` — `goal` is one
of the **three** block goals. Inputs in priority order:

1. **Fatigue → unload now (not a goal change).** The block builder already computes the acute-load trend +
   readiness and raises a deload flag (`MesoBlock` ~line 491–539: sharp acute-load rise, or readiness
   trending down). If it fires, set **`deloadNow: true`** → recommend **pulling the block's deload week
   forward / inserting an extra deload week**, keeping the block's goal. Reason = the flag's own string. The
   goal itself still comes from the signals below.
2. **Season phase (`detectSeasonPhases`).** Pre-season → **Accumulation** (its rationale already says
   "accumulation + capacity"). Deep competitive with weekly matches → **Realization**-style freshness.
3. **Runway to the next key fixture / density** (from `match_schedule`, already loaded): long open runway,
   few matches → **Accumulation** then **Transmutation**; 2–4 weeks from an important match or a congested
   block → **Realization**.
4. **Sequence position** (from the Meso map block history): after Accumulation → **Transmutation**; after
   Transmutation → **Realization**; after Realization/competition or a break → back to **Accumulation**.
   Never recommend Realization with no accumulation behind it.

Pick the highest-priority goal signal (2–4) that fires; the rest become the `alternative`. Signal 1 sets
`deloadNow` independently. Same "rules compute, one source" pattern as the readiness engine.

### How it surfaces (verdict → why → confidence → override)

- Planner **Goal** `<select>`: mark the recommended option `Accumulation (Recommended)` with a one-line
  **why** beneath — e.g. *"Pre-season, 6-week runway to the first friendly, load steady → build the base."*
  The coach picks any goal; override is the default, not the exception.
- **Meso map** cards: a small `Recommended` chip on the goal when it agrees, or a muted
  `Suggested: Realization` hint when it differs, with the 2–3 reasons on expand.
- **Confidence chip** = signal agreement + data maturity: high when phase + runway + fatigue align; low when
  early-season / sparse fixtures / thin load history (say "few fixtures loaded — read as a hint").
- **Honesty line:** block-goal choice is a coaching judgment; this is a grounded default from the team's own
  fixtures + load, not a mandate (Little & Buchheit). Never auto-apply.

### Evidence (reasons + citations footer)

Sequenced blocks (Accumulation→Transmutation→Realization): Issurin 2010. Taper into fixtures: Martín-García
2018 + Owen 2017. Deload on load-trend + readiness, not ACWR: Teixeira 2021 + the club's "Dismiss ACWR"
note. Pre-season = accumulation: Oliveira 2019/2021. All in `docs/research/football-periodization-
evidence.md`.

## Acceptance

- Hub tabs read **Macro Cycle · Meso Cycle · Micro Cycle · Demands · Players**, each cycle tab a two-line
  label (cycle name + plain subtitle), EN/IS. Micro Cycle shows the existing Week Setup; the meso→micro
  "Apply to Week Setup" sync still works.
- Macro Cycle is set up **first**: the coach enters first-training date, first-match date, optional season
  end, and a **deload cadence (4 / 5 / 6)**. From those the system computes the pre-season length, tiles the
  competitive season into meso blocks of that cadence, places the goal sequence, and snaps in-season deloads
  to the lightest fixture week near the cadence. Changing any anchor **re-flows** the meso blocks + micro
  weeks (proven by a test: move the first-match date → block dates shift). Meso/Micro show a nudge if Macro
  is unset.
- Macro Cycle tab opens with the **"How the cycle is built"** panel: the season arc drawn as a
  goal-coloured block timeline with a "you are here" marker, a Level-0 verdict + 2–3 facts, and a collapsed
  "How the cycle is built" model/citations toggle. It reads existing phases + blocks (no new computation)
  and renders sensibly even with thin data (static anatomy strip + "read as a hint").
- Meso Cycle tab renders **planner first, meso map second**; the standalone "MD week" section is gone, its
  legend folded into a collapsible in the planner, citations preserved.
- `recommendBlockGoal` returns goal + confidence + 2–3 bilingual reasons + one alternative; unit-tested for:
  pre-season → Accumulation; load spike / readiness down → `deloadNow: true` (pull the deload week forward,
  goal unchanged); 2–3 weeks to a key match → Realization; after an Accumulation block → Transmutation.
- Goal dropdown shows `(Recommended)` + the one-line why; Meso cards show the chip; low-confidence shows the
  "read as a hint" caveat. Coach overrides freely; nothing auto-applies.
- EN/IS throughout. Never sets the readiness colour. Lint + typecheck clean. Manifesto five-question check
  passes (provenance ✓, glance verdict ✓, why ✓, coach override ✓, rules-only ✓).

Ref: `src/app/coach/periodization-hub/page.tsx` (tabs ~line 90, 282–285; Meso sections; Goal select;
Week Setup link ~603), `src/app/coach/week-setup` (the Micro Cycle content),
`src/lib/micropulse/periodization/index.ts` (`detectSeasonPhases`, `MesoBlock` deload logic, block builder),
`docs/research/football-periodization-evidence.md`, `docs/explainability-first.md`. Supersedes
`periodization-plan-tab-reorder-and-goal-recommender-brief.md` (fold it in / delete it).
