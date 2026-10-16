# Claude Code brief — P4: coach-signals coverage audit ("one screen, depth on click")

## Why
The product now has a trustworthy pipeline (pipeline health-monitor #2.1) and honest numbers (load
provenance #2.2). P4 is the payoff layer: make **Today the one screen a coach needs**, where every
analytical engine that has something exception-worthy to say surfaces as a small, exception-gated,
cited chip — and the full analysis is one click away. The `coach_signals` system already does this for
16 engines (`coachSignals/index.ts` + `/api/coach/signals` + `CoachSignalChips` / the attention rows).
This task **audits the whole engine catalogue for coverage** and closes the high-value gaps, so no
engine's insight is stranded on a page a coach never opens.

The discipline that makes this safe already exists and is non-negotiable here: a chip is **silent unless
it's an exception** (level ≠ steady), conservative gating keeps the flag-rate low (validated on live
Breiðablik; the form-dip "exclude low-confidence" guard is the model), each chip is **bilingual + cited +
confidence-bearing + links to its drill-down**, and it sits **beside** `v_coach_readiness_today_v8.final_color`,
never becomes it.

## Step 1 — the audit (produce the coverage matrix first)
Enumerate every coach-facing analytical engine and score its Today coverage. Two sources define the
universe: the **sidebar destinations** (`CoachSidebar.tsx` — every `/coach/*` page) and the **engine
modules** under `src/lib/micropulse/*`. For each, fill:

| Engine / surface | Has a Today chip? (engine key) | Exception-gated? | Confidence? | Counterfactual/"why"? | Drill-down href? | Provenance-aware? (#2.2) | Flag-rate on live Breiðablik |

**Already covered (16 — verify they still meet the bar):** `game_plan_fit, post_training, match_minutes,
form_vs_state, robustness, hrv_recovery (dormant), hr_load, post_match_recovery, fitness_trend, body_comp,
speed_zones, position_fitness, strength_1rm, strength_phase, wearable_recovery, ccc_gate`.

**Seeded gap list to confirm + prioritise** (engines that produce a coach verdict but have no chip — the
builder should validate each exists and is exception-shaped before adding):
- **Neuromuscular fatigue (CMJ)** — a CMJ jump-height / RSImod drop vs the player's own baseline (the VALD
  "fatigue monitor"); distinct from the strength-program chips. High value, clearly exception-shaped.
- **Load ACWR spike** — `playerLoadAcwr` already yields a `WATCH/RISK` band + a driver flag
  (`buildAcwrDriverFlag`); surface a chip when a player's external-load ACWR is elevated. (Carry the #2.2
  provenance: suppress/soft-flag when `estimatedDays`/`stale` dominate the window.)
- **Stride-length fatigue** — the band5-8 distance ÷ strides flag.
- **Readiness Outlook** — the forward next-microcycle wellness forecast (a pre-emptive "rough week ahead").
- **Build-up / load-plan adherence** — actual-vs-planned weekly load drift on the periodization hub.
- **Movement-screen deficits / RTP clearance** — an open deficit or a not-yet-cleared RTP gate (ccc_gate
  covers *progression*, not the clearance verdict or movement deficits).
