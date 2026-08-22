# FIBA LiveStats → MicroPulse — basketball ingestion brief (data-grounded)

## Status — reconciled 21 Aug 2026 (mostly SHIPPED)

**✅ Built & live** (build-order steps 1, 2 and Phase 2 of this brief):
- **Fetcher** `fibaDataUrl` → `https://fibalivestats.dcd.shared.geniussports.com/data/{id}/data.json`.
  The brief's `www.fibalivestats.com/data/{id}/data.json` **301-redirects to exactly that host** (verified:
  337 KB, same `tm`/`pbp`/`clock` keys). Use the DCD host directly.
- **Parser** `parseFibaGame` — `tm[1|2]` totals + `pl[*]` per-game box + `pbp` shot coordinates. Idempotent.
- **Shot charts / tactical layer** — the pbp coords power a full FIBA-Organizer shot chart with click-to-detail,
  an enlarge pop-up + shooting summary, a **10-zone efficiency heat map** (restricted / paint / mid L·C·R /
  three LC·LW·Top·RW·RC), and **league-relative colouring** (server computes per-zone league FG% from all
  ingested shots once the DB clears a sample gate; else built-in defaults).
- **Storage**: `basketball_shots` (per-shot) + `basketball_fiba_games` (own/opp totals+box+pbp+AI jsonb).
  Source tag is **`'fibalivestats'`** (this brief says `fiba_livestats` — code uses no underscore).
- Code: `src/lib/micropulse/basketballStats/fibaLiveStats.ts`, `shotZones.ts`,
  `src/app/api/coach/basketball-fiba/route.ts`, `src/components/coach/FibaShotCharts.tsx`.

**⏳ Open / not done (deliberately):**
1. **FIBA box → the shared season tables** (`player_basketball_match_stats` / `basketball_team_match_stats`).
   Today FIBA lives in its own `basketball_fiba_games` path; the season read `basketball-season-insights` is
   hardcoded to `source='instat'`, so FIBA is NOT in the season box read (and therefore does NOT double-count).
   Wiring FIBA in needs a **multi-source de-dup refactor** across ~4 read endpoints (prefer one source per game).
   Scoped follow-up — do it as its own task, not a blind write.
