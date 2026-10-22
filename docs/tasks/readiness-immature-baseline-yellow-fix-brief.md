# Code brief — Readiness: stop penalising low-check-in players with a permanent YELLOW — ready to paste

## Symptom (real, in production)
Kristinn Narfi Björgvinsson (RB) and Aron Bjarnason (LW), both Breiðablik, keep getting a **lighter session
(REDUCED)** on days they are objectively fine and carry **low external load** (~8 load-days/month, avg player
load 386–416). The coach's instinct is right: the lighter session has **nothing to do with load** — it comes
entirely from the morning wellness **readiness colour**, which is being pulled YELLOW when it shouldn't be.

This is the canonical colour (`readiness_entries.color` = `v_coach_readiness_today_v8.final_color`), so the
REDUCED action, the Today card and every downstream surface all inherit it. We are fixing the engine that
writes it, carefully, per the canonical-verdict contract in CLAUDE.md.

## Root cause (traced in the engine, not guessed)
Engine: `public.mp_apply_hybrid_readiness()` trigger, defined in
`supabase/migrations/20260828200000_wellness_sd_floor_and_absolute_change.sql`. The `computed_auto_reason`
column records the decision each day, and it tells the whole story:

- **Kristinn, most yellow days:** `abs=YELLOW, dev=GREEN, final=YELLOW` (e.g. 2026-10-19, total 19/20).
  His *personal* signal (`dev`) says GREEN — he is normal for himself — but `final` still comes out YELLOW.
- **Aron, yellow days:** `abs=YELLOW, dev=YELLOW, final=YELLOW` with `n=7 excl_imputed`.

Three interacting mechanisms produce this:

1. **The "immature baseline" branch uses worst-wins and ignores the personal override.** The engine has a
   proper *personal-baseline-first* path (lines ~174–209): once mature it does
   `abs=YELLOW + dev∈{GREEN,GREEN_PLUS} → trust dev` (the `personal_override`). **But that override only runs
   when `v_n >= 14`** (14 *real, non-imputed* check-ins in 28 days). Below that it falls into the immature
   branch (lines ~165–173) which is plain **worst-wins** — so `abs=YELLOW` dominates a `dev=GREEN`. Kristinn
   sits at `n=10–12` → stuck in worst-wins → YELLOW even though his personal signal is GREEN.

2. **The absolute GREEN threshold requires a literally perfect score.** On the current **5 questions × 1–4 =
   max 20** scale, the absolute bands are `>=20 GREEN, 15–19 YELLOW, <15 RED` (lines ~82–93). So **a single
   question answered 3 instead of 4 (total 19/20) can never be absolute-GREEN** — it is always YELLOW. That
   is the floor forcing `abs=YELLOW` for these flat, slightly-below-max responders. (Note: the migration
   header comment still refers to a "25-point total_score / 19–20/25" — that is **stale**; the live scale is
   5×4 = 20, which makes `>=20` = perfect = the only green, i.e. too strict.)

3. **Imputed off-days keep these players permanently immature.** The baseline excludes imputed rows (correct —
   `off-day-imputation-fix-2026-04-15.md`), but low-load players accumulate many `off_day_*` imputed rows and
   few real check-ins, so `n (excl_imputed)` never reaches 14. They are trapped in the worst-wins branch
   indefinitely. Aron is the extreme: `n=7`, below the `n>=10` needed to even *compute* a personal `dev`, so
   his `dev` just copies `abs` (line ~150–151).

Net: the one place the system is designed to say "this is normal for him, leave him GREEN" is gated behind a
maturity bar that these players can't clear, while the absolute floor treats 19/20 as caution.

## The fix

### Fix 1 — Primary, low-risk: a "semi-mature" personal override at n ≥ 10
In `mp_apply_hybrid_readiness()`, when the personal deviation signal **exists** (`v_n >= 10` so `v_dev` is
actually computed, not copied from `v_abs`) but the baseline is not yet fully mature (`v_n < 14`), allow the
**same personal override the mature branch already uses**, with **all RED safety floors preserved**:

- If `v_abs = 'YELLOW'` and `v_dev ∈ {'GREEN','GREEN_PLUS'}` and **not** chronic-low (`v_mu >= 16`) and no RED
  safety floor triggered (`v_total >= 12`, `v_very_low_count < 2`, `v_dev <> 'RED'`) → `v_final := v_dev`, set
  `v_personal_override := true`, and record an override note (reuse the existing note format).
- Keep worst-wins for RED in this tier: if `v_abs='RED'` or `v_dev='RED'` → RED (then the existing single-low
  soft-RED gate at lines ~211–221 still applies).
- Below `v_n < 10` (no computable personal signal, e.g. Aron today) → **unchanged**: keep today's worst-wins
  immature behaviour. Do not fabricate a personal verdict from too little data — that is honest.

