# Sketch — Basketball player statistics (sport-generalizing the Wyscout surface)

Status: **design sketch**, not built. Goal: the "Player Statistics" surface (coach
page + player card + AI summary) should serve basketball the same way it serves
football, without a second parallel stack.

## What already exists and is reused (no rebuild)

- **Sport resolution** — `resolveTeamSport(sb, teamId)` → `"football" | "basketball"`
  from `team_settings.sport_type` (`src/lib/micropulse/weekSetup/resolveSport.ts`).
  The 31 seeded basketball teams already carry `team_settings`.
- **Source-agnostic schema** — `player_season_stats` / `player_match_stats` are
  typed core columns + `metrics jsonb` long-tail + `source` enum + provenance.
  **Basketball fits with ZERO schema change**: leave the football-named core cols
  null, carry basketball's box score in `metrics` jsonb (+ `minutes`/`assists`,
  which are shared). Only add-on: extend the `source` CHECK to allow a basketball
  source tag (below).
- **`sportProfiles.ts`** — per-sport metric/feature profile already distinguishes
  football vs basketball (basketball: Player Load/min, IMA, jumps — no GPS
  distance/sprint/top-speed).
- **The three surfaces** — `PlayerFootballStatsCard` (player app tab),
  `/coach/player-stats` page + metrics modal, and the AI season summary. These
  become **sport-aware** rather than football-only.

## The one real product decision (needs your input)

**Where do basketball stats come from?** Wyscout is football-only. Options:
1. **Box-score CSV/Excel import** (KKÍ / Domino's deild season export) — mirrors the
   existing Adapter A (`wyscoutExcel.ts`). Most realistic first source. → new parser
   `basketballBoxScore.ts`, `source = "box_score_csv"`.
2. **A stats provider API** (Genius Sports / Synergy) — Adapter B equivalent, later.
3. **Manual / demo seed** first (like the Arnór demo row) to validate the read path
   before any parser exists.

Recommend: **manual/demo seed → CSV import**. Everything below is source-independent
(it reads `player_season_stats.metrics`), so the read path can ship before the parser.

## Engine — sport dispatch (the core of the work)

Generalize the pure engine. Current `src/lib/micropulse/playerFootballStats/index.ts`
becomes one of two catalogs behind a dispatcher:

```
src/lib/micropulse/playerSportStats/
  types.ts        // shared StatDef, Fmt, PlayerSportStat, FootballStatInput→SportStatInput
  football.ts     // current catalog + positionFamily (moved, unchanged behaviour)
  basketball.ts   // NEW: basketballPositionFamily + basketball catalog
  index.ts        // pickPlayerStats(sport, input, position, lang)
                  // seasonHeadline(sport, input, position, lang)
                  // statIdsForPosition(sport, position)
```

`playerFootballStats` stays as a thin re-export so the football card/route/narrative
don't churn. Same `StatDef` shape (id, en/is label, `metric`/`core` source, `fmt`,
tooltip, `higherIsBetter`) — basketball just fills a different catalog.

### Basketball position families

DB codes: PG, SG, SF, PF, C (+ G, F, combo). Map to **3 families** (basketball is
far less position-divergent than football — everyone shoots/rebounds, it's emphasis):

| Family | Codes | Emphasis |
|---|---|---|
| `GUARD` | PG, SG, G | playmaking, perimeter shooting, steals |
| `WING`  | SF, F, GF | scoring, 3P, two-way |
| `BIG`   | PF, C     | rebounding, blocks, interior scoring |

### Curated set (~12): shared core + family tilt

**Core (all positions):** Games · Minutes · Points · Rebounds · Assists · FG%

| Family | + extras (6) |
|---|---|
| GUARD | Assists · Assist-to-turnover · Steals · 3P% · FT% · Points-per-shot (TS%) |
| WING  | Points · 3P% · Total rebounds · Steals · FG% · FT% |
| BIG   | Off. rebounds · Def. rebounds · Blocks · FG% · Turnovers · Points |

Universal advanced (behind "Show all"): Efficiency (EFF/PER), True Shooting %, +/-,
per-36 rates. All descriptive; jargon (TS%, PER, per-36) behind tooltips exactly
like xG/xA/PAdj on the football side.

Formatting reuses the football `Fmt` types: counts→int, %→pct, ratios→dec2.
Missing value → "–" never 0 (same rule).

## Physical join — sport-aware

Football pairs football stats with GPS (distance/top-speed/Player Load). Basketball
indoor has **no GPS distance/sprint/top-speed** but **does** have Player Load/min,
IMA and jumps (per `sportProfiles`). So the coach overview's "physical" columns
branch by sport:

- Football: Sess · Dist(km) · Top(km/h) · Load · MMin
- Basketball: Sess · Load · Load/min · Jumps · MMin  (drop distance/top-speed)

`resolveTeamSport` in the overview route picks the column set + which physical
fields to read.

## Surfaces — sport branches

1. **Player app tab** — `PlayerFootballStatsCard` → `PlayerSportStatsCard`.
   Fetch stays self-scoped; API returns `sport` + curated set. Badge + tab label
   become sport-aware: football → "Fótbolti", basketball → "Körfubolti"
   (tab key stays `stats`; only the label string branches on sport).
   "How to read" copy branches per sport (basketball glossary: TS%, per-36, EFF).
2. **Coach page** `/coach/player-stats` — sport-aware table columns (above),
   sport-aware summary line (football: top scorer/xG; basketball: top scorer/rebounds),
   sport-aware modal headline strip + metric grid.
3. **AI summary** `/api/coach/player-stats/narrative` — add a basketball SYSTEM
   prompt (leads with scoring/rebounding/playmaking per family) selected by the
   `sport` passed in. Same guardrails: cites only given numbers, says nothing about
   readiness / load / selection / recruitment, labelled AI.

## Naming cleanup (already half-done)

- Sidebar label is already sport-neutral ("Player Statistics" / "Leikmanna-tölfræði").
- Page intro + column tooltips still say "Wyscout" — branch these to
  "box score" / "leikjatölur" for basketball teams (`resolveTeamSport` on the page).

## Phasing (each phase ships green on its own)

- **P1 — engine dispatch (refactor, football unchanged):** move football catalog into
  `playerSportStats/`, add `pickPlayerStats(sport, …)`, re-export for back-compat. Tests green.
- **P2 — basketball catalog + `basketballPositionFamily` + tests** (pure, no UI).
- **P3 — demo/manual seed** one basketball team (e.g. a Sýnislið or a real Domino's
  team) → validate the read path end-to-end with real-looking numbers (Arnór pattern).
- **P4 — coach page + modal + AI** sport branches; physical join sport-aware.
- **P5 — player card + tab label + How-to** sport copy.
- **P6 (optional) — box-score CSV parser** (Adapter A sibling) + import UI sport branch,
  and extend the `source` CHECK constraint (`+ 'box_score_csv'`, saved as a migration).

## Non-negotiables (carry over from football)

- Descriptive only — **never** touches `v_coach_readiness_today_v8.final_color` or the
  daily decision.
- Layered read: headline → position grid (jargon in tooltips) → all stats + provenance.
- AI labelled as AI, cites real numbers, decides nothing.
- Missing ≠ zero; confidence (games/minutes) always visible.
