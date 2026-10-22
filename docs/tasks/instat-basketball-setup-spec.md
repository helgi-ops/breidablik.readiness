# InStat (Hudl) basketball → MicroPulse — setup spec (data-grounded)

Grounds the earlier generic ingestion brief in the **real** InStat structure, observed live on
**Njardvik W, team `140244`** (`app.hudl.com/instat/basketball/teams/140244`) + the four real XLSX
exports (20 Aug 2026). Use this to build the ingestion in Code.

## The single most important fact: what is exportable vs UI-only

InStat basketball has 8 views. **Only four export to XLSX; the tactical gold is UI-only.**

| InStat view | Content | Export |
|---|---|---|
| **Games** | per-**game team** box score | ✅ **XLSX** |
| **Players** | per-**player season** box score | ✅ **XLSX** |
| **Lineups** | 5-man lineup stats | ✅ **XLSX** |
| **Team comparison** | team **season averages** | ✅ **XLSX** |
| Overview | season stats + roster (positions/nationality) + video-clip counts | UI only |
| **Field Goals** | shot **zones** (own + opponent), make% by zone, shots-on-court | **UI only** |
| **Pick'n'Rolls** | PnR usage by zone + defense types (Over/Under/Switch/Double/Hedge/Ice), per player | **UI only** |
| **Play Types** | offense **and** defense by play type — frequency + efficiency | **UI only** |
| Compare | vs league / other teams | UI only |
| Clip Search (beta) | video clips | UI only |

**Design consequence:** the MVP ingestion is **XLSX upload → parse → upsert** (Games, Players, Lineups,
Team comparison). The tactical layers (Play Types, shot zones, Pick'n'roll) are **not in any XLSX** — they
come only from the **Game Report PDF** (per the earlier brief) or manual entry. Build XLSX ingestion
first; treat Play-Types/zones/PnR as a Phase-2 advanced layer, not part of the box-score import.

## Exact XLSX columns (from the real files)

**Games — "Box score" sheet (27 cols, one row per game + an "Average per game" row):**
`Date, Opponent, Score, Possessions, Points, Points per possession, Field goals made, Field goals
attempted, Field goals %, 2-pt made/att/%, 3-pt made/att/%, Free throws made/att/%, Rebounds, Offensive
rebounds, Defensive rebounds, Assists, Steals, Turnovers, Blocks, Fouls, Fouls drawn`.
- `Opponent` is prefixed `vs ` (home) or `@ ` (away) — parse both **opponent name** and **home/away**.
- `Score` is `own:opp` (e.g. `95:70`) — derive **result (W/L)** and **points for/against**.

**Players — "Box score" sheet (25 cols, one row per player, SEASON aggregate):**
`Jersey number, Player, Games played, Minutes (mm:ss), Points, Points per player's possession, FG made/att/%,
3-pt made/att/%, FT made/att/%, Rebounds, Offensive rebounds, Defensive rebounds, Assists, Steals,
Turnovers, Blocks`. (The Players **web tab** additionally shows `+/-`, `F` fouls, `FD` fouls drawn — those
are NOT in the XLSX; only the web grid.) Empty cells come through as `-`.

**Lineups — 24 cols:** `Lineup, Plus/Minus, Minutes, Possessions, Points, FG/2pt/3pt/FT splits, Rebounds
(off/def), Assists, Steals`.

**Team comparison — season averages, key/value layout** (`metric | value | "Average per game"`): the
team's own 34-game season averages (Games played, Possessions, Points, PPP, shooting splits, rebounds,
assists, steals, turnovers, blocks, fouls, fouls drawn). Note: labelled like a comparison but it's a
**single team's** averages, not vs-opponent.

**Data caveat:** the **Games** export we received was the **last 10 games** (a playoff run), while
**Team comparison / Players** are the **full 34-game season**. Don't assume the Games sheet is the whole
season — read the row count, don't hardcode.

## Mapping to MicroPulse basketball tables (already in the schema)

- **`basketball_team_match_stats`** ← Games (per-game team box, home/away, result). One row per game.
- **`player_basketball_match_stats`** / **`scout_basketball_player_game`** ← Players. NB: the XLSX is a
  **season aggregate**, not per-game — either store as a season row, or (better for the per-game tables)
  ingest the per-game player box from the **Game Report** instead. Decide: season-aggregate table vs
  per-game.
- **Lineups** → no existing table; add `basketball_lineup_stats` (jsonb of the 5 players + the splits) or
  defer.
- **Play Types / shot zones / Pick'n'roll** → the advanced `jsonb` columns already on the basketball
  stats tables (`advanced`, `stats`) — populate from the Game Report PDF in Phase 2, not from XLSX.

## Team / opponent identity

- InStat team id **140244 = Njardvik W** (Bónus deild kvenna, 25/26). Keep the InStat team id as an
  external key on the MicroPulse team/scout row so re-imports match.
- **Decide owner vs scout target:** is Njardvik W a MicroPulse-managed team, or a scouting opponent? That
  sets whether rows go under a managed `team_id` or a `scout_*` target (`owner_team_id` + opponent).
  Mirror the football pattern: own team → team tables; opponent → `scout_*`.

## Build order (Code)

1. **XLSX upload + parser** — one endpoint that detects which of the 4 sheet types it is (by header
   signature) and upserts: Games → team match stats; Players → player season stats; Lineups → lineup
   stats; Team comparison → team season row. Idempotent (unique on team + game/opponent/date, or team +
   player + season).
2. **Parse rules:** `vs `/`@ ` → home/away; `own:opp` → result + PF/PA; `mm:ss` minutes → seconds; `-` →
   null; season vs last-N by row count.
3. **Surface** — a basketball team/scout page reading these (mirror the football scout surface), with the
   season profile + per-game log + player box + lineups.
4. **Phase 2 (advanced):** Game Report PDF ingestion for Play Types (offense/defense: frequency +
   PPPP), shot zones, and Pick'n'roll → the `advanced` jsonb. This is where the real tactical edge is
   (e.g. catch-and-shoot frequency, putbacks-allowed efficiency, PnR defense types) — but it's PDF/manual,
   not XLSX.

## Guardrails

- Descriptive scouting/stats data — same rules as the football scout flow.
- Store the InStat team id + source + import date for provenance and idempotent re-imports.
- Don't hardcode "34 games" or "last 10" — read the actual rows.

## Reference

- Earlier generic brief: `docs/tasks/` InStat/Hudl basketball ingestion brief (this supersedes its data
  model with the observed reality).
- Real sample exports: `uploads/*Njardvik W, 20-Aug-2026.xlsx` (Games, Players, Lineups, Team comparison).
- Live structure: `app.hudl.com/instat/basketball/teams/140244` (Overview, Players, Field Goals,
  Pick'n'Rolls, Play Types, Compare).