This fixes the Kristinn class immediately (dev=GREEN stops being overridden by a 19/20 absolute-YELLOW) and is
tightly scoped: it only ever moves YELLOW→GREEN when the player's own computed norm says GREEN, never touches
RED, and still caps chronic-low norms at YELLOW.

### Fix 2 — Calibration, SHIP ONLY AFTER VALIDATION: the absolute GREEN band on the 1–4 scale
Independently, review the absolute band `v_total >= 20 → GREEN`. On a 5×4=20 scale this means *only a perfect
20 is green*, which is why healthy, mildly-imperfect self-reports (18–19) read as caution for players still
building a baseline (and for everyone in the immature branch). Candidate recalibration:

- `v_total >= 18 → GREEN` (allows one item at 3, or average ≥ 3.6), `14–17 → YELLOW`, `<14 → RED`
  (keep the existing single-low / very-low RED gates).

**Do not flip this blind.** It changes the canonical colour for *every* player and every historical day.
Gate it on a validation pass over live Breiðablik history, mirroring the discipline already used in this
migration's header (the acute-drop reds were validated 50/50 before shipping):
- Count, over the last ~180 days of real (non-imputed) entries, how many player-days change YELLOW↔GREEN under
  the new band, and inspect a sample of the flips to confirm none were genuine caution days (e.g. a real
  low_count ≥ 1 or a sustained-low PI tag). Report the numbers in the PR. If the flips look like true dips,
  do **not** change the band and rely on Fix 1 alone.

Fix 1 is the safe default; Fix 2 is optional and evidence-gated.

## Guardrails (mandatory)
- **Canonical contract unchanged (CLAUDE.md "Canonical verdict source").** Same engine, same
  `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`. We are making it less trigger-happy,
  not adding a second verdict. Do **not** surface `athlete_decision_history.athlete_state` or
  `stage4_decisions.system_decision` as the colour.
- **Never touches load.** This is a subjective-wellness colour fix only. No GPS/ACWR path is read or written.
  The REDUCED action is derived from the colour (lines ~232–237), so fixing the colour fixes the session —
  that is the entire mechanism; do not add any load gating.
- **All RED safety floors preserved:** `total < 12 → RED`, `very_low_count >= 2 → RED`, `dev=RED → RED`,
  chronic-low (`mu < 16`) cap at YELLOW, single-low soft-RED gate. Fix 1 must not weaken any of these.
- **Keep imputed rows out of the mean/SD** — Fix 1 only lowers the *maturity bar for applying the override*,
  it does **not** pull imputed values into the baseline. The imputation-exclusion stays.
- **Migration discipline:** ship as a new timestamped migration under `supabase/migrations/` that
  `CREATE OR REPLACE`s `mp_apply_hybrid_readiness()` (and apply via `apply_migration`). Do not edit the old
  migration in place.
- **Optional bounded backfill:** to correct already-written recent rows (so the coach sees the improvement
  today, not only on next check-in), re-touch the last ~14 days of `readiness_entries` so the trigger
  recomputes (`update … set total_score = total_score` or an explicit re-save). Scope it to a date window and
  report how many rows changed colour. This recomputes recent history — include the before/after counts.

## Verification / tests
- **Named-case check:** after the fix, re-run (or re-touch) Kristinn's and Aron's recent entries and confirm
  Kristinn's `abs=YELLOW, dev=GREEN` days now resolve `final=GREEN` with `[PERSONAL_OVERRIDE]` in
  `computed_auto_reason`; confirm Aron's `n=7` days are unchanged (honest — too little data) and flip to GREEN
  only once he has ≥10 real check-ins and his `dev` computes GREEN.
- **No genuine RED/YELLOW suppressed:** over Breiðablik's last 180 real-entry days, assert that **no** day with
  `low_count >= 1`, `very_low_count >= 1`, a `pi_acute_drop`/`pi_sustained_low` tag, or `total < 15` changed to
  GREEN. Only "flat but fine" days (dev=GREEN, no low metrics) may move YELLOW→GREEN.
- **Team-wide impact:** report how many active players are currently stuck in the immature worst-wins branch
  (`n (excl_imputed) between 10 and 13`) and how many YELLOW→GREEN flips Fix 1 produces — so we know the scope
  (this is almost certainly broader than these two low-check-in players).
- **Boundary test (explainability):** the `computed_auto_reason` must still spell out `abs/dev/final` and name
  the override, so a coach opening "behind the numbers" sees *why* it is GREEN ("normal for him, global was
  YELLOW"). The verdict keeps its provenance.
- `npx eslint` on any changed TS; the change is SQL-first, so the main artefact is the migration + validation
  queries in the PR description.

## Out of scope
- No change to load/ACWR, the periodised session, or the strength override layers.
- No new colour source, no new table. One engine, one verdict.
- Fix 2 (absolute band) only ships if the validation pass says it's safe; otherwise Fix 1 stands alone.
