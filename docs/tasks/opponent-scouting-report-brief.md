# Claude Code brief — Pre-match **Opponent Scouting Report** (Wyscout → MicroPulse)

## Goal & rationale

Clubs own Wyscout but rarely turn it into a pre-match plan — exactly the gap
MicroPulse closes for GPS/IMA. Build a **plain-language opponent report** a
non-analyst coach can read in a minute before a match: *how the opponent plays,
where they hurt you, and how to hurt them* — grounded in the opponent's own
season data, benchmarked against the league and against **your** team.

This is a **v1 built entirely from the Wyscout Team → Stats Excel exports**
MicroPulse already ingests (General required; Indexes / Defending / Passing /
Attacking optional). No Wyscout Data API, no video, no event data — those are a
labelled v2. It reuses the parser and the team-name inference already in
`statsIngestion`, so the opponent's export parses the same way your own does.

Descriptive context only — like the rest of Team Match Insight it must never
touch the readiness colour, the daily decision, or the training recommendation.
Rules compute the facts; any AI layer only phrases them and is labelled as AI.

## The core idea (explainability-first)

Each section follows the manifesto's layered read:
- **(0) one-sentence verdict** — bold, first. e.g. *"They dominate the ball and
  press high; they concede from crosses and are weak from set pieces."*
- **(1) 2–3 plain facts** — the "why", with the key numbers, visible without a click.
- **(2) raw tables** behind a **"Show details"** toggle (xG, PPDA, passing splits…).

