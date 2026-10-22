# Claude Code task — make the week model sport-aware (basketball: game-count weeks)

Paste to Claude Code (or `@docs/tasks/basketball-game-density-week-model-claude-code-brief.md`).

## Why

MicroPulse's week model is football's match-day microcycle: MD-3, MD-1, MD+1, tagged per day and
used everywhere from `week-setup` to the readiness verdict. Basketball has no such structure. A
basketball week is defined by **how many games fall in it** (0–3), and the load pattern is
counter-intuitive enough that reusing the football model would give actively wrong expectations.

We already have most of the scaffolding and none of the wiring:

- `src/lib/micropulse/sportProfiles.ts` declares a complete basketball profile — `SportId =
  "football" | "basketball"`, `environment: "indoor"`, `BASKETBALL_METRICS`, per-sport
  `checkInWeights`, `hasSsgCalculator: false`. It is imported by **exactly one file**
  (`src/app/sports/page.tsx`). It never reaches the engine.
- `WeekType` is declared **twice, inconsistently**, as a local type in two components, and neither
  supports a three-game week.

This task wires sport into the week model and adds game-density weeks. It is deliberately scoped to
that. It must not change behaviour for football teams.

## What the research says

From PubMed. Each number below should end up in a citation string next to the rule it justifies —
per the explainability manifesto, every signal carries its source.

