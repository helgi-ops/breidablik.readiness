# Claude Code brief — add Wyscout **Passing** and **Attacking** presets to Team Match Insight

## Goal & rationale

Team Match Insight today ingests three Wyscout Team → Stats presets: **General**
(goals, xG, shots, possession, duels, losses/recoveries), **Defending**
(defensive-duels won %) and **Indexes** (PPDA + style indices). The attacking read
is therefore mostly *volume/quality* (xG, shots, possession) with no picture of
**how** the team attacks. Add the two remaining presets:

- **Passing** — how the team builds up and breaks lines (forward passes, passes to
  the final third and into the box, progressive passes, crosses, line-breaking
  "smart passes"), each with accuracy.
- **Attacking** — box presence and attack types (touches in box, positional
  attacks, counterattacks, set-piece attacks, offensive duels won %).

The ingestion is already **preset-agnostic** (it auto-detects which uploaded file
supplies which role), and both new presets are per-match with the opponent
included, so they drop straight into the existing **Wins vs losses — match stats**
and **What tracks the result?** panels with no new UI architecture. This is
mostly parser + a small schema addition + wiring, not a redesign.

Descriptive football context only — like the rest of Team Match Insight it must
never touch the readiness colour, the daily decision, or the training
recommendation.

## Data model (migration)

Add to `team_match_stats` (keep the existing unique key
`team_id, match_date, is_opponent` and the idempotent upsert — do not change it):

- Two JSONB blobs that keep the **entire** Passing / Attacking row verbatim
  (keyed by the exact Wyscout header, same spirit as the General `raw` column) so
  nothing is lost and future metrics need no migration:
  - `passing jsonb`
  - `attacking jsonb`
- A **small** set of promoted numeric columns — only the coach-relevant ones the
  panels compare on (keep the list short; everything else stays in the blobs):
  - Passing: `forward_passes numeric`, `forward_pass_acc_pct numeric`,
    `passes_final_third numeric`, `passes_final_third_acc_pct numeric`,
    `passes_penalty_area numeric`, `passes_penalty_area_acc_pct numeric`,
    `progressive_passes numeric`, `crosses numeric`, `cross_acc_pct numeric`,
    `smart_passes numeric`, `smart_pass_acc_pct numeric`
  - Attacking: `touches_in_box numeric`, `positional_attacks numeric`,
    `counterattacks numeric`, `offensive_duels_won_pct numeric`

All nullable (a coach may upload only General). Save the migration as a timestamped
file under `supabase/migrations/` **and** apply it (per repo convention that any
`apply_migration` change is also committed as `.sql`). Suggested name:
`<ts>_team_match_stats_passing_attacking.sql`.

## Parser (src/lib/micropulse/statsIngestion)

**wyscoutAuxStats.ts** — today `parseWyscoutAuxColumn` pulls ONE column. Passing and
Attacking need SEVERAL columns each, so add a multi-column reader (or a small new
module `wyscoutAttackStats.ts`) that, per data row keyed by `(matchDate,
isOpponent)`, returns:
- the promoted metrics above, and
- a `raw` record of every non-empty cell keyed by its exact header (reuse the
  General parser's blank-header sub-column handling — Wyscout carries accuracy in a
  packed `"163 / 113"` cell OR in the next column under a blank header).

Reuse the existing coercers from `wyscoutTeamStats.ts`: `normTeam`, `normHeader`,
`num`, `toDateStr`, and the own/opponent attribution via `normTeam(team) ===
inferOwnTeamName(matrix)`. Two helpers there are currently module-private and will
be needed — **export `pairAt` and the raw-cell loop** (or factor them into a shared
`cells.ts`) so Passing/Attacking parse packed pairs and blank-header sub-columns
identically to General. Match headers by **normalised substring**, never exact
spelling (locale/version tolerant), e.g.:
- forward passes → `h.includes("forward pass")`
- passes to final third → `h.includes("final third")`
- passes to penalty area → `h.includes("penalty area") && h.includes("pass")`
- progressive passes → `h.includes("progressive")`
- crosses → `h.includes("cross")`
- smart passes → `h.includes("smart")`
- touches in box → `h.includes("touches in") && h.includes("box")` (or "penalty area")
- positional attacks → `h.includes("positional")`
- counterattacks → `h.includes("counter")`
- offensive duels → `h.includes("offensive dual") || h.includes("offensive duel")`

**buildTeamMatchRows.ts**
- `selectWyscoutMatrices`: add `passing` and `attacking` roles. Detect:
  - passing = first matrix whose headers include a passing-only column (e.g.
    "forward passes" or "passes to final third") but is NOT the General export.
  - attacking = first matrix with "positional attacks" / "touches in penalty area"
    / "offensive duels".
  Guard against picking General/Defending/Indexes by requiring a passing/attacking-
  only header (General also has a generic "passes / accurate" column, so match the
  *specific* columns above, not just "pass").
