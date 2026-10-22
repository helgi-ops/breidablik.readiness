# Claude Code task — Match Intensity: 1st vs 2nd half (IMA fade across the match)

Paste to Claude Code (or `@docs/tasks/match-intensity-halves-claude-code-brief.md`).

## What this is (and the one-line why)

A new surface that shows **how a player's high-intensity movement fades across a match** — first half
vs second half — from data MicroPulse already ingests. It answers "who drops off, and how hard?" per
player, and gives the squad's overall fatigue signature per match. No Catapult/OpenField change is
required: the period data is already flowing in.

**This is validated on real Breiðablik data** (do not re-derive the pipeline from scratch — it works):

- Squad-wide, per-minute high-intensity IMA falls **0.19 → 0.13 (−32%)** from first half to second; total
  IMA/min **6.65 → 4.66 (−30%)**.
- Per-player 2nd-half drop-off ranges **−28% to −74%** — a clean, differentiating signal. The steepest
  (e.g. −57%, −74%) are the players fading hardest; the extreme values come from few matches, which is
  exactly why a **confidence gate** is required (below).

This matches the literature: high-intensity output declines across match halves (Akenhead 2013; Mohr
et al. 2003).

## The data is already there (verify, don't rebuild)

`player_drill_load` stores per-**period** rows with the full IMA set — no aggregation-only limitation:

- `period_name`, `period_order`, `duration_min`, `saved_session_id`, `player_id`, `team_id`, `session_date`
- IMA: `ima_accel`, `ima_decel`, `ima_cod_total`, `high_ima`, `jumps`
- plus `player_load`, `player_load_per_min`, `distance_m`, `hir_total`, `vel_b5/b6`, `accel_b23`,
  `decel_b23`, `hmld_m`, `metabolic_power_avg/peak`.

Match halves arrive as periods named **"Fyrri hálfleikur" / "Seinni hálfleikur"** — note real spelling
variants in the data: `fyrri h%` / `seinni h%` (with and without the accent: *hálfleikur* / *halfleikur*).
Match the half with `period_name ILIKE 'fyrri h%'` → 1, `ILIKE 'seinni h%'` → 2. **Exclude**
`AutoCreatedPeriod` (that's the whole session, ~99 min) and any non-half periods.

## The metric (get this right — per-minute, not raw totals)

Raw first- vs second-half totals are confounded by unequal half lengths, substitutions, and stoppage
time. **Normalise per minute.**

- **Primary:** high-intensity IMA per minute — `high_ima / duration_min` — per half.
- **Secondary:** total IMA per minute — `(ima_accel + ima_decel + ima_cod_total) / duration_min`.
- **The headline number:** `% change = (h2_per_min / h1_per_min − 1) × 100`. A big negative = a hard
  second-half fade. (Optionally also HIR/min and player_load/min as supporting reads.)

Compute per **player per match** (join halves within the same `saved_session_id`), then a per-player
rolling figure across recent matches (the player's typical fade), and a **team** figure per match.

## Gates and honesty (manifesto — non-negotiable)

- **Both halves, meaningful minutes:** require ≥ ~20 min in *each* half of a match for that match to
  count (a sub who played one half has no delta — show "–", never a fabricated number).
- **Confidence = matches behind it.** A −74% off one match is not the same as −35% off eight. Show a
  confidence/maturity read (n matches); below a floor (e.g. < 3 matches) label it **"building"**, never a
  confident verdict. The extreme single-match values in the validation are exactly what this prevents
  from over-reading.
- **This is a match-context signal, not a readiness verdict.** It must **not** touch
  `v_coach_readiness_today_v8.final_color` or the daily decision. Surface it as its own labelled read.
- **No-data ≠ zero:** no half periods / indoor / GPS-less match → no-data, labelled.
- **Personal framing:** compare a player's 2nd-half fade to *his own* typical fade where possible, not a
  squad threshold — a natural high-drop winger isn't the same case as a centre-back who suddenly drops.

## Explainability (layered read, like every MicroPulse surface)

- **Verdict / glance:** "2nd-half high-intensity down 32% (his usual: −30%)" — the fade, in one line.
- **Plain why:** which movements fell — e.g. "change-of-direction and accelerations dropped most."
- **Confidence:** "based on 6 matches" / "building — 2 matches".
- **Detail (toggle):** per-match h1 vs h2 per-minute bars, and the supporting metrics (HIR, player_load).
- **Citation:** Akenhead 2013; Mohr 2003. Frame it as a conditioning/rotation insight, not injury prediction.

## Where (build layout)

- Pure, tested helper under `lib/micropulse/` (e.g. `matchIntensityHalves/`): takes half-period rows →
  per-player per-match {h1_per_min, h2_per_min, pct_change, n_matches, confidence}. No IO.
- API route reading `player_drill_load` (mirror the existing `api/coach/team/ima-*` routes).
- Surface on the **Match Movement** page (best home) or as a section on IMA Intelligence — a per-player
  table sorted by fade, + a team summary line, behind the layered-read components. Team/Player toggle.
- Bilingual EN/IS; English default; jargon behind tooltips.
- No DB migration needed (data already ingested). If any cache table is added, save a timestamped `.sql`
  under `supabase/migrations/` (CLAUDE.md).

## Acceptance

- Per player with ≥3 qualifying matches: shows h1/h2 high-IMA per minute and the % fade; the squad-wide
  figure reproduces ~−30% on the current data (sanity check).
- A player who only ever played one half shows "–", not a number; a player with <3 matches shows
  "building".
- Sorting by fade surfaces the biggest drop-offs first; each row exposes verdict → why → confidence →
  citation.
- Nothing touches the readiness colour or the daily decision; `npx eslint` clean; unit tests for the
  helper (per-minute math, the both-halves gate, the confidence floor, spelling-variant matching,
  AutoCreatedPeriod exclusion); stage specific files only.

## Do NOT

- Do **not** use raw half totals — per-minute only (unequal halves/subs/stoppage confound raw sums).
- Do **not** read a single match as a chronic fade — gate on match count, label "building" below the floor.
- Do **not** surface this as a readiness/injury verdict or let it change `final_color` — it's a
  conditioning/rotation context signal (Akenhead/Mohr), stated as such.
- Do **not** fabricate a delta for one-half players or GPS-less matches — no-data, labelled.

## Future (same pipeline, finer resolution)

If the club later splits matches into fixed 5/10-minute periods in OpenField, those periods flow into
`player_drill_load` automatically — the same helper extends from 2 halves to N time-bins, giving a true
within-match intensity timeline (e.g. the last-15-minutes drop) with no pipeline change. Halves first;
this is the natural next step.