Every claim cites its signal. Every recommendation ("target the channels", "load
set-piece work") shows the number behind it and is coach-overridable.

## Data model

Scouting needs the **opponent's own full-season** profile, which today's
`team_match_stats` (your team + your opponents only) does not hold. Add a
lightweight store:

- `scout_team_season` (one row per scouted team per season):
  `id, owner_team_id, opponent_name, season, source_ref, created_at,` plus the
  aggregated per-match season metrics already produced by the parser
  (`xgf, xga, gf, ga, shots, shots_against, possession, ppda, def_duels_won_pct`,
  and, when the Passing/Attacking presets are provided, the promoted passing/
  attacking columns + `passing`/`attacking` jsonb — see the passing-attacking brief).
- `scout_team_match` (per-match rows for the scouted team, for form + variance):
  `scout_team_season_id, match_date, opponent, is_home, goals, goals_against, xg,
  xg_against, result`.
- Optional `scout_player` (from an Advanced Search player export, if uploaded):
  `scout_team_season_id, player_name, position, minutes, goals, xg, assists, xa,
  received_passes, ...` — for the "key players" section.

Keyed and RLS-scoped to `owner_team_id` (a club only sees its own scouting).
Save the migration as a timestamped `.sql` under `supabase/migrations/` and apply it.

## Ingestion (reuse what exists)

Add a **"Scout an opponent"** flow on the Match Insights page (or its own page):
pick/enter the opponent + season, drop in that opponent's Wyscout **Team → Stats**
export(s) — General required, Indexes/Defending/Passing/Attacking optional, plus
an optional Advanced Search **player** export.

- Parse with the existing `selectWyscoutMatrices` + `buildTeamMatchStatRows`
  (`src/lib/micropulse/statsIngestion/…`). Because `parseWyscoutTeamStats` now
  **infers the team from the file** (majority Team value), the opponent's export
  parses with no config. Aggregate the parsed per-match rows into one
  `scout_team_season` row (means for rates, sums→per-match for counts) and write
  the per-match rows to `scout_team_match`.
- Player export → `scout_player` via the existing `parseWyscoutPlayerList`
  (pass the opponent name; the senior-team inference handles it).
- Idempotent upsert on `(owner_team_id, opponent_name, season)` so re-uploading
  refreshes, never duplicates.

## Report computation (new pure lib: `src/lib/micropulse/scouting/opponentReport.ts`)

From `scout_team_season` (+ matches, + players), and two references — **league
average** and **your team** (`team_match_stats` for `owner_team_id`) — compute a
`OpponentReport` object with these blocks. All thresholds are constants at the top
of the file and every derived flag records the numbers that triggered it.

1. **Identity / style.** Possession, PPDA, directness (long-pass %, passes to
   final third), tempo. Classify (rule-based, cite the number): *possession-
   dominant vs direct*, *high-press vs passive* (PPDA vs league), *territorial vs
   counter*. Verdict sentence built from these.
2. **How they attack.** xGf, shots, and *where* the threat comes from — box
   presence / crosses / line-breaking passes (Passing/Attacking presets), set-
   piece share of xG if available. Name their most dangerous route.
3. **How they defend — where to hurt them.** xGa, shots against, defensive-duels
   won %, and the *type* of chances they concede (crosses vs central vs set
   pieces, from the against-side splits). Rule-based "how to hurt them" prompts,
   each citing its signal, e.g.: high line + high press → *balls in behind*;
   concede high xGa from crosses → *attack the channels / early crosses*; low
   defensive-duel % → *take them on 1v1*; poor set-piece defence → *set-piece
   focus*. Labelled as suggestions, coach-overridable.
4. **Set pieces.** Their set-piece conversion vs league and their set-piece
   concession — flagged as a focus when either is an outlier. (From Attacking
   preset + goals context; deeper routines are v2/API.)
5. **Key players.** From `scout_player`: top scorers, top xA, most-targeted
   forward (received passes/90), most progressive passer — "who to stop".
6. **The matchup (them vs you).** Their metrics beside `owner_team_id`'s, with the
   deltas, so the report is *relative*: where they are better/worse than you, and
   which of your strengths line up against their weaknesses.
7. **Form.** Last 5 matches: results + xG for/against, and whether recent xG
   diverges from the season (rising/falling), from `scout_team_match`.

Add a deterministic one-paragraph **summary** per block (reuse the pattern in
`matchInsights/narrative.ts` — rules, not an LLM; if an LLM phrasing layer is used
it must be labelled "AI" and cite the signals).

Reference data: ship a stored **league-average per season** (compute once from an
all-teams import, or seed from the dataset already gathered) so a single opponent
upload is enough to benchmark. If a full all-teams `team_match_stats` exists, use
that instead.

## API

`GET /api/coach/scouting/opponent?season=&opponent=` → build/return the
`OpponentReport` for `owner_team_id` (auth COACH/ADMIN/STAFF, team-scoped like the
existing match-insights route). `POST /api/coach/scouting/upload` → the ingestion
above (preview + commit, mirroring `team-match-stats/upload`).

## Coach UI (`src/app/coach/opponent-scouting/page.tsx`, linked under "Match Analysis")

Opponent picker (name + season) → the report, top to bottom, each section a card
with the one-line verdict, the 2–3 facts, and a **"Show details" / "Hvernig á að
lesa þetta"** toggle for the tables. Bilingual EN/IS (reuse the `T`-map +
`PanelExplainer` pattern from `match-insights/page.tsx`). A **"Report (PDF)"**
button (reuse the season-report PDF route pattern) so the coach can print the
opponent one-pager for the staff/players.

Keep jargon (PPDA, xG, smart passes) behind tooltips/details — the primary view is
plain: "dominate the ball", "concede from crosses", "dangerous from set pieces".

## Definition of done

1. Migration written, applied, committed as `.sql`.
2. A coach can upload an opponent's General export (± Indexes/Defending/Passing/
   Attacking ± player export), Preview, then Commit; re-upload is idempotent.
3. The report renders all seven blocks with verdict → facts → details, in EN and
   IS, benchmarked against league average and the coach's own team.
4. Every recommendation shows the signal it came from and is overridable; nothing
   new touches the readiness colour or daily decision; any AI phrasing is labelled.
5. `npx eslint` clean on changed files; typecheck passes; a unit test covers
   `opponentReport.ts` (given a fixture season → expected verdicts/flags).
6. PDF export produces a readable one-page opponent report.

## Out of scope (v2 — needs the Wyscout Data API / video)

- Video clips, event-level heatmaps, pressing/passing maps, per-match player logs.
- Automated fetch of opponent data (v1 is a manual export upload, same as team
  stats today).
- Anything touching readiness, load, or the daily training decision.
