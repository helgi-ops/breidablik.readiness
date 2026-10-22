# Check-in reliability signal (two-tailed variance) — the last readiness accuracy lever

The SD floor (Phase 0) is live and well-calibrated (squad yellow 15.7→7.7%, reds preserved — see
`readiness-flag-rate-validation-findings.md`). The one remaining accuracy gain is **not another
threshold** — it's telling the coach when a player's personal norm is **unreliable**, on BOTH tails of
check-in variance. A quiet data-quality note, never a verdict, never the readiness colour.

## Why (grounded in the squad validation)
- **Very low variance** (Anton SD 1.15, Birkir 1.07, Höskuldur 1.10): near-identical entries → the norm
  may be **auto-filled / low-effort**, so any deviation looks large. The floor handles the flagging, but
  the coach should know the baseline is thin.
- **Very high variance** (Gylfi SD 3.10, Ívar 3.94, Valgeir 2.89): erratic entries → the norm is a
  **noisy baseline**; the floor doesn't touch them (real SD > 1.5) so they keep flagging, and the coach
  should know those flags rest on unstable self-report. Gylfi (54% flagged) is the clearest case.

## Data already exists
- `athlete_metric_baselines` (nightly mean, sd, n) — read by `baselines/index.ts`. `baseline_sd` /
  `baseline_n` are also stored per row in `readiness_entries.training_modifier`.
- So no new computation of variance is needed — just read `sd` + `n` and classify.

## The signal
Add a per-player **check-in reliability** classification (28-day window):
- `insufficient` — `n < 7` (baseline building; already handled elsewhere, surface as low confidence).
- `low_variability` — `sd < ~1.0` (tunable): "near-identical check-ins — norm may be under-informative".
- `stable` — `~1.0 ≤ sd ≤ ~2.5`: normal, no note.
- `high_variability` — `sd > ~2.5` (tunable): "swingy check-ins — norm rests on a noisy baseline".
- **Stronger auto-fill detector (optional, better than SD alone):** fraction of the last N entries that
  repeat the previous day's exact `total_score` (or identical component vector). A high repeat-rate is a
  more specific "auto-filling" signal than low SD. Surface it in the same note.

## Where it surfaces (all descriptive)
1. **Confidence modifier, not colour.** Feed the reliability class into the readiness/robustness
   confidence (`low_variability`/`high_variability` → lower confidence on that player's flags). The
   colour is unchanged; only the confidence + note changes.
2. **A quiet note** on the player card / signal pack: "Low check-in variability — his baseline may be
   under-informative" / "High check-in variability — flags rest on a noisy baseline; worth a word on
   consistency". Bilingual EN/IS.
3. **Coach data-quality view** (`dataQuality.ts` is the natural home — it already models feed
   coverage/health; add a `checkinReliability` sibling to its `FeedVerdict`/signal set): a squad list of
   who is low/high variability, so the coach can fix the input, not chase the output.

## Guardrails
- **Never a verdict, never the readiness colour.** It annotates confidence and prompts a coach
  conversation about *input quality* — it does not change any player's green/yellow/red.
- Personal, tunable thresholds; label as data-quality; provenance (window, n, sd, repeat-rate).
- Do not punish the player — frame as "the baseline may be unreliable", a shared input-quality task.

## Verification
- Recompute the squad list and confirm it separates the two tails correctly (Anton/Birkir →
  low_variability; Gylfi/Ívar/Valgeir → high_variability; mid-SD players → stable).
- Confirm zero change to `readiness_entries.color` — only confidence/notes.
- Unit-test the classifier (boundaries at the SD cutoffs; repeat-rate detector; n<7 → insufficient).

## Rollout
1. Reliability classifier lib (read `athlete_metric_baselines` sd/n + repeat-rate) + tests.
2. Wire as a confidence modifier + player-card note.
3. Add the squad reliability list to the coach data-quality surface.

Ref: `readiness-flag-rate-validation-findings.md`, `baselines/index.ts` (sd/n + existing SD floor),
`dataQuality.ts` (feed-quality home), `athlete_metric_baselines`, CLAUDE.md (canonical colour — do not
touch).
