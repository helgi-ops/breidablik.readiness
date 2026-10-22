# Claude Code brief — **Hudl / InStat basketball ingestion**

## Verdict first

Hudl's **InStat** basketball reports are the **basketball equivalent of StatsBomb** — a rich
advanced-analytics layer that goes well beyond the box score MicroPulse already ingests
(`baskethotel` / Genius Sports). Confirmed live in the report (Coach Johannsson, team 405795):
tabs for **Stats · Shot Chart · Box Score · Scouting · Trends**, filters for **Side** (own vs
Opponents), **Group By** (Overall / Game / **Athlete** / **Lineup**), Averages/Totals, and a
**per-quarter** (Q1–Q4) breakdown. The metric set includes everything the box score lacks.

So the recommendation, mirroring StatsBomb-vs-Wyscout on the football side: **add InStat as a
second, richer source** feeding the **existing basketball tables**, enriching them with the
advanced metrics — provider is a *source*, not a new surface. Box-score (`baskethotel`) stays
the baseline; InStat adds depth. Everything descriptive — never touches the readiness colour,
load, or the daily decision.

## What InStat provides (from the live report)

Beyond standard box-score (points, FG/3P/FT makes+attempts+%, reb, ast, stl, blk, TO, fouls,
+/−, minutes, efficiency — already covered), InStat adds:

- **Four Factors:** eFG%, TO%, OREB%, DREB%, **FTF** (free-throw factor), VPS.
- **Efficiency / scoring:** **PPP** (points per possession), PPG, points for/against.
- **Advanced scoring:** points off turnovers, **second-chance points**, **points in paint**,
  transition points.
- **Assists/turnovers:** A/TO, TO%.
- **Inbounds efficiency:** SLOB / BLOB (sideline / baseline out-of-bounds), PPSLOB / PPBLOB.
- **Defense:** deflections, steals, blocks, charges, fouls.
- **Shot Chart:** shooting by **court zone** (the basketball equivalent of the football shot map).
- **Splits:** per **quarter**; **Group By Lineup** → lineup / on-off data (no football equivalent).
- **Scouting tab / Side = Opponents:** the same metrics for a scouted opponent.

## How the data comes OUT — CONFIRMED (Hudl rep, Aug 2026)

