# Claude Code task — Today Command Center wrongly shows "Rest day" for a scheduled training day

Paste to Claude Code (or `@docs/tasks/today-command-center-restday-bug-claude-code-brief.md`).

## Symptom
On `/coach` (dev-coach dashboard, `TODAY COMMAND CENTER`), today shows:
> **Rest day — no session for the squad.** · header "MD OTHER" · "Confirmed rest day from the week plan. No team session scheduled today."

…even though Week Setup scheduled a training session for today.

## Verified data (this is correct — not the bug)
`coach_week_setup` for Breiðablik (`94b52a06-0b83-48da-8664-639ec3486a0c`), week
`2026-07-06`: `week_type = NO_MATCH`, `no_match_intents =
["OFF","OFF","FORCE","FORCE","OFF","POLISH_CALM","ACTIVATION"]` (Mon→Sun). Today is **Wed
2026-07-08 = index 2 = "FORCE"** → a training day (MD-4). So the week plan DOES have a session today.

## What already works (use as the reference)
The shared load-plan engine resolves this correctly:
`src/lib/micropulse/loadPlan/forTeam.ts` → `resolveMdContext()` reads
`coach_week_setup.no_match_intents[weekdayIndex]` and maps the intent to an MD via `MD_OF`
(`FORCE→MD-4`, `NEURAL_VELOCITY→MD-3`, `VELOCITY→MD-2`, `POLISH_CALM→MD-2`, `ACTIVATION→MD-1`,
`GAME→MD`, `OFF/RECOVERY→OFF`). Prod reads today through this engine and shows the FORCE session.
The bug is only in the **dev-coach dashboard's own, separate context resolution**.

## Root cause — the dashboard has SEVERAL independent "today context" sources, most ignoring Week Setup
File: `src/app/coach/dev-coach-dashboard/DevCoachDashboardClient.tsx`. The OFF_DAY verdict is
decided by `computeState(...)` (~lines 908–925):
```
const offByIntensity = String(input.teamContext.intensity ?? "").toUpperCase() === "OFF";  // ~919
const offByMd = isOffLikeToken(mdNorm);                                                     // ~916
const allPlanTypesOffLike = planDayTypes.length>0 && planDayTypes.every(isOffLikeToken);    // ~917
...return { state: "OFF_DAY", ... }                                                          // ~925
```
It goes OFF_DAY if intensity is "OFF" **or** MD is off/blank **or** all planned day-types are off.
Today's context is assembled from multiple sources that do NOT all read
`coach_week_setup.no_match_intents`:
- `mdDayToday` memo (~line 2989): `mdContextToday ?? weekGridRow?.md_day ?? planPreview?.md_day` —
  **`mdContextToday` takes priority over the (now-correct) week grid.**
- `mdContextToday` (state ~line 2420) is fetched from a legacy source (`v_training_day_context` /
  `ctxMd`, ~lines 3921–3938) which returns nothing for a NO_MATCH intent week → null/"OTHER".
- `ctxIntensity` (~lines 3344–3355) is computed from that same legacy context, so for a NO_MATCH
  intent week it defaults to **"OFF"** → `offByIntensity` fires → OFF_DAY, regardless of the grid.

Net: the dashboard never feeds the `FORCE→MD-4 / training` fact from `no_match_intents` into the
intensity / mdContextToday inputs that the verdict actually reads. Hence "MD OTHER → rest day".

## Already applied (keep it — necessary but not sufficient)
`mapNoMatchIntentToGrid()` now also returns `mdDay` (lockstep with `MD_OF`) and the `derivedGrid`
sets `md_day: mapped.mdDay` instead of `null` (so `weekGridRow.md_day` is now e.g. `"MD-4"`). This
alone does NOT fix it because the verdict reads `mdContextToday`/`ctxIntensity`, which still come
from the legacy path.

## The fix — one source of truth
Route the dashboard's "today context" (mdContext, intensity, day-type) through the SAME resolver the
load-plan engine uses, so the Command Center can't disagree with the plan:
1. When `coach_week_setup.no_match_intents` exists for the current week, derive today's context from
   `no_match_intents[idx]` for ALL of: `mdContextToday`, `ctxIntensity`, and the `planDayType`/
   day-type inputs to `computeState` — not just `weekGrid`. Reuse `intentToMd()` from
   `forTeam.ts` (export it if needed) and map intent → intensity:
   `OFF/RECOVERY → "OFF"`, `POLISH_CALM/ACTIVATION → "LOW"/"MEDIUM"`, `FORCE → "HIGH"` (or the
   dashboard's existing intensity vocabulary) — a TRAIN intent must NOT resolve to "OFF".
2. Make `no_match_intents` WIN over the legacy `v_training_day_context` for the current week
   (it's the coach's explicit, latest input). Only fall back to the legacy view when Week Setup has
   no intents for the week.
3. Fix the `mdDayToday` precedence (~2989) so a valid week-grid `md_day` is not overridden by a
   null/"OTHER" `mdContextToday`. Prefer: resolved-from-intents context → week grid → planPreview.
4. Ideally, replace the bespoke resolution with a call to the shared `resolveMdContext()` (extract a
   client-safe version or add a tiny `/api/coach/today-context` that returns
   `{ mdDay, dayType, focus, intensity }` from `resolveMdContext`). Single source of truth is the
   real fix; the per-field patches above are the minimum.

## Acceptance criteria
- With the Breiðablik NO_MATCH week above, **Wed 2026-07-08 shows a training day (MD-4 · FORCE), not
  "Rest day / MD OTHER".** The Thu (FORCE), Sat (POLISH_CALM→MD-2), Sun (ACTIVATION→MD-1) days also
  resolve as training; the Mon/Tue/Fri OFF days still show rest.
- The Command Center verdict matches the shared load-plan engine / prod for the same team+date
  (no more disagreement between `/coach` dev dashboard and the load-plan card).
- OFF and RECOVERY intents still correctly produce a rest/off day.
- Keep the already-applied `mapNoMatchIntentToGrid` md_day change.
- `npx tsc --noEmit` clean; `npx eslint` introduces no NEW errors on the touched file (it has
  ~114 pre-existing legacy `any`/unused errors — don't add to them). Stage specific files (no
  `git add -A`); the user manages git checkpoints in VS Code.

## Quick trace pointers (line numbers approximate)
- Verdict: `computeState` ~908–925 (`offByIntensity`/`offByMd`/`allPlanTypesOffLike`).
- `mdDayToday` memo ~2989 (precedence bug).
- `ctxIntensity` compute ~3344–3355 (defaults OFF for intent weeks).
- `mdContextToday` fetch ~3921–3938 (legacy `v_training_day_context`).
- Week-grid build from intents ~3577–3590 (already fixed to emit `md_day`).
- Shared correct resolver: `src/lib/micropulse/loadPlan/forTeam.ts` `resolveMdContext` / `intentToMd` / `MD_OF`.
