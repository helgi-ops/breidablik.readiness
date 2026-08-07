# StatsBomb IQ exports — which file feeds what in MicroPulse

StatsBomb IQ has several export pages. They share the same underlying data model, so
metric **names are identical across pages** — but each page is a different *grain*
(season aggregate vs per-match vs per-player) with a different *column selection*.
Don't treat two exports as duplicates just because the column names overlap. This
note records what each export is and which MicroPulse table it feeds, so an upload
always lands in the right place.

## The two team-level exports (the ones people confuse)

Both describe a team, both from StatsBomb, ~50 columns overlap — but they are **not**
the same export.

| | **Team Stats / "Custom Parameters"** | **Match Stats** |
|---|---|---|
| Example file | `Breidablik Custom Parameters.csv`, `*-vs-LeagueAvg_*.csv` | `Breidablik-MatchStats-2026.csv` |
| Grain | **Season aggregate** — one number per metric over the whole season | **Per match** — one row per game |
| Rows | 2 (the team **+ a built-in `League Average` row**) | 17 (one per fixture, key `Match` + `Date`) |
| Columns (full set) | 136 | 222 |
| Strong on | against-side splits (`… Faced` / `… Conceded`), full **OBV** suite, set-piece **type** breakdown (DFK/IFK, corner/throw-in goals for&against) | granular in-possession + pressing **process** metrics with zonal splits (line-breaking passes, ball receipts in space, pressures/counterpressures in opposing half, GK distribution, Box Cross%, Aggression) |
| Weak on | the granular per-match process metrics | most against-side (`Faced`/`Conceded`) splits |
| Has PPDA? | yes (defensive-pressing metrics) | no |
| Has `League Average`? | **yes** (built in) | no |
| → MicroPulse target | **season profile + league benchmark** → opponent scouting, set-piece report, league reference (`scout_team_season` / stored league average) | **`sb_team_match_stats`** (StatsBomb side of the per-match team layer; Wyscout uses `team_match_stats` — the two are never mixed in one table) → per-match trend, wins-vs-losses, Team Match Insight |

Column overlap of these two team exports: **50 shared, 85 only in Team Stats, 170
only in Match Stats.** Complementary, not interchangeable.

Note on the name: **"Custom Parameters" just means the user picked the columns** on the
Team Stats page. In practice the Breiðablik export landed on the full 136-metric set,
so it is the complete Team Stats export (identical column set to the per-category
`*-vs-LeagueAvg_*` scouting files, which are the same page filtered to one category).

## The category scouting files (same page, filtered)

`*-vs-LeagueAvg_{shooting,passing,defensive-pressing,obv,set-pieces,summary}.csv` are
the **Team Stats** page again, each filtered to one metric category, each carrying the
`League Average` row. Merged on `Team Name` they reconstruct a full team profile —
exactly the `statsbombLeagueTeamCsv` adapter in the ingestion brief. The 136-col
`all-metrics` file is the un-filtered version of the same thing.

## Player exports (for completeness)

| Export | Grain | Rows | → MicroPulse target |
|---|---|---|---|
| Squad (`Breidablik-Squad-2026.csv`, 216 col) | season, per player | one per player | `player_season_stats` |
| Player Match Stats (`*-MatchStats.csv`, 199 col) | per match, one player per file | one per fixture | `player_match_stats` (empty today — Wyscout Excel could not fill it) |

## Rule of thumb

- Has a `League Average` row and 2 rows total → **Team Stats** → scouting / benchmark.
- Has a `Match` + `Date` column and one row per game → **Match Stats** → `sb_team_match_stats`.
- Has one row per player → **Squad** (season) or **Player Match Stats** (per game).

## How the app routes an upload (and catches wrong-grain drops)

The two team exports are uploaded on two different pages, and each route detects the
other's file and redirects instead of throwing a confusing generic error:

- **Team Match Insight** import panel (`/api/coach/team-match-stats/upload`) — the panel
  is provider-aware (Wyscout tab vs StatsBomb tab). `isSbMatchStats` = has `Match` + a
  StatsBomb-only column, **no** `Team Name` → `sb_team_match_stats`. If a **Team Stats**
  file (has `Team Name` + League Average) is dropped here → error redirects to Opponent
  Scouting.
- **Opponent Scouting** upload (`/api/coach/scouting/upload`) — `isSb` = has `Team Name`
  + a StatsBomb-only column → `scout_team_season` (+ `league_ref` from the League Average
  row). If a **Match Stats** file (has `Match`, no `Team Name`) is dropped here → error
  redirects to Team Match Insight.

So the discriminator is always: **`Team Name` present → season Team Stats (scouting);
`Match` present without `Team Name` → per-match Match Stats (Team Match Insight).**