- `buildTeamMatchStatRows`: accept `passingMatrix?` / `attackingMatrix?`, merge them
  into `dbRows` on `keyOf(date, isOpp)` exactly like `ppda`/`defDuels` do today —
  writing the promoted columns + the `passing` / `attacking` jsonb. Extend the
  returned `aux` summary with `passingProvided/matched` and
  `attackingProvided/matched`, and add `passingHits` / `attackingHits` +
  orphan-date lists (mirror the PPDA/def-duels pattern).

## Upload route (src/app/api/coach/team-match-stats/upload/route.ts)

The multi-file picker already accepts any number of files via `form.getAll("files")`.
- Pass the new roles from `selectWyscoutMatrices` into `buildTeamMatchStatRows`.
- Extend the preview `summary` with passing/attacking coverage (provided/matched/
  hits/orphans), mirroring the `ppda` / `defDuels` blocks.
- Update the "General is required / recognised" messaging to also recognise
  "Passing" and "Attacking" as optional add-ons.
- Do **not** change the upsert or the team-name inference (already fixed).

## API route (src/app/api/coach/match-insights/route.ts)

- Add the promoted fields to the `OwnStat` type + the `team_match_stats` select
  (own rows). Add the opponent equivalents where a wins-vs-losses "against" version
  is meaningful (e.g. crosses conceded is low value — keep the opponent set minimal;
  passes-to-final-third-against and touches-in-box-against are the useful ones).
- Add new keys to `WL_STAT_KEYS` for the wins-vs-losses stat panel — a **short**,
  high-signal set, e.g.: `smartPasses`, `passesFinalThird`, `crossAccPct`,
  `touchesInBox`, `offensiveDuelsWonPct`. (Volume + one or two accuracies; don't
  dump all 15.)
- Include the promoted fields in `perMatchStats` (the match-by-match table payload).
- Define a per-metric **"higher is better"** direction so the effect-size chip
  labels read correctly (all of the above are higher = better for the attacking
  team; none need the PPDA-style inversion).

## Coach UI (src/app/coach/match-insights/page.tsx)

- Add bilingual `STAT_LABELS` for each new key (plain language, e.g. EN "Line-breaking
  passes" / IS "Línubrjótandi sendingar"; EN "Passes to final third" / IS "Sendingar
  á lokaþriðjung"; EN "Touches in box" / IS "Snertingar í teig"; EN "Offensive duels
  won %" / IS "Sóknarnávígi unnin %"; EN "Cross accuracy %" / IS "Fyrirgjafa-nákvæmni %").
- Add `EXPLAINERS` entries so each has a "how to read this" line.
- The **Wins vs losses — match stats** panel already selects the top movers by
  |effect size| and always keeps a core set, and the **match-by-match** table is
  behind a `<details>` toggle — the new metrics flow in automatically. Keep the
  primary view uncluttered: new metrics appear only when they are top movers, plus
  in the details table. No new panel required.
- Keep explainability-first: jargon (smart passes, offensive duels) lives behind
  tooltips/"Show details", never in the one-line verdict.

## Import panel copy (src/components/coach/TeamStatsImportPanel.tsx)

- Add detection labels to the `T` map: `dPassing` ("Passing" / "Sendingar"),
  `dAttacking` ("Attacking" / "Sókn"), and show them in the "Detected" chips.
- Extend `pickHint` to mention Passing and Attacking as optional extras alongside
  Indexes/Defending.

## Tests

- Add unit tests mirroring `__tests__/wyscoutAuxStats.test.ts` and
  `__tests__/buildTeamMatchRows.test.ts`:
  - Passing/Attacking matrices parse the promoted columns + `raw`, attribute
    own/opponent correctly (via `inferOwnTeamName`), and skip the AVERAGE block.
  - `selectWyscoutMatrices` picks passing/attacking without misfiring on
    General/Defending/Indexes.
  - `buildTeamMatchStatRows` merges passing/attacking onto the right
    `(date, is_opponent)` rows and reports coverage.
  - Packed `"163 / 113"` and blank-header accuracy sub-columns both yield the
    accuracy value.

## Definition of done

1. Migration written, applied, and committed as `.sql` under `supabase/migrations/`.
2. A coach can drop General + Passing + Attacking (in any order, plus Indexes/
   Defending) into the Import panel; Preview reports passing/attacking coverage;
   Import upserts idempotently (re-import updates, never duplicates).
3. At least one passing metric and one attacking metric can surface in
   **Wins vs losses — match stats**, and all promoted metrics appear in the
   match-by-match details table, in EN and IS.
4. `npx eslint` clean on every changed file; typecheck passes; new unit tests pass.
5. Explainability preserved: nothing new leaks into the one-line verdict; jargon is
   behind tooltips/"Show details".

## Out of scope

- Player-level passing/attacking (that is Player Statistics / the Wyscout Data API,
  not the team export).
- Any change to GPS/IMA ingestion, the readiness colour, or the daily decision.
- The Attacking preset's shot-location breakdowns beyond `touches_in_box` (kept in
  the `attacking` jsonb for later, not promoted now).