2. **Game-ID resolver (fixture → gameid).** Live-season enumeration is still blocked (the per-game feed's
   `othermatches` is empty; no public KKÍ schedule JSON; the baskethotel schedule uses a separate id system with no
   bridge to FIBA ids). **BUT for a FINISHED season this is now solved (shipped):** FIBA assigns a **contiguous
   gameid block per competition-season** (men's 2025-26 = `2667405–2667536`, 132 ids, zero gaps). The
   **`idRange` action** on `/api/coach/basketball-fiba` (`{idRange:{start,end,competitionCode,season,stage}}`) loops
   the existing fetcher/parser over the block, tags each game (`competition_code/season/stage`), and records the
   block in `basketball_fiba_ingest_blocks`. Recipe to find the block: from one known gameid (off a karfan.is/kki.is
   match report's FIBA link), walk outward until ~8 consecutive empty/other-competition ids each way. Powers the
   league-level **Win Factors** surface (`/coach/win-factors`). Live-season paste/batch-paste UX unchanged.

The original data-grounded brief follows (kept for reference; note the host/source corrections above).

---

Confirmed live against a real **KKÍ** game. FIBA LiveStats exposes a **free per-game JSON feed** — this is
a much better basketball source than the InStat XLSX (per-game, not season aggregate; programmatic, not
manual export; includes play-by-play with shot coordinates). Use this alongside / instead of the InStat
setup for KKÍ games.

## Confirmed facts (verified 21 Aug 2026)

- **KKÍ basketball runs on FIBA LiveStats.** Org/competition code on the platform is **`KKI`**.
- **Game Center (HTML):** `https://www.fibalivestats.com/u/KKI/{gameid}/`
  (newer Genius Sports host mirror: `https://livestats.dcd.shared.geniussports.com/u/KKI/{gameid}/`)
- **JSON data feed (the ingestion target — confirmed working, ~82 KB):**
  **`https://www.fibalivestats.com/data/{gameid}/data.json`**
  - Verified on game `593318` = **Keflavík (KEF) vs Skallagrímur (SKA)** — returned full box + play-by-play.
- Official FIBA page lists "**API accesses and XML data exports**" as a feature. The formal API (GDAP /
  Genius Sports) needs a federation/admin subscription; the **per-game `data.json` above is public** and is
  the practical path. The FIBA LiveStats desktop app also writes a local **game XML** with the same data
  (used by community OBS tools) — same content, but the HTTP JSON is cleaner for server ingestion.

## JSON shape (real keys observed)

Top level: `clock`, `period`, `pbp` (play-by-play, array of events), `tm` (teams object, keyed `"1"` =
home, `"2"` = away), plus per-period scores and match meta.

**`tm["1"]` / `tm["2"]` (team):** `name`, `nameInternational`, `shortName`, `code` (e.g. `KEF`, `SKA`),
`score`, `full_score`, `logoT`, a `pl` object (players, keyed by shirt number), and **40 team totals**
prefixed `tot_s…`:

`tot_sPoints, tot_sFieldGoalsMade/Attempted/Percentage, tot_sTwoPointersMade/Attempted/Percentage,
tot_sThreePointersMade/Attempted/Percentage, tot_sFreeThrowsMade/Attempted/Percentage,
tot_sReboundsOffensive/Defensive/Total (+ tot_sReboundsTeam*), tot_sAssists, tot_sSteals, tot_sBlocks,
tot_sBlocksReceived, tot_sTurnovers (+ tot_sTurnoversTeam), tot_sFoulsPersonal/Team/On, tot_sBenchPoints,
tot_sPointsInThePaint, tot_sPointsFastBreak, tot_sPointsSecondChance, tot_sPointsFromTurnovers,
tot_sBiggestLead, tot_sBiggestScoringRun, tot_sLeadChanges, tot_sTimesScoresLevel, tot_sTimeLeading,
tot_sMinutes, tot_sEfficiencyCustom`.

**`tm[n].pl[shirtNo]` (player, per-game box — NOT season aggregate):** `firstName`, `familyName`, `name`,
`shirtNumber`, `playingPosition`, `starter`, and per-game stats:

`sMinutes, sPoints, sFieldGoalsMade/Attempted/Percentage, sTwoPointersMade/Attempted/Percentage,
sThreePointersMade/Attempted/Percentage, sFreeThrowsMade/Attempted/Percentage,
sReboundsOffensive/Defensive/Total, sAssists, sSteals, sBlocks, sBlocksReceived, sTurnovers,
sFoulsPersonal, sFoulsOn, sPlusMinusPoints, sPointsInThePaint, sPointsFastBreak, sPointsSecondChance,
sEfficiencyCustom` (+ `*Average` season-to-date variants).

**`pbp` (play-by-play):** every event — shots (with x/y court coordinates), rebounds, assists, fouls,
subs, timeouts — with player, period, game clock, action type/subtype and running score. This is the
**tactical goldmine InStat XLSX can't give you**: derive shot charts / zones, on-off, and lineup stints.

## Mapping to MicroPulse basketball tables

| Feed data | Table | Notes |
|---|---|---|
| `tm[n]` totals (`tot_s*`) + score | `basketball_team_match_stats` | one row/team/game; `tm[1]`=home, `tm[2]`=away |
| `tm[n].pl[*]` per-game box | `player_basketball_match_stats` / `scout_basketball_player_game` | **per-game** — matches these tables natively (unlike InStat's season XLSX) |
| `pbp` shot coords + events | `advanced` jsonb on the stats tables | shot chart / zones, on-off, lineups — Phase 2 |

Store `gameid`, `source = 'fiba_livestats'`, competition code `KKI`, and fetch timestamp for provenance
and idempotent re-imports (unique on `source + gameid + team/player`).

## How to get game IDs

The feed is keyed by numeric `gameid`; you need the list of KKÍ game IDs. Options, in order of preference:

1. **Scrape the KKÍ competition Game Center listing** on fibalivestats (the schedule pages under the `KKI`
   org) → map each fixture (date, home, away) to its `gameid`.
2. **Cross-map from kki.is fixtures** to the game-center links (the site embeds/links the FIBA LiveStats
   game pages).
3. If KKÍ grant a **federation admin account** (fibaorganizer.com), the official API returns the
   competition → games list directly (cleanest, but needs their permission).

Confirm the exact listing endpoint by opening a KKÍ game in the browser and reading the Network tab
(look for the `data.json` request and any `…/games`/schedule JSON alongside it).

## Build order (Code)

1. **Fetcher** — `GET https://www.fibalivestats.com/data/{gameid}/data.json`, server-side, with a
   short cache. Poll post-game for the final box (the feed is live during the game; ingest when `clock`
   is `00:00` in `period` 4+ / game finished).
2. **Parser** — map `tm[1|2]` totals → team match stats (home/away from the 1/2 key), `pl[*]` → per-game
   player box. Idempotent upsert on `source + gameid`.
3. **Game-ID resolver** — build the KKÍ fixture → `gameid` map (option 1 above); store it so imports are
   one call per fixture.
4. **Phase 2 (advanced)** — parse `pbp` shot coordinates into shot zones / shot chart + derive on-off and
   lineup stints → `advanced` jsonb. This replaces InStat's UI-only Field Goals view with real coordinates.

## FIBA LiveStats vs InStat (why use both)

- **FIBA LiveStats** — free, programmatic, **per-game** player + team box, **play-by-play with shot
  coordinates**. Best for the automated per-game feed of KKÍ games and for shot charts.
- **InStat (Hudl)** — adds **classified tactical layers** FIBA doesn't: play-type efficiency
  (catch-and-shoot, PnR, transition, PPPP), pick-and-roll defense types, lineup +/- tables. Best for the
  scouting/tactical layer.
- Recommended: **FIBA LiveStats = the box-score & shot-chart engine (auto)**; **InStat = the tactical
  scouting overlay (manual XLSX/PDF)**. Both write to the same basketball tables; tag `source`.

## Guardrails

- Public per-game feed — ingest post-game finals; don't hammer live (cache; poll at a sane interval).
- Descriptive stats only — same rules as the football/InStat scout flow; never touches readiness.
- Persist `source + gameid + fetch date`; re-imports idempotent.
- If KKÍ later grant a federation API account, swap the game-ID resolver to the official competition
  endpoint — the parser stays the same.

## Reference

- Official: FIBA LiveStats — https://about.fiba.basketball/en/services/data-and-video-solutions/fiba-live-stats
- Live JSON verified: `https://www.fibalivestats.com/data/593318/data.json` (KEF vs SKA, org `KKI`)
- Game Center pattern: `https://www.fibalivestats.com/u/KKI/{gameid}/`
- Companion: `docs/tasks/instat-basketball-setup-spec.md` (the tactical/scouting overlay).
