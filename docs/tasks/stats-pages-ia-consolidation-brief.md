# Claude Code brief — **Stats-pages IA consolidation** (organise by subject, not by source)

## Goal & guiding principle

The football-stats pages have grown by **data source** (a Wyscout page, a StatsBomb page)
instead of by **subject** (my players, my team, the opponent). That creates duplication and
upload/read traps. Fix it with one rule, already proven on Team Match Insights:

> **Organise pages by the question they answer (subject). The data source
> (Wyscout / StatsBomb) is a toggle *within* a page, never a separate page.**

Everything that analyses a match or football stats lives under **Match Analysis**.
**Performance Analytics** keeps only the physical/readiness surfaces. Descriptive context
only — nothing here touches the readiness colour, load, or the daily decision.

## Current state (what the review found)

Nav is defined in `src/app/coach/CoachSidebar.tsx`.

- **Match Analysis** (`matchAnalysisLinks`, ~L87–96): Team Match Insights
  (`/coach/match-insights`), Opponent Scouting (`/coach/opponent-scouting`), **Player
  Analysis** (`/coach/player-analysis`), Player Match Movement, Player Game Report, Position
  Comparison, Post-match Recovery, Train like you Play.
- **Performance Analytics** (`performanceAnalyticsLinks`, ~L118+): Readiness Trends,
  Readiness Swings, Neuromuscular Fatigue (CMJ), Force-plate, Strength Monitoring, Assessment
  Profile, **Player Statistics** (`/coach/player-stats`, ~L125).

Data sources today:

- **Player Statistics** (`/coach/player-stats`) — Wyscout per-player season + per-match
  football stats; writes `player_season_stats` (`source=wyscout_excel`), `player_match_stats`,
  `stat_player_mapping`. **This feeds the player app** via `/api/player/football-stats`
  (reads `player_season_stats` where `source=wyscout_excel`). It *also* ingests the StatsBomb
  **Squad CSV** (writes `player_season_stats source=statsbomb_csv`).
- **Player Analysis** (`/coach/player-analysis`) — StatsBomb per-90 percentile role read +
  strengths/weaknesses + AI prose + GK variant; reads `player_season_stats` where
  `source=statsbomb_csv` (`/api/coach/player-analysis`, `/api/coach/goalkeeper-analysis`).

### Duplication / traps to remove

1. **Player Statistics vs Player Analysis** — same subject (a player's season football
   profile), split across two pages in two nav sections purely by source. The clearest dupe.
2. **Upload/read split** — the StatsBomb **Squad CSV is uploaded on Player Statistics but
   read on Player Analysis**. (Same class of bug as the season-report button.)
3. **Player Statistics is filed under Performance Analytics** though it is football stats,
   not physical/readiness.
4. **Two season-report endpoints** (`/api/coach/season-report`, `/api/coach/team-season-report`)
   both fire from Match Insights with no dedicated tab (addressed by the season-report +
   disambiguation briefs — cross-referenced, not re-solved here).

*Not duplication (leave as-is):* team stats appear on both Team Match Insights and Opponent
Scouting because own-team is the scouting **benchmark** — intended.

## Target information architecture

**Match Analysis** — football + movement, grouped by subject; each football page carries a
Wyscout | StatsBomb source toggle:

- **Player Analysis** (merged — replaces both `/coach/player-stats` and the current
  `/coach/player-analysis`) → *my players*.
- **Team Match Insights** (`/coach/match-insights`, already source-toggled; Movement +
  Team season report tabs) → *my team*.
- **Opponent Scouting** (`/coach/opponent-scouting`) → *the opponent*.
- Movement/GPS pages (Match Movement, Player Game Report, Position Comparison, Post-match
  Recovery, Train like you Play) → the *physical* lens on a match; keep as-is.

**Performance Analytics** — physical/readiness only: Readiness Trends, Readiness Swings,
Neuromuscular Fatigue (CMJ), Force-plate, Strength Monitoring, Assessment Profile.
**Remove Player Statistics from here.** Clean split: *Performance = physical, Match Analysis
= football/tactical.*

## The merge — one "Player Analysis" page, source-toggled

Keep the route `/coach/player-analysis` as the single player page; retire `/coach/player-stats`.

- **Source toggle: Wyscout | StatsBomb** (mirror the Team Match Insights DATA toggle;
  default to whichever the team has data for, remembering the last choice).