- **Salazar et al. 2020** — EuroLeague/ACB, 27 elite players, two seasons. External load ranks
  **W3 > W0 > W2 > W1**; the highest *internal* response was in weeks with **no game at all**.
  Inter-week variability moderate-to-high. [10.3390/ijerph17082812](https://doi.org/10.3390/ijerph17082812)
- **Conte et al. 2018** — NCAA D1 men. **One-game weeks carried higher total weekly load than
  two-game weeks.** Starters accumulated more than bench players; bench players may need topping
  up, especially in two-game weeks. Week-to-week spikes up to 226%.
  [10.1123/ijspp.2017-0689](https://doi.org/10.1123/ijspp.2017-0689)
- **Power et al. 2024** — semi-professional women. In congested weeks training is **tapered**
  (session 1 > session 2); the **third game** of a three-game week is markedly the heaviest single
  event. [10.1123/ijspp.2023-0448](https://doi.org/10.1123/ijspp.2023-0448)
- **Paulauskas et al. 2019** — elite women, 24 weeks. Chronic workload moved **≤10% per week** in a
  well-run team; the spikes lived in acute load, not chronic.
  [10.1123/ijspp.2018-0741](https://doi.org/10.1123/ijspp.2018-0741)
- **Sansone et al. 2020** — weekly ACWR vs perceived recovery at the **start of the following
  week**: r = −0.86. [10.1519/JSC.0000000000002971](https://doi.org/10.1519/JSC.0000000000002971)
- **Tuttle et al. 2024** — systematic review, 86 studies. Microsensor work consistently uses
  **>3.5 m·s⁻²** for accelerations, decelerations and changes of direction, and **>40 cm** for
  jumps. [10.1007/s40279-024-02058-5](https://doi.org/10.1007/s40279-024-02058-5)

## Where (all paths verified 2026-07-21)

| Thing | Location | State |
|---|---|---|
| Sport profiles | `src/lib/micropulse/sportProfiles.ts` | Complete; imported only by `src/app/sports/page.tsx` |
| WeekType (A) | `src/app/coach/CoachClient.tsx:6` | `"ONE_MATCH" \| "TWO_MATCHES"` |
| WeekType (B) | `src/app/coach/week-setup/page.tsx:20` | `"NO_MATCH" \| "ONE_MATCH" \| "TWO_MATCHES"` |
| Week type storage | table `coach_week_setup` | columns `week_start_date`, `week_type` (text), `matches` |
| Per-day plan | table `week_plans` | `day_type`, `day_intent`, `planned_load` — **not** where week_type lives |
| Monotony / strain | `src/lib/micropulse/foster/index.ts` | `computeFosterMetrics`, `fosterStatus` — already built, reuse it |
| Sport on a player | `players.sport` (text) | Populated inconsistently — check before relying on it |

## Change

**1. Shared week-type module.** Create `src/lib/micropulse/weekSetup/weekType.ts` exporting
`WeekType = "NO_MATCH" | "ONE_MATCH" | "TWO_MATCHES" | "THREE_MATCHES"` plus `gameCount(weekType)`.
Replace both local declarations with imports from it. Before adding `THREE_MATCHES`, verify
`coach_week_setup.week_type` has no CHECK constraint or enum — it reads as plain text, but confirm.
If a constraint exists, write a migration **and** save it as a timestamped `.sql` under
`supabase/migrations/` (CLAUDE.md).

**2. Sport resolution.** Add a small helper that resolves a team's sport (default `"football"` when
unknown) and returns its `SportProfile`. Do not assume `players.sport` is reliable — prefer a
team-level source, and fall back to football rather than guessing.

**3. New pure engine** — `src/lib/micropulse/weekSetup/gameDensity.ts`:

- `expectedWeekShape(sport, weekType)` → for basketball, the expected relative ordering of external
  load (W3 > W0 > W2 > W1) and the warning that internal load peaks in no-game weeks. Returns
  bilingual plain-language strings plus a `citation` field. For football, return `null` — the
  MD-day model stays authoritative and this function must be a no-op.
- `flagWeekAnomaly({ sport, weekType, weeklyLoads })` → flags when the observed week departs from the
  expected shape, and separately when **chronic** load has moved more than ~10% week-on-week
  (Paulauskas). Chronic drift is the signal worth surfacing; acute spikes are normal in basketball.
- `benchTopUpCandidates({ weekType, minutesByPlayer })` → in two-game weeks, identify players whose
  game minutes leave them materially under the squad's load (Conte). Return candidates and a reason
  string; **do not** prescribe a session — the existing compensation logic in
  `src/lib/micropulse/plannedSessionLoad.ts` owns that.

Everything in this module must be pure and side-effect free so it is unit-testable.

**4. Tests** — `src/lib/micropulse/__tests__/gameDensity.test.ts`. Cover: football returns null for
every input; basketball week ordering; the no-game-week internal-load warning; chronic drift at
9% / 10% / 11%; empty and single-player inputs; and that every returned string exists in both EN
and IS.

**5. Surface — minimal.** One line in the existing week-setup preview stating the expected shape for
the chosen week type, and one caveat line on Load Intelligence for basketball teams. **Do not build
a new page.** Follow the layered read: verdict sentence first, the "why" as plain text, the numbers
and the citation behind the existing details toggle.

## Acceptance

- A football team's dashboard, week setup and verdicts are byte-identical before and after. This is
  the hard requirement — verify it, don't assume it.
- A basketball team with `THREE_MATCHES` shows the expected-shape line and the tapering note.
- `npx eslint` clean on every touched file (existing errors in legacy files are pre-existing tech
  debt — don't fix them here, but don't add to them).
- `npm test` passes, including the new tests.
- Any DB change has a matching timestamped file in `supabase/migrations/`.
- Stage specific files only — never `git add -A`.

## Do NOT

- **Do not implement the ACWR 1.0–1.5 "sweet spot" as a rule or threshold.** Weiss et al. 2017 found
  the pattern (36% injured at 1.0–1.49 vs 54–59% outside it) but state that all mean differences
  were **"unclear"**. Surfacing it as a guardrail would oversell the evidence and break the
  manifesto's provenance rule. If it appears at all, it appears as context with that caveat.
  [10.1123/ijspp.2016-0726](https://doi.org/10.1123/ijspp.2016-0726)
- **Do not add normative benchmarks for women's basketball.** Power et al. 2022 tried to pool 32
  studies and could not combine anything except blood lactate, because the methods are too
  inconsistent. There are no reliable reference values to compare a squad against — which is
  precisely why the personal-norm approach is the only defensible one here.
  [10.1186/s40798-022-00498-9](https://doi.org/10.1186/s40798-022-00498-9)
- **Do not add hormonal monitoring.** Kamarauskas et al. 2021 found testosterone fell across a
  four-week congested block but found **no significant relationship** between hormonal change and
  change in load or wellness. [10.1123/ijspp.2021-0106](https://doi.org/10.1123/ijspp.2021-0106)
- Do not touch the football MD-day tagging, the readiness trigger, or `v_coach_readiness_today_v8`.
- Do not migrate `sportProfiles.ts` consumers beyond what this task needs. Wiring it in everywhere
  is a separate, larger task.

## Notes

Basketball is played entirely indoors, so GPS velocity bands are meaningless — which means
**Indoor Load Intelligence is already the correct architecture for this sport**, and is the most
valuable thing we own going into it. It currently depends on Football Movement Profile, which is
football-specific. Adapting it to PlayerLoad + IMA + jump counts using the Tuttle thresholds is the
obvious follow-up task, but it is out of scope here and needs a basketball club with data first.
