# RPE vs MD-day (× match minutes) expectation flag + Decision Summary yesterday-RPE

Goal: flag when a session's sRPE lands outside the intensity expected for that MD-day — conditioned on
how much the player actually played — and surface yesterday's RPE + that verdict on the Decision
Summary. A planning-feedback signal ("did the intensity land where you intended?"), descriptive only,
never the readiness colour.

## What already exists (grounded — reuse, don't rebuild)
- **MD-day is modelled.** `src/lib/micropulse/loadPlan/forTeam.ts`: `MD_OF` (FORCE→MD-4,
  NEURAL_VELOCITY→MD-3, VELOCITY→MD-2, ACTIVATION→MD-1), `intentToMd()`, and the view
  `v_training_day_context.md_day` (from Week-setup). So each day resolves to an MD-tag.
- **sRPE is stored** — `session_rpe_entries` (rpe, session_load, duration), `src/lib/session-rpe/compliance.ts`.
- **Match minutes exist** — the `/coach/match-minutes` entry page; `DecisionSummaryCard` already carries
  `_yesterday_match_minutes` + `_yesterday_match_date`.
- **Decision Summary already shows yesterday's load** — `_yesterday_load`, `_yesterday_mli`,
  `_yesterday_metabolic_score` fields on `DecisionSummaryCard`. Adding `_yesterday_rpe` is a small
  extension in the same pattern.
- The code already anchors "your usual MD-4" per player (`forTeam.ts` ~line 103) — the personalised
  variant can reuse this.

## The model: MD-day × match-participation grid (coach-tunable)
Expected sRPE (0–10 CR10) per day, split by how much the player played the last match. Ship as
**default constants that the coach can override** (like `ROLE_DEMAND_FIT` — code data, no new verdict,
tunable). Do NOT hard-code MD-3 as the peak; the weekly shape differs per club.

| Day | Played ≥60 min | Played <30 min / DNP |
|---|---|---|
| MD (match) | 8–10 | — |
| MD+1 | recovery 1–3 | **top-up 6–8** |
| MD+2 | light / re-load 4–6 | **top-up 6–8** |
| MD-4 | 6–8 | 6–8 |
| MD-3 | 6–8 (coach sets the peak) | 6–8 |
| MD-2 | 5–7 | 5–7 |
| MD-1 | taper 2–4 | 2–4 |

- **Three minutes buckets** (make the cutoffs coach-tunable): `full ≥60`, `partial 30–59`,
  `minimal <30 / DNP`. Partial can interpolate (e.g. MD+1 partial = 4–6) or default to the nearer band.
- The **top-up rows are the point**: a non-player on MD+1/MD+2 who logs a low RPE **missed their
  compensatory session** — a real load gap for bench players (deconditioning / return-injury risk).
- Optional personalised variant: compare to the player's own usual sRPE for that MD-tag (reuse the
  existing "your usual MD-4" anchor) instead of / alongside the coach band. Confidence-gated on n.

## The engine — `src/lib/micropulse/rpeExpectation/`
Pure, IO-free:
- Input: `{ mdDay, matchMinutes, actualRpe, bands (coach or default), playerNorm? }`.
- Resolve minutes bucket → expected band for the MD-day → compare `actualRpe`:
  - `within` (inside band), `under` (below low), `over` (above high). For top-up rows, `under` on a
    non-player is the high-value flag ("missed top-up").
- Output: `{ mdDay, bucket, expected: [lo,hi], actual, status, verdict: Bi, confidence }` with plain
  bilingual verdict (EN/IS) and the band it was judged against (provenance). No flag when RPE wasn't
  logged (compliance gate) or MD-day is unknown.

## Decision Summary — yesterday's RPE chip
- Add `_yesterday_rpe`, `_yesterday_md_day` (already have `_yesterday_match_minutes`) to the card's
  data, sourced from `session_rpe_entries` (yesterday) + `v_training_day_context` + match minutes.
- Render a chip beside the existing yesterday-load signals:
  - within → neutral/green: *"Í gær (MD-3): RPE 8 — innan væntinga"* / "Yesterday (MD-3): RPE 8 — as planned".
  - under/over → amber: *"Í gær MD+1, spilaði 12 mín → væntanlegt top-up 6–8; skráð 2 — top-up vantaði"*.
- English default, IS on toggle (`const [lang] = useLang(); isEN = lang !== "IS"`).

## Wiring / data
- MD-day: `v_training_day_context.md_day` (or `intentToMd` from Week-setup) for the session date.
- sRPE: `session_rpe_entries` for the player/date.
- Minutes: the same source feeding `_yesterday_match_minutes` (match-minutes entry).
- Bands: default constant map + a coach-editable override (team-scoped; mirror how `ROLE_DEMAND_FIT`
  is stored as tunable code data / a small settings row — no new verdict table).

## Guardrails (manifesto)
- **Descriptive / planning-feedback only** — never touches `readiness_entries.color` /
  `v_coach_readiness_today_v8.final_color`, never a training decision by itself.
- RPE is subjective and fitness/role-dependent — frame as "landed vs planned intensity", not a verdict;
  coach bands are the source of truth, engine explains.
- Confidence + provenance: show which band (coach vs default), which minutes bucket, whether RPE was
  logged. No RPE → "not logged", not a false green.
- Coach-tunable bands + minutes cutoffs; don't hard-code the weekly peak.

## Verification
- Unit-test the grid resolution (each MD-day × bucket → band; boundary minutes 29/30/59/60; missing
  RPE → no flag; unknown MD-day → no flag).
- Squad check: the top-up `under` flag should fire on real non-players who skipped compensatory work,
  not on rested starters.
- `npx eslint` touched files; confirm no readiness-colour writes in the diff.

Ref: `loadPlan/forTeam.ts` (`MD_OF`, `intentToMd`, `v_training_day_context`), `session_rpe_entries`,
`session-rpe/compliance.ts`, `DecisionSummaryCard.tsx` (`_yesterday_*`), `ROLE_DEMAND_FIT` (tunable
code-data pattern), CLAUDE.md (canonical colour — do not touch).