The Hudl/InStat rep confirmed three paths. For Icelandic clubs the realistic ones are the first
two (the API is too expensive — clubs won't buy it), so build for those:

1. **Manual table export (PRIMARY).** In InStat you can **download tables with the metrics you
   select** — box-score *and* advanced — via "adjustments" (add/remove metrics). Output is a
   spreadsheet meant for Tableau/Looker/Power BI, i.e. **CSV/Excel**. This is the clean,
   structured path — the direct equivalent of the StatsBomb CSV import. **Build this adapter
   first.**
2. **Game Report PDF (FREE / INCLUDED).** Every club's offer already includes an auto-generated,
   data-driven **per-match Game Report PDF** (coaches see it after each game). Sample on file:
   `docs/samples/instat/InStat-Game-Report-Valencia-Baskonia-2026-05-10.pdf` (14 pp). It is
   very rich — extract its tabular pages the same way as the football StatsBomb Match Report PDF.
3. **API (DEPRIORITISE).** InStat sells API subscriptions (unlimited / 20 / 10 / 1 competition;
   **1 competition ≈ €2,825/yr list**). Too expensive for KKÍ clubs, so treat as optional Phase A
   only for a club that already has it. Docs on file:
   `docs/samples/instat/InStat-API-Basketball-Documentation-v1.2.pdf`.

### What the Game Report PDF contains (for the PDF extractor)

Parse the **text tables** (images = shot charts, store the PDF for those):
- **Teams stats** (p2): box score **per period** (points, FG/2P/3P/FT, rebounds off/def,
  turnovers, steals, assists, blocks, blocked shots, fouls, technical fouls, 2-and-1/3-and-1);
  **Offensive efficiency** (ball-possession min, possessions, avg possession sec, positional
  attacks + pts + %, transitions + pts, baseline/sideline out-of-bounds, points off turnovers,
  paint points, starting-lineup vs bench points, **points per possession**, second-chance points);
  **FG playtypes** (pick'n'roll handler/roller, catch-and-shoot, catch-and-drive, screen-offs,
  post-ups, transitions, isolations, hand-offs, cuts, putbacks, contested/uncontested FG).
- **Player stats per team** (p3–4): per-player box score + **Rankings** (offensive rating,
  defensive rating, **net rating**), contested/uncontested FG, opp FG attempted, opp points, and
  per-player playtypes.
- **Field goals / zones** (p5, p8): shot-chart **zone efficiency** (7 court zones, makes/att + %).
- **Lineups statistics** (p12–13): per lineup — minutes, +/−, points, possessions, **pts per 100
  possessions**, FG, 3P, turnovers, steals, rebounds off/def, **and the same for the opponent
  on-court** (true on/off).
- **Notes & glossary** (p14): definitions of every metric and playtype — use verbatim for the
  in-app tooltips.

An **AI PDF read** (like the football `match-report-read` route) is a fine fallback for the
qualitative summary, but the CSV export + deterministic table parse is the source for numbers.

## Routing & data model — reuse the existing basketball vertical

Existing tables (do not duplicate):

- `player_basketball_match_stats` (per-player, per-match; `source_player_ref`, `source_player_name`, …).
- `scout_basketball_season` + `scout_basketball_player_game` (opponent scouting; per-player game
  rows: points, fgm/fga, tpm/tpa, ftm/fta, oreb/dreb/reb, assists, steals, blocks, turnovers,
  fouls, plus_minus, efficiency, `stats jsonb`, `source`).
- Ingestion today: `syncBasketballTeam` (`source='baskethotel'`), `daily-sync` cron.

**Add InStat as `source='instat'` into these same tables**, extending them for the advanced
metrics the box score doesn't carry:

- Extend `player_basketball_match_stats` and `scout_basketball_player_game` with nullable numeric
  columns for the **Four Factors + key advanced metrics** (`efg_pct, ts_pct, to_pct, oreb_pct,
  dreb_pct, ftf, ppp, points_off_to, second_chance_pts, points_in_paint, deflections, charges`)
  plus an **`advanced jsonb`** so nothing is lost (inbounds efficiency, per-zone, etc.).
- **Team per-match + per-quarter:** if a team-level basketball match-stats store exists, add the
  advanced columns to it; if not, add `basketball_team_match_stats(owner_team_id, match_ref,
  match_date, is_opponent, period, source, …four-factors + advanced…)` — this powers the
  Four-Factors team view and the per-quarter splits. Save every migration as a timestamped
  `.sql` under `supabase/migrations/`.
- **Shot zones** → feed the existing shot-chart route (`player-stats/shot-chart`,
  `player-shot-games`); store per-zone attempts/makes in the `advanced` jsonb or a small
  `basketball_shot_zone` table if the chart needs its own rows.
- **Lineups / on-off** → optional `basketball_lineup_stats` (Phase B); not required for v1.

Source-of-truth rule: where a metric exists in both feeds, **box-score (`baskethotel`) stays the
canonical box line**; InStat fills the advanced metrics and can backfill missing box games. Rows
carry their `source` so provenance is explicit (mirrors the football EXPORTS-README contract).

## Player identity

Map InStat player names to the basketball roster via the same
`(team_id, source_player_ref)` / name-fold mapping used by `player_basketball_match_stats`;
surface unmatched players in preview, never silently merge.

## What it unlocks (rules compute, AI explains, never a verdict)

All descriptive; beside the indoor **IMA / PlayerLoad** load so the coach can ask *"did the load
explain the performance?"*.

- **Team / Season Match Analysis** (basketball) — per game **and per quarter**, wins-vs-losses,
  season report — from the team advanced stats.
- **Player Analysis** (basketball) — per-90-style percentiles vs squad on scoring, **eFG%/TS%**,
  rebounding %, A/TO, defensive activity — extend the existing basketball player surfaces.
- **Opponent Analysis** (basketball) — `scout_basketball_*` gains the advanced metrics; "how they
  play, where to attack" (their Four Factors vs league, transition/paint reliance, inbounds).
- **Shot chart** — real court-zone shooting.
- **Four Factors model** — surface eFG% / TO% / OREB% / FTF as the "what wins games" read (Dean
  Oliver) — the basketball equivalent of the football top-4 correlation work. Descriptive, cited.
- **Lineups / on-off** (Phase B).

Explainability-first wherever surfaced: verdict → 2–3 facts → "Show details"; jargon (eFG%, PPP,
Four Factors) behind tooltips; bilingual EN/IS; every figure cites `source: "instat"`.

## Definition of done

1. **Two adapters** (`statsInstatBasketballCsv` + `statsInstatBasketballPdf`): the CSV table
   export is the primary structured source; the Game Report PDF fills the extra tables (efficiency,
   playtypes, ratings, lineups, zones) + is stored for its shot-chart images. Both fingerprint the
   InStat data, validate columns, preview before commit, and upsert idempotently on
   `(owner_team_id, match_ref, player_ref, source)`. (API path is out of scope for v1.) Test both
   against the fixtures in `docs/samples/instat/`.
2. Migrations for the advanced columns + `advanced` jsonb (and team/per-quarter store if needed)
   written, applied, committed as `.sql`.
3. Own-team InStat data lands in `player_basketball_match_stats` (+ team store) with `source=
   'instat'`; opponent InStat data lands in `scout_basketball_*`; box-score `baskethotel` rows are
   never overwritten by InStat.
4. The basketball Team/Season/Player/Opponent surfaces render the new advanced metrics + Four
   Factors + shot zones, in EN and IS, layered read; unmatched players surfaced in preview.
5. Nothing touches the readiness colour, load, or daily decision; any AI phrasing labelled and
   cites data. `npx eslint` clean on changed files; typecheck passes; a unit test covers the
   adapter (fixture report → expected rows + advanced values).

## Out of scope (later)

- Automated API sync if v1 lands as manual upload (Phase A follows once the API is confirmed).
- Lineup / on-off analytics surface (Phase B).
- Anything touching readiness, load, or the daily training decision.

## Dependencies / relationship

- Mirrors the football **StatsBomb ingestion brief** and the source-toggle / single-source rules
  in the **stats-pages IA consolidation brief** (basketball works with box-score only, InStat
  only, or both).
- Reuses the existing basketball routes: `basketball-season-insights`,
  `basketball-opponent-scout`, `player-stats/basketball-matches`, `player-game-report/basketball`,
  `player-stats/shot-chart`, and the `integrations/basketball` sync scaffold.
