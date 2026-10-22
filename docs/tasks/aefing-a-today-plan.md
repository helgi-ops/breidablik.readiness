# Plan — "Æfing dagsins" strength action card on Player Today

## Context
The strength **session of the day** already renders on Player Today (PlayerClient `renderStructureBlocks`), but it's buried below the portal cards and its readiness adjustment is applied by **DOM-scraping + `<li>` text mutation** from `PlayerTabbedClient.enforceRenderedWorkoutBlocks` — fragile (its `div.rounded-2xl.border.p-4` selector doesn't cleanly match the current markup, so it's likely already partly broken). The handoff (`Æfing á Today`) wants it as a proper **action card directly under the decision card**, readiness-adjusted (green/yellow/red → adjusted volume), with a **"Byrja æfingu" focus screen**. No new data, no new API — reuse the parser, the method explainability, and the already-computed adjustment; just reorder + theme + surface it natively.

**Hard constraint (user):** the today-load **"áætlað æfingaálag"** outlook card (built in the load-loop work) MUST stay in the Today layout. New order:
`Greeting → Decision → **Æfing dagsins** → áætlað álag (today-load) → recap → RTT → RPE → See more → nudge prefs`.

**Decisions locked (from user):**
- Build **Phase 1 (card + banner) first**; the full **"Byrja æfingu" focus screen is Phase 2** (fast-follow).
- Readiness state comes from the **Stage-4 plan's own `readiness_level`** (native), not DOM-scraping.

**Out of scope:** RTP / physio-approved rehab (round 21d); the Strength/VBT history tab (`DevPlayerStrengthTab`, stays under "Meira"); any change to `reduceSetsInLine` logic or the load metrics.

## Approach — render natively in PlayerClient, retire the DOM-scraping
Everything needed already lives in `PlayerClient.tsx`: the fetched plan (`Stage4PlanRow` with `structure` + `readiness_level` + `md_day`), the parser (`parseExerciseItem`, `groupIntoSegments`, `stripVelocityQualifier`), the method text (`METHOD_GUIDE`, `BLOCK_GOAL`), and the render (`renderStructureBlocks`). The **adjustment** is the only thing currently computed elsewhere. So:

1. Compute the enforced adjustment **inside PlayerClient**, reusing the SAME pure functions PlayerTabbedClient uses — `buildDevDailySessionAdapterResult` (`@/lib/micropulse/trainingGraph/devAdapter`) → `buildEnforcedSessionPlan` (`@/lib/micropulse/lightAte/enforcement`) — seeded from data PlayerClient already has: `readiness_level` → athleteState, `md_day` → mdContext, and the check-in score. This yields `{ playerState, sessionMode, adjustments: { setReduction, extraRestSeconds, velocityLossCap, disablePlyo, disableBallistic, forceRecoveryBlocks } }` — the exact same numbers, no new logic, no DOM.
   - Implementation note: first confirm PlayerClient has the check-in score/flag it needs (it renders the readiness explanation, so it does). If a piece is missing, fall back to `buildEnforcedSessionPlan({ ateState: readiness_level })` — state-only.
2. `renderStructureBlocks` takes an optional `adjust` argument and renders the adjustment **into JSX** (below), instead of mutating text after the fact.
3. **Remove** the `enforceRenderedWorkoutBlocks(nextDecision)` call from `PlayerTabbedClient` (AteCommandCardPortal effect) and delete the function + `reduceSetsInLine` there once PlayerClient owns the adjustment. (Grep first — ensure nothing else depends on them.) This eliminates the fragile scraping.

## Phase 1 — the action card (rounds 21a / 21c)
In `renderStructureBlocks` (or a new sibling that wraps it), produce:
- **Header:** "Æfing dagsins" + subtitle (e.g. "Styrkur · neðri líkami" from the plan title/block).
- **Adjustment banner** (top, colored by `playerState`), palette from the handoff:
  - GREEN `#eef7f0/#146c40` → "Full æfing — ekkert tekið af".
  - YELLOW `#faf1de/#9a6410` → "Aðlöguð — eitt sett tekið af hverri lyftu" + a "Af hverju?" toggle (plain reason).
  - RED `#f8e9e3/#a83e28` → "Létt/valfrjáls — hörðustu blokkir felldar niður".
- **Exercise list** (3–4 visible, rest as "+N blokkir"): name + method + sets×reps.
  - When adjusted: show the **original set struck through → new** (e.g. ~~4~~×3), computed via `reduceSetsInLine` applied to the parsed `setsReps` (reuse the fn, moved to a shared spot or kept in PlayerClient). High-output blocks (`/primer|ballistic|plyo|explosive|contrast|main force/i`) hidden when `disablePlyo`/`disableBallistic`/recovery.
