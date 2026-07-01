# MicroPulse — Explainability Audit (July 2026)

> The bar: **a coach who does NOT read sport-science should get the answer in ~5
> seconds without reading data.** Data waits until they ask for it.

Every coach-facing surface scored against the three-layer standard:
**(0) a one-sentence plain verdict at the top [default] · (1) a plain "why" one tap
away · (2) raw numbers / charts / jargon OPT-IN behind "show details".**

## The headline finding

**Explainability is not missing — it's applied inconsistently.** The answer-first
pattern is already beautifully implemented in several "model" surfaces. The gap is
a set of laggard surfaces that either have no verdict, bury it below the data, or
render a jargon table inline with no opt-in. **The fix is one reusable pattern that
already exists in the codebase** — copy it to the laggards.

### The models to copy
- **`DailyBriefingCard`** — leads with a "5-second read" prose sentence naming who
  needs attention, counts as secondary pills, counterfactuals per flagged player.
  (`DailyBriefingCard.tsx:1704-1717`.) The gold standard.
- **`LoadVerdictCard`** — verdict sentence up top, per-player table behind
  "Show all players ▼".
- **`load-intelligence` page** — `VerdictBanner` sentence, all 5 dense S&C cards
  collapsed behind a `<details>` "Show S&C details" (`page.tsx:187`).

## Scorecard (22 surfaces)

### ✅ Answer-first (10) — keep as reference
DailyBriefingCard · LoadVerdictCard · RecoveryWatchBanner · PlayerSummaryCard ·
PlayerDecelSummaryCard · CalibrationVerdictNote · PlayerRecoveryMessageModal ·
load-intelligence (page) · position-comparison (page) · progressive-overload (page)

### 🟡 Mixed (5) — verdict present, but a jargon table renders inline right after with no opt-in
| Surface | Gap | Fix |
|---|---|---|
| `hsr-intelligence` (page) | per-player ACWR/%MaxV table is the immediate default (`:546-613`) | wrap table in a `<details>` (copy load-intelligence `:187`) |
| `ima-intelligence` (page) | 3 dense band-level cards inline after verdict (`:324-327`) | keep session headline; move run-distance + per-player behind `<details>` |
| `quadrant` (page) | jargon subtitle (`:526`) + full SquadLoadTable inline (`:587`) | plain subtitle + gate the table |
| `decel-intelligence` (page) | jargon decel-source banner under the verdict (`:493-535`) | demote/tooltip the source banner |
| `PlannedSessionLoadCard` | one-WORD band, then raw sRPE/AU tiles ABOVE the rationale (`:140-179`) | promote rationale to the verdict line; gate the tiles |

### 🔴 Data-first (7) — no answer, or the answer is buried
| Surface | Problem | Fix |
|---|---|---|
| **`DailyInternalLoadCard`** | **Pure dump.** No verdict, no "why", no toggle — 5 raw tiles + table straight away (`:64-89`) | add a verdict sentence (compare each player's load to their baseline); gate the tiles/table |
| **`GpsLoadIntelligence`** | Answer EXISTS but rendered **dead last** — Cohort Alerts (`:468`) sit below the KPI tiles (`:331`) + 7-col jargon table (`:358`) | **hoist Cohort Alerts to the top**; gate tiles+table behind "Show S&C details" |
| **`MechanicalLoadIndexCard`** | Jargon title "MLI" + jargon subtitle, DSS/ASS/CSS/GDS sub-scores, popovers **IS-only** | verdict sentence up top; gate the table; make popovers bilingual |
| **`MdHsrComparisonCard`** | Jargon title + 6-col table; "how to read" buried below it (`:394`); IS subtitle leaks English jargon | verdict from the flag counts; gate the table |
| **`ProgressiveOverloadCard`** | Jargon title + raw "Team ACWR now: 1.24" + weekly ramp table default (`:79-123`) | plain verdict from hold/build counts; gate the ramp; ACWR→tooltip |
| `LoadMetricsCard` | band chip is the only glanceable answer; acute/chronic/ACWR numbers not gated | add verdict; gate the table |
| `PlayerLoadAcwrCard` | band chip only; ratio + means + sparkline all default | add verdict; gate the numbers |

*(`QuadrantChart` is a pure visualization primitive — its answer layer correctly
lives in the parent `quadrant` page, which has the verdict.)*

## The reusable fix (do this once, apply everywhere)

1. **Ship a shared `<ShowDetails label>` collapsible** (extract the load-intelligence
   `<details>` pattern) so gating raw data behind an opt-in toggle is one wrapper.
2. **Every surface gets a one-sentence verdict header** — compute it from the data
   already on the card (counts of flagged players, band, personal-norm comparison),
   in plain language, naming the exceptions.
3. **Move raw tables / KPI tiles / jargon** inside `<ShowDetails>`.
4. **Jargon (ACWR, MLI, sRPE, HSR, %MaxV, sub-scores) → tooltips**, never the default view.

## Suggested order (worst first, weighted by daily use)

**P0 (pure data-first, high use):** DailyInternalLoadCard · GpsLoadIntelligence ·
MechanicalLoadIndexCard.
**P1:** MdHsrComparisonCard · ProgressiveOverloadCard · LoadMetricsCard ·
PlayerLoadAcwrCard.
**P2 (mixed — just gate the inline table):** hsr-intelligence · ima-intelligence ·
quadrant · decel-intelligence · PlannedSessionLoadCard.

*Verified 2026-07-01 by opening each surface's default render. Method: 3 parallel
inspections + hand-verification of the worst offenders.*

---

## Verification update (2026-07-01) — mount points change the priority

The scorecard above rated each card **standalone**. But a card being "data-first"
only matters where a coach hits it **without opting in**. Checking where each
flagged card is actually mounted:

- **Already gated (deep-dive only) → low urgency:** `GpsLoadIntelligence`,
  `MechanicalLoadIndexCard`, `MdHsrComparisonCard` render **only inside the
  load-intelligence `<details>`** ("Show S&C details") — a coach sees them after
  opting in.
- **In answer-first pages / drill-downs → fine:** `ProgressiveOverloadCard` (below
  the progressive-overload page verdict), `PlayerLoadAcwrCard` (inside a
  decel-intelligence per-player row).
- **`LoadMetricsCard` is DEAD CODE** — 0 mounts anywhere. Not a fix; a *cut*
  candidate (let usage analytics confirm, then delete).
- **`SessionRpeMonitoringCard`** already leads with a plain compliance summary
  ("X/Y submitted · Z missing · N% compliance") + lists who's missing — fine.

### Done (the genuinely-ungated / high-visibility ones)
- ✅ **`DailyInternalLoadCard`** (dashboard Load tab, was a pure dump) — added a
  computed verdict + moved the per-player table behind the new `<ShowDetails>`.
- ✅ **`PlannedSessionLoadCard`** (the **"today"** landing tab) — promoted the
  plain rationale above the sRPE/AU tiles, right under the band verdict.
- ✅ **`GpsLoadIntelligence`** — hoisted the Cohort Alerts answer to the top
  (polish; it's already gated).
- ✅ New reusable **`<ShowDetails>`** (`src/components/common/ShowDetails.tsx`).

### Remaining (low urgency — let usage data drive it)
The mixed analytics pages (hsr / ima / quadrant / decel-intelligence) each already
lead with a `VerdictBanner`; the only gap is that a jargon table renders inline
after it. Wrapping those tables in `<ShowDetails>` is the same one-line pattern,
but they are deep-dive S&C surfaces — worth doing only if usage analytics shows
coaches actually open them.
