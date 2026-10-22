# Code brief — Basketball "Win Factors" (hvað vinnur leiki) in MicroPulse

Turn the one-off Bónus deild karla analysis into a **live, explainable surface** in the system: a
league-level "what wins games here" model + a per-opponent "win these factors to beat them" read, sourced
from the FIBA LiveStats games already ingestible via `basketball_fiba_games`.

Grounded in a verified run: **all 132 regular-season 2025-26 Bónus deild karla games** (FIBA gameids
`2667405–2667536`, a contiguous block), team-win counts reconciled 100% against the kki.is final standings.

## Why this is mostly plumbing that already exists

- Ingestion is **built**: `fibaLiveStats.ts` (`parseFibaGame`) → `basketball_fiba_games` (own/opp
  `tot_s*` totals + box + pbp) + `basketball_shots`, source `'fibalivestats'`, via `/api/coach/basketball-fiba`.
- So the raw per-game team box (both teams) needed for win-factors is **already the shape we store**.
- New work = (1) load the full league, (2) a derived win-factors lib, (3) an explainability-first surface.

## Unblocks the "game-ID resolver" for completed seasons

The ingestion brief lists fixture→gameid enumeration as blocked (no public schedule JSON). For a **finished
season** there's a simple, verified path: FIBA assigns a **contiguous gameid block per competition-season**.
Men's 2025-26 = `2667405–2667536` (132 ids, zero gaps; block boundaries confirmed — ids just below/above are
empty or other competitions). Recipe: from one known gameid (get it off a karfan.is / kki.is match report's
FIBA "Tölfræði leikja" link), walk outward until you hit ~8 consecutive non-league/empty ids each way.
**Action:** add a "batch-ingest by id range" admin action (start id + end id, or start id + auto-walk) that
loops the existing fetcher/parser. Store the resolved block per `(competition_code, season)` so re-runs are
one call. Idempotent on `source + gameid`.

## 1. Data layer — load the league

- Run the existing batch ingest over `2667405–2667536` (org `KKI`) → 132 games in `basketball_fiba_games`.
- Ground-truth CSV to validate against: `greining/fiba-mens-games.csv` (264 team-rows) and the reconciled
  standings (Grindavík 18-4 … ÍA 4-18). After load, a per-team win count MUST equal the standings.

## 2. Derived lib — `winFactors.ts`

Pure function over the league's `basketball_fiba_games` rows (one league-season in, ranked factors out).
Read from `basketball_fiba_games` directly for now — do NOT wait on the shared-season-table de-dup refactor.

**Per team-game, compute the Four Factors + core box rates** (both offensive and the opponent's = defense):

- `eFG% = (FGM + 0.5·3PM) / FGA`
- `TOV% = TOV / (FGA + 0.44·FTA + TOV)`
- `OREB% = OREB / (OREB + oppDREB)`
- `FT rate = FTM / FGA`
- defensive mirrors from the opponent row: `oppEFG%`, forced `TOV`, etc.
- plus raw per-game: assists, steals, blocks, points, points allowed.

**Two outputs:**

a) **Game-level** point-biserial `r` of each factor with the win flag (n = 2·games). Also the headline
   **eFG% differential** (own − opp).
b) **Team-level** Pearson `r` of each team's season average with its **win%** (n = teams), including
   **defense** (points allowed, oppEFG%) and **net rating** (pts − opp pts).

**Expected values for validation** (must reproduce within rounding on the 132-game load):

| Level | Top factors (r) |
|---|---|
| Game (n=264) | eFG% diff **0.66**; own eFG% **+0.47**; opp eFG% **−0.47**; 3P% **0.43**; assists **0.42** |
| Team (n=12) | net rating **0.88**; points allowed **−0.79**; assists **0.78**; opp eFG% **−0.75**; TOV% **−0.66** |

If these don't match, the load or the factor math is wrong — treat as a failing test.

**Confidence:** every ranked list carries n + a note (team-level n=12 is small → |r|≥0.58 ≈ p<.05; game-level
n=264 → |r|≳0.12). This is the manifesto's confidence requirement, not decoration.

## 3. Coach surface — explainability-first

A "How this league is won" card (head-coach surface; S&C-depth behind a toggle), following the layered read:

- **(0) Verdict, one sentence, boldest:** e.g. *"This league is won on defense + ball movement."* Derived
  from the top team-level factors, in plain language (no "eFG%", no "point-biserial" in the primary view).
- **(1) 2–3 plain supporting facts, no click:** *"Winners give up the fewest points (r −0.79) and share the
  ball (assists r +0.78); shooting % matters less over a season."* Named exceptions welcome (e.g. Grindavík:
  best record on the best defense despite modest offense).
- **(2) Behind "Sýna details":** the full ranked correlation tables (game + team level), the net-rating
  table, and the jargon (eFG%, TOV%, four factors) with tooltips + paper citation (Oliver 2004, Four Factors).

**Per-opponent tie-in (reuse the Game-Plan Fit spec):** on an opponent scout, surface *"To beat {opp}, win
these factors"* = the league's top win-factors filtered to where the opponent is weak/strong (from their own
`basketball_fiba_games` profile vs league average). The league win-factor weights become the weighting layer
that `docs/tasks/game-plan-fit-spec.md` referenced. Advisory only.

**Language:** English default, Icelandic toggle; both coach-readable, jargon behind tooltips (see CLAUDE.md).

## Guardrails (manifesto)

- Descriptive scouting/analytics only — **never touches the readiness colour or the daily decision**.
- Provenance on every number: `source='fibalivestats'`, competition/season, gameid range, computed-at.
- AI (if any narrative) labels itself as AI and cites the underlying `r` values + n; **rules decide, AI explains**.
- Read from `basketball_fiba_games` (don't block on the shared-season-table de-dup; don't double-count).
- Playoffs excluded by default (different id block) — label the sample as regular-season; make stage a filter.

## Verification (ship gate)

1. Post-load, per-team win counts == kki.is standings (all 12 teams, 22 GP). Automated test.
2. `winFactors.ts` reproduces the expected r-table above (unit test with the 132-game fixture / the CSV).
3. Coach can read the verdict + the plain "why" (2–3 facts) **without** opening details (manifesto Q2).
4. Confidence (n) renders next to every ranked list.
5. `npx eslint` clean on new files; migration (if any new table/view) saved under `supabase/migrations/`.

## Reference artifacts (this session)

- `greining/fiba-mens-games.csv` — 132-game team box (validation fixture).
- `greining/bonus-deild-karla-2025-26-hvad-vinnur-leiki.html` — the coach-facing findings (design reference).
- `greining/bonus-deild-karla-2025-26-teamstats.csv` — kki.is team season averages (offense-only, cross-check).
- Companion: `docs/tasks/fiba-livestats-ingestion-brief.md` (ingestion, shipped), `docs/tasks/game-plan-fit-spec.md`.
