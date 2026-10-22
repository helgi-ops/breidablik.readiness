# Claude Code task — Heart Rate Intelligence v2: HRex / HRR / %HRres + SWC gating + conditioning-dose verification

Paste to Claude Code (or `@docs/tasks/heart-rate-intelligence-v2-claude-code-brief.md`).

## Status — this EXTENDS a page that already exists

`src/app/coach/heart-rate-intelligence/page.tsx` is live and good: the Edwards-1993 summated-HR-zone
TRIMP cross-check of HR load vs sRPE, read on each player's **own norm** (index, 100 = his average),
with hidden-load / low-cardiac-demand alignment, the 8-band intensity split, %HRmax with HRmax
provenance + a per-player setter, confidence gating, counterfactuals, and honest caveats. Shared
loader `lib/micropulse/hrLoad/` (so the card and the page can never disagree). **Do not rebuild any of
that.**

The page itself already names what's **out of scope in v1** (bottom "Method & caveats"): *HRex /
submaximal fitness trend, calibrated time-in-%HRmax-zone, and %HRres*. This task adds exactly those —
now that the research base supports doing them **properly and honestly**.

## The evidence base (9 papers, all read — cite these in the caveats/methodology, they anchor each add)

| What it justifies | Paper | The number/point to use |
|---|---|---|
| The whole approach + **the SWC gates** | **Buchheit 2014**, *Monitoring training status with HR measures: do all roads lead to Rome?* (Front Physiol) | **Table 1**: typical error (CV) + signal-to-noise + SWC per measure — see the SWC table below. Also the thesis: no single HR measure is definitive → combine HR + wellness + CMJ. |
| HRex is the best marker | Buchheit 2014 (Table 1) | **HRex: CV ~3%, signal-to-noise 1.6 (best), SWC ~1%** → prioritise HRex. |
| The framework / how to build (HRex, HRR, HRrest, rolling avgs, contextualize) | **Schneider et al. 2018**, *Contextualizing HR Measures* (Front Physiol) | Multivariate + own-norm + training-context; SWC bands illustrated (their Fig 2). |
| Soccer-specific: HR = aerobic internal load; **%HRres > %HRmax** for comparison | **Dellal et al. 2012**, *HR Monitoring in Soccer: Interest and Limits* (JSCR) | %HRres = (HRex − HRrest)/(HRmax − HRrest); position differences; limits (aerobic only, weak for overtraining). |
| **sRPE is validated against HR-TRIMP** (the science behind the existing cross-check) | **Impellizzeri et al. 2004**, *Use of RPE-Based Training Load in Soccer* (MSSE) | sRPE vs Edwards/Banister/Lucia TRIMP, r = 0.50–0.85. Lower in soccer than endurance because HR misses the anaerobic contribution → **the HR–sRPE divergence is the anaerobic/psychological signal** (already the page's logic). |
| The definitive **limitations** (confounders for the honesty layer) | **Achten & Jeukendrup 2003**, *HR Monitoring: Applications and Limitations* (Sports Med) | Cardiovascular drift, hydration, temperature, altitude, day-to-day variability; HR-based VO2max error up to 20%; HR reflects only a limited set of aspects. |
| Conditioning **dose** = time in the red zone (T@VO2max) | **Buchheit & Laursen 2013**, *HIIT Programming Puzzle Part I (cardiopulmonary)* + **Part II** | T@VO2max (>90% VO2max) drives cardiac adaptation; the 9 HIIT levers. Use the HR-zone time you already capture to **verify** a conditioning session hit its aerobic target. |
| HR verifies/prescribes drill intensity; SSG = valid aerobic training | Impellizzeri 2006 (*Generic vs Specific Aerobic Training*), Impellizzeri 2005 (*Physiological assessment*) | SSG reach interval/match HR; HR training zones. |
| Fatigue degrades output (contextualization) | Rampinini et al. 2009 (*Technical performance … fatigue*) | Frames "HR is aerobic state, not performance". |

## What already exists in the data (verified)

- `player_external_load_daily`: `avg_heart_rate, max_heart_rate, min_heart_rate, hr_zone_1..8_time_s,
  pct_max_heart_rate, pct_avg_heart_rate` (migration `20260722120000`).
- `players.hr_max` (coach-set), plus observed-peak + age-estimate fallback logic already in the page.
- `session_rpe_entries` (`rpe`, `session_load`, `duration_minutes`) — the sRPE side.
- The shared read model `lib/micropulse/hrLoad/index.ts` (`HrLoadRead`, `DIVERGENCE_GAP`,
  `MIN_MATURE_HR_SESSIONS`) and `loadForTeam.ts` (`PlayerHrRead`).
- `lib/methodologyCaveats.ts` → `HR_CAVEAT` (extend it, don't fork it).

## The SWC gate — from Buchheit 2014 Table 1 (constants, auditable, at the top of the module)

Every new HR read must only flag a change that **exceeds both** the measure's typical error **and** its
smallest worthwhile change — the same CV-gate discipline as the CMJ phase work. Seed these as named
constants with the citation next to each:

```
HREX_SWC_PCT   = 1    // Buchheit 2014: HRex CV ~3%, SNR 1.6, SWC ~1% (the most reliable HR marker)
HRR_SWC_PCT    = 7    // Buchheit 2014: HRR SWC ~7%
HRREST_SWC_PCT = 2    // Buchheit 2014: resting HR SWC ~2%
HRV_SWC_PCT    = 3    // Buchheit 2014: resting vagal HRV (Ln rMSSD) SWC ~3%
```

A move smaller than the gate is `noise`, shown as context, never a flag. (Mirror the CMJ CV-gate: a
noisy metric needs a bigger move to mean anything.)

## The additions

**1. HRex — submaximal exercise HR (the headline fitness/readiness marker).**
The biggest add and the highest-value one (best SNR). HRex = the average HR over the last 30–60 s of a
**standardised submaximal effort** (fixed intensity/duration), read against the player's own rolling
baseline, SWC-gated at 1%. A falling HRex over weeks = improving aerobic fitness; a rising HRex at the
same fixed load = fatigue or detraining (Schneider 2018; Buchheit 2014).
- **Data need (the one real gap):** HRex requires a *standardised, repeated* submaximal effort — e.g. a
  fixed 3–5 min run in the warm-up. The club doesn't run one yet. So: (a) add a lightweight way to mark
  a session (or a segment) as "submax test — fixed load", capturing the mean HR of the window; and (b)
  compute HRex against the player's own last N submax tests with the 1% SWC gate. If a standardised
  window can be inferred from existing Catapult data (a recurring fixed-distance warm-up), prefer that;
  otherwise a manual "log HRex" entry (mean HR + note it was the standard warm-up) is acceptable for v2.
- **Honesty:** HRex is only interpretable at a **fixed external load** — say so; if the load isn't
  standardised, mark low confidence. No submax test → no HRex, never a fabricated value.

**2. HRR — heart-rate recovery.**
HR drop over 60 s after the submax effort (HRR60s), averaged over several seconds to cut error. A
recovery/autonomic marker, SWC-gated at 7%. Pairs with HRex on the same standard warm-up. Same
data-capture path as HRex (the window right after the submax effort).

**3. %HRres — reserve HR, for cross-player comparability.**
Add the Karvonen read alongside %HRmax: `%HRres = (HR − HRrest)/(HRmax − HRrest) × 100` (Dellal 2012),
using the player's `hr_max` and an HRrest (coach-set or min_heart_rate as a proxy, flagged). %HRres lets
you compare players despite different HRmax/HRrest — where %HRmax alone can't. Keep %HRmax too; show
%HRres as the "comparable across players" line. No HRmax/HRrest → no %HRres (no fabrication).

**4. Conditioning-dose verification (ties to the HIIT papers).**
You already capture `hr_zone_1..8_time_s`. Surface **time in the high bands (6–8) as a T@VO2max proxy**
for any session flagged/intended as conditioning — did the players actually spend enough time in the
red zone to drive an aerobic adaptation (Buchheit & Laursen 2013)? This closes the loop:
Pre-Session/Train-like-you-Play prescribes a locomotive/aerobic session → GPS runs it → **HR bands
verify it hit the aerobic target.** Ordinal-band honesty applies (bands aren't calibrated %HRmax cuts —
say so, same as today).

**5. (Keep, don't expand) the multivariate framing.**
Buchheit 2014's conclusion is that HR + wellness + a CMJ is the complete solution — MicroPulse already
has all three (check-ins, VALD CMJ, this cross-check). Add one line in the caveats noting HR is the
**aerobic/ANS** lens only, and points to readiness (wellness) and VALD (neuromuscular) for the rest.

## Honesty (same manifesto, non-negotiable)

- **HR = aerobic / ANS only**, never overall fatigue or performance (Dellal 2012; Achten & Jeukendrup
  2003; Buchheit 2014). State it.
- **SWC-gated**: sub-threshold moves are noise, shown as context, never flagged.
- **No-data ≠ zero**: no belt / no HRmax / no submax test → no-data, never 0 — as the page already does.
- **Confounders named** (Achten & Jeukendrup 2003): cardiovascular drift, hydration, heat, altitude,
  day-to-day variability — extend `HR_CAVEAT` with these.
- **Own-norm + confidence**: keep everything on the player's own baseline; thin data = low confidence,
  stated plainly (reuse `MIN_MATURE_HR_SESSIONS` / the existing confidence logic).
- Every new flag carries its **why + counterfactual + citation**, like the existing reads.

## Where (build layout)

- Extend the shared model `lib/micropulse/hrLoad/index.ts` with `hrex`, `hrr`, `pctHrReserve` reads +
  the SWC constants; pure, tested. Keep the loader (`loadForTeam.ts`) the single source so the card and
  page can't diverge.
- Surface HRex/HRR/%HRres and the conditioning-dose read on `heart-rate-intelligence/page.tsx`, behind
  the existing layered read (verdict → plain why → S&C detail / "Method & caveats").
- Submax-test capture: smallest viable path (a manual "log submax HRex/HRR" entry, or a session-segment
  flag) — any new column/table saved as a timestamped `.sql` under `supabase/migrations/` (CLAUDE.md).
- Bilingual EN/IS throughout, like the existing page.

## Acceptance

- HRex/HRR compute against the player's own baseline and only flag a change beyond the SWC gate
  (unit tests: a <1% HRex move does NOT flag; a >1% move does; thin baseline → low confidence /
  insufficient, never a scold).
- %HRres renders when HRmax + HRrest exist, and is absent (no-data) otherwise.
- Conditioning-dose read shows time-in-high-bands for a conditioning session, with ordinal-band caveat.
- The v1 cross-check (HR-vs-sRPE alignment) is unchanged — verify.
- `HR_CAVEAT` extended with the Achten & Jeukendrup confounders; the "out of scope v1" note updated to
  reflect what v2 now covers.
- `npx eslint` clean on touched files; `npm test` passes; stage specific files only.

## Do NOT

- Do not rebuild the existing cross-check or fork the shared loader.
- Do not present absolute HR AU as comparable to sRPE — index on own norm only (as today).
- Do not fabricate HRex/HRR/%HRres/%HRmax when the inputs (submax test, HRmax, HRrest, belt) are
  missing — no-data, never zero.
- Do not surface any new HR read without its SWC gate — a sub-threshold move is noise, not a flag.
- Do not claim HR detects fatigue/overtraining/performance — it's the aerobic/ANS lens only.
- Do not mix in WHOOP resting-HR/HRV here (separate stream); do not touch the readiness trigger,
  `v_coach_readiness_today_v8`, or the load pages.