- **Wyscout view** = today's Player Statistics content: descriptive per-player season +
  per-match football stats. Unchanged pipeline — still writes `player_season_stats
  (wyscout_excel)` + `player_match_stats`, and **still feeds the player app**.
- **StatsBomb view** = today's Player Analysis content: per-90 percentile role read,
  strengths/weaknesses, AI prose, GK variant; plus the per-match player view from the
  StatsBomb **Match Stats (per-player, both teams)** CSV → `player_match_stats` (see
  `EXPORTS-README.md`).
- **Co-locate all player uploads on this page** (provider-aware panel, like Team Match
  Insights): Wyscout player Excel, StatsBomb **Squad** CSV, StatsBomb per-player **Match
  Stats** CSV. This removes trap #2 — you upload where you read.
- Retire `/coach/player-stats` with a **301/redirect → `/coach/player-analysis?source=wyscout`**
  so existing links/bookmarks keep working.

Naming: the section entry is **"Player Analysis"**; the toggle labels are **"Wyscout"** and
**"StatsBomb"**. (If a clearer label is wanted, "Players" for the entry; keep source labels.)

## Upload locations — where each file goes (single source of truth)

The rule coaches must never have to think about: **you upload on the page that shows that
subject.** One upload panel per subject page, provider-aware (Wyscout / StatsBomb tab), with
in-app helper text naming the exact export. This table is the contract — the app, the guide,
and the empty-states must all match it.

| Export (provider) | Upload on page | Panel / tab | → target |
|---|---|---|---|
| **Wyscout** player export (Advanced Search player list) | **Player Analysis** | Wyscout | `player_season_stats (wyscout_excel)` + `player_match_stats` → also feeds player app |
| **Wyscout** Team → Stats Excel — **your** team, per match (General ± Indexes/Defending/Passing/Attacking) | **Team Match Insights** | Wyscout | `team_match_stats` |
| **Wyscout** Team → Stats Excel — **opponent**, season | **Opponent Scouting** | (opponent upload) | `scout_team_season` |
| **StatsBomb** Squad CSV (season, per player) | **Player Analysis** | StatsBomb | `player_season_stats (statsbomb_csv)` |
| **StatsBomb** Match Stats CSV (per-player, both teams — `Team`+`Player`) | **Player Analysis** | StatsBomb | `player_match_stats` |
| **StatsBomb** Team Match Stats CSV (per-match, `Match`+`Date`) | **Team Match Insights** | StatsBomb | `sb_team_match_stats` |
| **StatsBomb** Team Stats CSV — **your** team, season (`Team Name` + League Average) | **Team Match Insights** | StatsBomb → Season report | own-team profile + `league_ref` |
| **StatsBomb** Team Stats CSV — **opponent**, season | **Opponent Scouting** | (opponent upload) | `scout_team_season` + `league_ref` |
| **StatsBomb** Match Report **PDF** (per match) | **Team Match Insights** | StatsBomb | `sb_match_shots` / `sb_match_gk` / `sb_match_pass_combos` + stored PDF (see PDF brief) |

Three things this guarantees:

- **Three homes by subject:** *my players* → Player Analysis, *my team* → Team Match
  Insights, *the opponent* → Opponent Scouting. Nothing else to remember.
- **The only "which page?" subtlety** is the StatsBomb/Wyscout season **Team Stats** file:
  **your** team's goes to Team Match Insights (Season report), the **opponent's** to Opponent
  Scouting. The upload panel on each page states this in one line.
- Every upload keeps the existing four-flag auto-detection (`EXPORTS-README.md`): if a coach
  drops the wrong-grain file, the route **redirects to the right page** instead of erroring.

Each upload panel must show short helper text, e.g. on Player Analysis (StatsBomb tab):
*"Upload your StatsBomb Squad CSV (season) and/or Match Stats CSV (per player, both teams)."*

## Player app is unaffected (explicit)

Merging the **coach** pages does **not** change the player app's Wyscout pipeline. The coach
uploads Wyscout → `player_season_stats (wyscout_excel)` → player app, unchanged. The **only**
player-app change is the single-source fallback above: `/api/player/football-stats` should
prefer `wyscout_excel` and **fall back to `statsbomb_csv`** so a StatsBomb-only club's players
also see their card (see "Must work for … both"). A richer StatsBomb-specific player view is a
separate future decision, out of scope here.

## Must work for Wyscout-only, StatsBomb-only, or both (REQUIRED)

Clubs come in three shapes and **all three must fully work**:

- **Both providers** — the source toggle switches between them; nothing to worry about.
- **Wyscout only** — can upload and read all Wyscout football stats; never blocked or
  confused by StatsBomb being absent.
- **StatsBomb only** — can upload and read all StatsBomb football stats; never blocked or
  confused by Wyscout being absent.

The **source toggle must adapt to what the club has**, and every merged/consolidated page
must degrade gracefully:

1. **Detect available providers** per team (from a config flag and/or "does any
   `player_season_stats` / `team_match_stats` / `sb_*` row exist for this team, per source").
   Drive the toggle from that.
2. **Single provider → don't show a dead empty other side.** If a team has only one source,
   default the toggle to it. The other source is either hidden, or shown as a clear
   **empty-state that invites the upload** ("No StatsBomb data yet — upload your StatsBomb
   export") — never a broken table, spinner, or a view that looks like the feature is
   failing.
3. **Upload is always available for the provider(s) the club uses, independently.** A
   Wyscout-only club uploads Wyscout Excel; a StatsBomb-only club uploads the StatsBomb
   CSVs — and neither upload path is gated on the *other* provider having any data. The
   provider-aware upload panel offers exactly the tab(s) that make sense, but never refuses
   a valid single-provider upload.
4. **Every consolidated surface follows this** — the merged Player Analysis page, Team Match
   Insights (already source-toggled), Opponent Scouting, and the Season report tab. None may
   assume both providers are present.
5. **Player app for a StatsBomb-only club.** The player football card today reads only
   `source=wyscout_excel`, so a StatsBomb-only club's players would see an empty card. Make
   the player card **source-agnostic**: prefer Wyscout, **fall back to StatsBomb season
   stats** when that's all the team has, so single-source clubs get the player card too.
   (This is the one player-app change in scope, precisely to satisfy "must work for both.")

## No data-model change

This is UI + nav + upload-routing only. No new tables, no migration — `player_season_stats`
/ `player_match_stats` / `stat_player_mapping` and the `source` column already carry both
providers. The four-flag upload detection in `docs/samples/statsbomb/EXPORTS-README.md`
stays the routing contract; just make sure Squad + per-player Match Stats both land on the
merged player page's upload.

## Coach UI / house rules

Explainability-first on the merged page: verdict → 2–3 facts → "Show details"; source shown
with a provenance chip per view; jargon behind tooltips. Bilingual EN/IS via the existing
`T`-map. Keep the GPS-dependency hiding (`NO_GPS_HIDDEN_HREFS`) correct after the nav move.

## Definition of done

1. A single **Player Analysis** page under **Match Analysis** with a **Wyscout | StatsBomb**
   toggle; the Wyscout view shows the descriptive season/per-match football stats, the
   StatsBomb view shows the per-90 percentile role read + GK.
2. All player uploads (Wyscout Excel, StatsBomb Squad CSV, StatsBomb per-player Match Stats
   CSV) happen on this page; no cross-page upload remains.
3. `/coach/player-stats` retired with a redirect to `/coach/player-analysis?source=wyscout`;
   nav lists the player entry **only** under Match Analysis; Performance Analytics no longer
   lists Player Statistics.
4. **Works for single-source clubs:** verified for a Wyscout-only team, a StatsBomb-only
   team, and a both team — each can upload its provider's data and read every consolidated
   page with no dead empty views; the toggle defaults to the provider present.
5. **Player-app check:** the Wyscout pipeline is unchanged; the player football card renders
   for a Wyscout-only team **and** for a StatsBomb-only team (source-agnostic fallback).
6. No football-stat concept appears on two coach pages in two sections (dedupe verified);
   season-report surfaces route through the single "Season report" tab (per its own brief).
7. `npx eslint` clean on changed files; typecheck passes; nav renders in EN and IS with no
   dead links; nothing touches the readiness colour, load, or daily decision.

## Out of scope

- Adding StatsBomb data to the **player app** (separate product decision).
- The "Season report" tab and the button-disambiguation (own briefs:
  `season-report-brief.md`, `season-report-button-disambiguation-brief.md`).
- The StatsBomb Match Report **PDF** ingestion (`statsbomb-match-report-pdf-ingestion-brief.md`).
- Any change to the GPS/IMA movement pages beyond leaving them under Match Analysis.

## Dependencies / relationship

- Routing contract: `docs/samples/statsbomb/EXPORTS-README.md` (four-flag export detection).
- Complements the season-report and disambiguation briefs (same "source is a toggle, one
  home per subject" principle).
