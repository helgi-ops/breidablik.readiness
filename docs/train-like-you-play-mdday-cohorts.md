# MD-day microcycle — split MD+1 / MD+2 by match involvement (Recovery vs Top-up)

**Status:** design note (ready to implement)
**Surface:** Coach → Train like you Play → "Weekly periodization by MD-day (% of match demand)"
**Owner files:** `src/app/api/coach/train-like-you-play/route.ts` (microcycle block), `src/app/coach/train-like-you-play/page.tsx` (`MD_TARGET`, microcycle render)

## Problem

The microcycle chart averages **every** training session on an MD-day into one number
(`route.ts`, the `micro` loop). It does not know who played in the preceding match. So the
post-match days (MD+1, MD+2) blend two cohorts doing deliberately different things:

- **Players who played** are in **recovery / regeneration** — low load is correct
  (full neuromuscular recovery takes ~48–72 h; Nédélec 2012).
- **Players who did not play (or played limited minutes)** do a **compensatory "top-up"
  session** to replace the match stimulus they missed — high load is correct. Non-starters
  otherwise accumulate markedly less weekly load and detrain over a congested block
  (Anderson 2016; Hills 2018; Stevens 2017).

Averaged together, MD+1 looks like a failed taper (e.g. **95% of match demand on IMA Decel**)
when in reality the starters are tapering and the non-starters are topping up. **One bar with
one desirable band cannot tell that story** — it violates the "answer *why*, not just *what*"
test in `docs/explainability-first.md`.

## Principle (the coaching logic)

On MD+1 and MD+2 the squad is **two populations**. Each deserves its own desirable band:

| Cohort | Who | What the session is for | Desirable band (reference) |
|---|---|---|---|
| **Recovery** | Played the preceding match (≈ a starter's minutes) | Regeneration; flush, mobility, low mechanical load | MD+1 **20–40%**, MD+2 **45–70%** |
| **Top-up** | DNP or limited minutes | Replace the missed match stimulus + maintain weekly load parity | MD+1 **80–110%**, MD+2 **85–110%** |

The Recovery bands are today's `MD_TARGET` values (they were designed for recovering players).
The Top-up bands target roughly a match-equivalent because that is the load the player did not
get on match day. Both are **references, not rules** (Martin-García 2018; Akenhead 2016) — the
coach tunes them. MD+3 and the MD-n build/taper days are **not** split: by then both cohorts
re-converge onto the same week, so the existing single series stands.

## Cohort classification

Data is already in the endpoint: `match_player_minutes(player_id, match_date, minutes_played,
is_dnp)` is fetched in the `GET`, and `mdDayLabel` already locates the **last match before**
each date. For an MD+1/MD+2 session, look up that player's minutes in that specific match.

```
RECOVERY_MIN_MINUTES = 60   // played a substantial share → recovery
TOPUP_MAX_MINUTES     = 30   // played little/none → needs a full top-up

cohort(playerId, precedingMatchDate):
  row = match_player_minutes[playerId | precedingMatchDate]
  if row is missing or row.is_dnp or row.minutes_played < TOPUP_MAX_MINUTES → "topup"
  if row.minutes_played >= RECOVERY_MIN_MINUTES                            → "recovery"
  else                                                                      → "partial"   // 30–59 min
```

`partial` (came on as a sub for a meaningful spell) is a real third state. **Default: fold
`partial` into `recovery`** but scale its top-up expectation by the minutes shortfall later;
keep the enum so a third band can be surfaced without another migration. The thresholds are
tunable constants, not magic numbers — expose them near `MD_TARGET`.

> Implementation note: `mdDayLabel` currently returns only the label string. Either (a) return
> the resolved `lastMatch` date alongside the label, or (b) add a sibling helper
> `precedingMatch(date, matchesAsc)` so the microcycle loop can classify the session without
> re-scanning. Prefer (a) to avoid a double pass.

## Aggregation change (`route.ts` microcycle block)

For labels `MD+1` and `MD+2`, bucket by cohort; for every other label keep the single squad
series unchanged.

```
key = (label in {MD+1, MD+2}) ? `${label}|${cohort}` : label
```

Emit, per MD-day:

```
{ md_day: "MD+1",
  cohorts: {
    recovery: { sessions, metrics: { ima_decel: 31, ... } },
    topup:    { sessions, metrics: { ima_decel: 96, ... } }
  } }
```

Non-split days keep `{ md_day, sessions, metrics }` as today (or `cohorts: { all: ... }` for a
uniform shape — pick one and keep the client simple).

## UI (`page.tsx`) — explainability-first

- **MD+1 / MD+2 rows render two paired bars**, each against its own desirable band:
  `Recovery (played)` and `Top-up (rested)`. Other rows render exactly as today.
- **One plain-language verdict per split day**, no jargon in the headline, e.g.:
  *"MD+1 — starters recovering (31%), non-starters topped up (96%). Both on plan."*
- The sport-science term ("compensatory / top-up training") and the citations live in the
  **tooltip**, never the headline.
- **Confidence:** show each cohort's session count; flag a cohort with few sessions as low
  confidence (don't draw a confident bar from 3 sessions). Never fake a cohort that has no data.
- **Empty cohort:** if everyone played (no top-up group that week-type), show only the Recovery
  bar and say so — don't invent a top-up bar at 0%.

## Why it stays a development/planning signal

This only changes the **microcycle planning view**. It does not touch the canonical readiness
colour (`v_coach_readiness_today_v8.final_color`) and does not feed any verdict. It is a clearer
read of *how the week was loaded*, split by who needed what — rules decide the cohorts and the
bands; no AI in the decision (CLAUDE.md, manifesto #1).

## Five-question check (manifesto)

1. **Provenance?** Yes — bands cited; cohort derived from `match_player_minutes`.
2. **Readable in 5 s by a non-S&C coach?** Yes — "starters recovering, non-starters topped up."
3. **Answers *why*?** Yes — that is the entire point of the split.
4. **Recommendation overridable?** Yes — bands are tunable references, shown as such.
5. **AI labelled / cites real data?** N/A — no AI; deterministic from minutes + fixed bands.

## Open questions / follow-ups

- Tune the Top-up bands per metric? (Decel top-ups in tight spaces naturally run hot — a flat
  80–110% may read "above" for decel and "on" for running. Consider per-metric top-up bands,
  mirroring how the board already treats `max` vs `per90`.)
- Should `partial` get its own band scaled by `(90 − minutes)/90`? Defer until the two-cohort
  split is shipped and validated against a known week.
- Validation: pick one fixture week with a clear starter/sub split, confirm the Recovery bar
  lands in 20–40% and the Top-up bar in 80–110% on IMA Decel before rolling out.

## References

- Anderson L. et al. (2016) — physical loading and weekly load disparity between starters and
  non-starters in professional soccer.
- Hills S.P. et al. (2018) — physiological responses of substitutes; rationale for supplementary
  ("top-up") conditioning.
- Stevens T.G.A. et al. (2017) — match running output by playing status.
- Nédélec M. et al. (2012) — recovery kinetics after a football match (48–72 h).
- Martin-García A. et al. (2018); Akenhead R. (2016) — microcycle periodization shape (reference,
  not rule).