- **Footer:** "+N blokkir · ~M mín" + **"Byrja æfingu →"** button (Phase 1: button present; opens the focus screen which lands in Phase 2 — until then it can scroll to the full list / be disabled with a "coming" state, OR Phase 2 ships close behind).
- **Placement:** move this render to sit directly under the decision. Given Today is portal-assembled off `dev-ate-command-card-slot`, the robust move is to relocate the strength root to **immediately after `dev-ate-command-card-slot`** (a small placement effect mirroring the hardened portal pattern — gate on data ready + MutationObserver), BEFORE `dev-today-load-slot`. The today-load outlook then naturally follows it. Keep pending/locked states.

## Phase 2 — "Byrja æfingu" focus screen (round 21b) — ✅ SHIPPED (commit 94d88c8)
Delivered: full-screen `SessionFocusScreen` launched by the `TodaySessionCard` "Byrja æfingu →" button. Walks one block at a time with a progress bar; per-exercise set tracker (done/total dots + "Sett lokið ✓" + next-set hint); plain "how to perform" per exercise reusing `METHOD_GUIDE`; block goal from `BLOCK_GOAL`; choice blocks pick A/B; calm completion screen (no load gamification). A new shared `buildSessionBlocks()` is the SINGLE source both the card and the focus screen consume (same sort + high-output filter + readiness set-reduction), so they can't drift. Bilingual EN/IS. today-load outlook + Phase-1 banner untouched.
Still deferred (not blocking): strikethrough-original set styling (~~4~~×3) in both card and focus rows; retire the dead `enforceRenderedWorkoutBlocks`/`reduceSetsInLine` in PlayerTabbedClient.

### Original spec
A focus view, one block at a time (new UI in PlayerClient, triggered by the button):
- Progress bar (blocks done / left); current block: name, sets/reps/%1RM/rest (adjustment shown, struck).
- **Method explained in plain language** — reuse `METHOD_GUIDE` (Cluster/EMOM/AMRAP/ISO/MET) + `BLOCK_GOAL`, keyed by method/block. Do NOT write new copy.
- Set counter (done / now / left) + "Sett lokið ✓" + "Næst: …".
- **Choice blocks** (`kind: "choice"`) → player picks A or B (parser already supports this).

## Files
- Modify: `src/app/player/PlayerClient.tsx` — compute adjustment natively; extend `renderStructureBlocks` (banner + strikethrough + "Byrja æfingu"); Phase-2 focus screen; relocate strength root under the decision.
- Modify: `src/app/player/PlayerTabbedClient.tsx` — remove `enforceRenderedWorkoutBlocks` call + the function + `reduceSetsInLine` (once PlayerClient owns it); ensure `dev-today-load-slot` still anchors after the strength slot so the outlook stays.
- Reuse (no change): `@/lib/micropulse/trainingGraph/devAdapter` (`buildDevDailySessionAdapterResult`), `@/lib/micropulse/lightAte/enforcement` (`buildEnforcedSessionPlan`), `PlayerClient` parser + `METHOD_GUIDE`/`BLOCK_GOAL`.

## Verification
- `npx tsc --noEmit` + `npx eslint` clean on touched files.
- Manually (minted player tokens on localhost, per the load-loop verification flow) check three readiness states for a Breiðablik player with a strength plan: GREEN → full, all sets stand; YELLOW → banner + one set struck per lift (number from `reduceSetsInLine`); RED → high-output blocks hidden. Confirm the number matches the old `enforceRenderedWorkoutBlocks` output for the same decision (no drift).
- Confirm **today-load outlook still renders** directly below the strength card, and recap/RTT/RPE/See-more/nudge order intact.
- Choice A/B blocks render + selectable; Strength/VBT history untouched under "Meira".
- EN default, IS toggle (strings already bilingual / reuse `METHOD_GUIDE` both langs).
- Commit Phase 1 and Phase 2 separately, specific-file staging.

## Open risks
- **Adjustment parity:** the native compute must match the retired DOM path exactly — verify side-by-side before deleting `enforceRenderedWorkoutBlocks`.
- **Placement:** relocating the base-DOM strength root above the portals is the fiddliest bit; if a clean DOM-relocation proves brittle, fall back to rendering the strength card as its own portal (like the load/recap cards) fed by a lifted copy of the parsed plan.