- **Availability / illness** — a player newly unavailable or an illness flag not yet actioned.
- **Peak-period / mechanical-power, role-demand-fit, player-signature** — assess whether each has a daily
  *exception* (many are analytical, not exception-gated — a chip only fits where there's a "today this
  changed" trigger; don't force a chip onto a pure browse surface).

The matrix is the deliverable of Step 1 and decides the build order — do NOT add a chip to an engine that
has no genuine daily exception (that manufactures noise, the opposite of the goal).

## Step 2 — close the gaps (one adapter at a time, same proven pattern)
For each prioritised gap, mirror the existing adapter shape — this is a thin, well-worn path:
1. A pure `derive<Engine>Signal(lite): CoachSignal` (+ `derivePlayer<Engine>Signals` for per-player) in
   `coachSignals/index.ts` — `level` (steady|watch|elevated|task), bilingual `label`/`why`, `confidence`,
   `counterfactual`, `href`, and the citation in the why/counterfactual. Silent (steady) below threshold.
2. A thin IO bridge (`<engine>/teamLoad.ts` or `signalLoad.ts`) that reuses the engine's existing team
   loader — **no per-player HTTP fan-out, no duplicated compute**; degrade to `[]` on failure.
3. Wire it into the route's `Promise.all` (each `.catch(()=>[])`), add to the team / per-player arrays.
   `engine` is free text (no CHECK) and the chip renderer is generic → **no migration, no UI change**.
4. **Unit tests** for the pure adapter (steady vs fires, confidence, href, "never the readiness colour"),
   mirroring `coachSignals/__tests__/coverage.test.ts` incl. the boundary test (no readiness imports).
5. **Flag-rate validation on live Breiðablik** (a `scripts/validate-<engine>-signal.ts` like the existing
   ones): the exception rate must stay within budget (~<20% of player-days) — tighten the gate (e.g. the
   low-confidence exclusion) until it does. A chip that fires most days trains the coach to ignore all chips.

## Step 3 — provenance + performance (ties P4 to #2.1/#2.2)
- **Provenance-aware chips (#2.2):** an engine built on load/readiness that is *estimated* or *stale* must
  carry that — reuse `load/provenance.ts` / `readiness/imputedVerdict.ts` so a chip never fires a confident
  exception on a fill. Minimum: down-weight confidence; where the exception is entirely estimated-driven,
  stay steady.
- **Nightly pre-compute (now worth doing):** the route computes all adapters on the first Today load of the
  day (delete-then-insert into `coach_signals`). Each adapter adds ~1–4 s; past ~20 adapters that first load
  is too slow. Add the nightly writer (a cron that pre-populates `coach_signals` for every active team, same
  compute) so the first Today load is always a cache hit. (This is the long-standing "Not done" item in the
  coach-signals notes and becomes load-bearing at P4 scale.)

## Guardrails / tests
- **Exception-gated + conservative:** silent unless genuinely actionable; validate flag-rate per adapter.
- **Beside the colour, never the colour:** every chip is advisory, cited, links to its drill-down; it never
  reads or writes `readiness_entries.color` / `v_coach_readiness_today_v8.final_color` as a verdict (the
  existing boundary test enforces this for `coachSignals/index.ts` — keep it green).
- **No fabricated chips:** only engines with a real daily exception get one; a pure analytical surface stays
  a destination, not a chip.
- **Reuse, don't rebuild:** each adapter reads an existing engine's team loader; no new per-player fan-out.
- `npx eslint` + typecheck + `npx vitest run src/lib/micropulse/coachSignals` on every change; the coverage
  matrix (Step 1) committed as a doc so coverage is auditable over time.

## Why this is the right shape
It completes the manifesto's "one screen, depth on click": Today becomes decide + quick-reach, the hubs
stay the analyse/deep surfaces, and every engine's exception is one glance away with its provenance and its
"why" — the trust layers (#2.1 pipeline, #2.2 provenance) are what make a wall of chips believable instead
of noise.

---

## Step 1 — AUDIT RESULT (done 2026-10-16)
Grounded against `coachSignals/index.ts` (the `SignalEngine` union), `signals/route.ts` (the wiring) and a
sweep of the `src/lib/micropulse/*` engine modules for a team/batch loader.

**Covered — 17 engine keys ship a chip** (16 standalone + `hrv_recovery` folded into `wearable_recovery`
via `mergeRecoveryReads`): `game_plan_fit, post_training, match_minutes, form_vs_state, robustness,
hr_load, post_match_recovery, wearable_recovery (hrv_recovery folded in), fitness_trend, body_comp,
speed_zones, position_fitness, strength_1rm, strength_phase, ccc_gate,` **`load_acwr` (NEW — this pass)**.
All sit beside the colour, exception-gated, cited, with a drill-down href; boundary test green.

**Gap closed this pass — `load_acwr`** (external Player-Load ACWR spike). Engine + band + driver flag +
batch loader (`loadPlayerLoadAcwrBatch`) already existed → only the adapter, a thin `signalLoad.ts` and
route wiring were missing. Shipped provenance-aware (Step 3): `stale` windows dropped, estimated/away
windows down-weighted. Commit `f329e1f`.

**Confirmed remaining gaps (have a team/batch loader, no chip yet — prioritised):**
| Engine | Loader (reuse) | Exception shape | Overlap / caution |
|---|---|---|---|
| **cmj_fatigue** (neuromuscular) | per-player `loadCmjFatigue` only — needs a thin team loader (copy the batch pattern) | CMJ slope/latest ≤ −1 personal SD + fatigue TYPE (central/peripheral) | **Folded into `robustness`** as one injury-risk contributor — a standalone chip must frame the distinct *fatigue-type* question, and its flag-rate must be de-duped against the robustness chip before shipping |
| **sprint_speed_drop** | `loadSprintDropBatch` (sprintSpeedDrop/loader.ts) | within-player max-velocity drop vs own baseline | clean gap; validate flag-rate |
| **stride_fatigue** | `loadTeamStrideVerdicts` (strideLength/loader.ts) | band5–8 distance ÷ strides fatigue verdict | clean gap |
| **load_plan_adherence** | buildUpTracking (per-player loader; needs team fan-out) | accrued weekly load drifting from the periodization plan | planning signal, not daily — gate to a weekly cadence |
| **readiness_outlook** | readinessOutlook/loader.ts | forward next-microcycle "rough week ahead" forecast | label clearly as a forecast; confidence-bearing |
| **movement_screen / rtp_clearance** | movementScreen/loader.ts | an open movement deficit or a not-yet-cleared RTP gate (ccc_gate covers progression, not clearance) | clinician surface — a prompt, never a decision |

**Assessed, NOT chip candidates (pure analytical / browse surfaces — forcing a chip would manufacture
noise):** `signalPack` (combiner feeding robustness), `imaDayProfile`, `peak-period / mechanical-power`,
`role-demand-fit`, `player-signature`, `seasonTrends`, `pipelineHealth` (ops, not a player read). These
stay destinations.

**Step 3 still-open (unchanged):** the nightly pre-compute cron for `coach_signals` — becomes load-bearing
as the adapter count climbs (first Today load now runs ~17 adapters). Not yet built.
