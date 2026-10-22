# Claude Code brief — **Set-Piece Report** (Wyscout → MicroPulse)

## Goal & rationale

Set pieces are a large, underworked margin — a widely cited quarter-to-a-third of
goals in most leagues — and small clubs almost never analyse them systematically.
Build an **automatic set-piece report** a coach can act on: *our set-piece output
and concession vs the league, the opponent's set-piece threat and weakness this
week, and where the training focus should go.* High return for low effort, because
much of the data is already in the Wyscout exports MicroPulse ingests.

**Scope split (be honest about it):**
- **v1 — aggregate, from the Wyscout Team → Stats Excel exports** (General +
  **Attacking** preset, which carries set-piece attack counts; see the
  passing-attacking brief). Gives volume, share-of-threat, shots-from-set-pieces,
  corners, and set-piece xG (direct if present, else proxied) for and against,
  benchmarked vs league and vs the opponent. No video, no routines.
- **v2 — routine/delivery level, needs the Wyscout Data API + event/video**:
  which corner routine scores, delivery zones, first-contact maps, near/far-post
  tendencies, individual aerial threats. Clearly labelled out of scope for v1.

Descriptive context only — never touches the readiness colour, the load, or the
daily training decision. Rules compute the facts; any AI phrasing is labelled AI
and cites the signals. Every recommendation shows its number and is overridable.

## The signals v1 can use (and where they come from)

From the **Attacking** DISPLAY preset (per match, own + opponent — added by the
passing-attacking brief) and General:
- `set_piece_attacks` (attacks originating from set pieces) — per match, for & against.
- `set_piece_attacks_with_shot` / shots from set pieces — per match, for & against.
- `corners` (won) and corners conceded — per match.
- Set-piece **xG** for/against: use Wyscout's set-piece xG column if the export
  carries it; otherwise **proxy** as `set_piece_shots × league xG-per-set-piece-shot`
  and label it an estimate.

Derived per team-season (own, league average, opponent):
- Set-piece **share of xG** = set-piece xG ÷ total xG (attack side; same for defence).
- **Conversion** = set-piece goals (or xG) per corner / per set-piece attempt.
- Trend = rolling last-5 set-piece xG for/against.

**Honest gap:** exact goals-from-set-pieces attribution and routine breakdowns are
event-level (Data API). v1 leads with xG/shots/corners and flags goal-level counts
as approximate where derived. Don't overstate precision in the copy.

## Data model

Reuse the passing-attacking columns on `team_match_stats` where possible; add the
set-piece specifics not already promoted there:
- On `team_match_stats` (and the `scout_team_*` tables from the opponent-scouting
  brief, so the report works for both your team and a scouted opponent):
  `set_piece_attacks numeric, set_piece_shots numeric, corners numeric,
  set_piece_xg numeric` (nullable; from the Attacking preset / General). Keep the
  full Attacking row in the existing `attacking` jsonb so nothing is lost.
- A stored **league set-piece average per season** (mirrors the league-average
  reference in the opponent-scouting brief) so a single team's data is enough to
  benchmark.

Save the migration as a timestamped `.sql` under `supabase/migrations/` and apply it.

## Ingestion (reuse)

No new upload path. The set-piece columns are populated by the **existing** Wyscout
Team → Stats import once the **Attacking** preset is included (passing-attacking
brief). Extend `buildTeamMatchRows` to also promote the set-piece columns from the
Attacking matrix (same merge-by-`(date,is_opponent)` pattern as PPDA/def-duels).
For a scouted opponent, the same parse fills the `scout_team_*` set-piece fields.

## Report computation (new pure lib: `src/lib/micropulse/setPieces/setPieceReport.ts`)

Given a team's season set-piece aggregates + the league reference (+ optionally the
opponent's), produce a `SetPieceReport` with these blocks. Thresholds are constants
at the top; every flag records the numbers that triggered it.

1. **Attacking set pieces (ours).** Corners/set-piece attempts per match, set-piece
   shots, set-piece xG, share of total xG from set pieces, and conversion — each vs
   league average. Verdict, e.g. *"You win plenty of corners but rarely turn them
   into chances — a delivery/routine problem, not a volume one."*
2. **Defending set pieces (ours).** Set-piece xGa, share of xGa from set pieces,
   set-piece attempts conceded — vs league. Verdict on whether set-piece defence is
   a leak.
3. **Opponent set pieces (pre-match).** Opponent's attacking set-piece threat and
   defensive set-piece weakness vs league → two rule-based prompts, each citing its
   signal: *opponent concedes a high set-piece xGa share → your set-piece
   opportunity this week*; *opponent scores a high share from set pieces →
   prioritise defending set pieces.* (Reuses the opponent-scouting data.)
4. **Trend.** Rolling last-5 set-piece xG for/against — improving or declining.
5. **Focus of the week.** A short, rule-derived recommendation combining the above
   (e.g. "Set-piece attacking is your biggest under-used margin AND the opponent is
   weak defending them → make attacking set pieces this week's priority"), labelled
   as a suggestion, coach-overridable, with the signals shown.

Add a deterministic one-paragraph summary per block (rules, not an LLM; if an LLM
phrasing layer is used, label it "AI" and cite the numbers), following
`matchInsights/narrative.ts`.

## API

`GET /api/coach/set-pieces?season=&opponent=` (opponent optional) → build/return the
`SetPieceReport` for `owner_team_id`, auth COACH/ADMIN/STAFF and team-scoped like the
match-insights route.

## Coach UI

Ship it **two ways, one lib**:
- A **"Set pieces"** card/section on Team Match Insight (own team, vs league + trend).
- The **set-piece block in the Opponent Scouting report** (opponent brief, section 4)
  is powered by the same `setPieceReport.ts`.

Explainability-first: verdict → 2–3 facts → **"Show details"** tables; bilingual
EN/IS via the existing `T`-map + `PanelExplainer` pattern; plain language in the
primary view ("you win corners but don't threaten from them"), jargon (xG share,
per-attempt conversion) behind tooltips/details. Include the estimate flag wherever
set-piece xG/goals are proxied. Optional "Set-piece one-pager (PDF)".

## Definition of done

1. Migration written, applied, committed as `.sql`.
2. Once an Attacking export is imported, the set-piece columns populate; the report
   renders blocks 1–5 with verdict → facts → details, in EN and IS, benchmarked vs
   league (and vs opponent when provided).
3. Every recommendation shows its signal and is overridable; proxied/estimated
   figures are labelled; nothing touches the readiness colour or daily decision;
   any AI phrasing is labelled.
4. `npx eslint` clean; typecheck passes; a unit test covers `setPieceReport.ts`
   (fixture season → expected verdicts/flags, including the proxy path).
5. The same lib drives both the Team Match Insight card and the opponent-scouting
   set-piece block (no duplicate logic).

## Out of scope (v2 — Wyscout Data API / video)

- Routine-level analysis (short vs in-swinger vs near-post flick), delivery zones,
  first-contact and second-ball maps, individual aerial threat lists.
- Exact event-level goal attribution beyond the xG/shots/corners aggregates.
- Automated opponent-data fetch (v1 is manual export upload, as today).
- Anything touching readiness, load, or the daily training decision.

## Dependencies

- **Passing/Attacking ingestion brief** (`docs/tasks/passing-attacking-ingestion-brief.md`)
  — the Attacking preset is where the set-piece attack counts come from; land that first.
- **Opponent-scouting brief** (`docs/tasks/opponent-scouting-report-brief.md`) —
  shares the league-average reference and the `scout_team_*` store for the opponent block.
