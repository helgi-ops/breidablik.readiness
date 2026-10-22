# Claude Code brief — **StatsBomb Match Report (PDF) ingestion**

## Verdict first: worth doing — but narrowly, for PDF-only signals

The StatsBomb IQ **"Game Team Analysis"** download is a 25-page per-match **Match
Report (Version 1.1)** PDF (example on file: *Thor Akureyri v Breidablik, 2026-08-04*).

> **Scope change (important).** The per-player appendix data (pages 21–24: shots/KP,
> passing/touches, defensive actions, xGChain) is **also available as a clean CSV** — the
> **"Match Stats (per-player, both teams)"** export (`… - Match Stats.csv`, 57 col, `Team`
> + `Player`, ~40 rows = both squads), which is richer (full OBV suite + counterpressures)
> and far more reliable to ingest than PDF parsing. **`player_match_stats` should be filled
> from that CSV, not from this PDF** (see `EXPORTS-README.md`). This brief is therefore
> narrowed to the signals the CSV does **not** carry.

**What the PDF uniquely provides (parse only these):**

- **Post-Shot xG** (goalkeeping / finishing quality) — page 8. Not in any CSV.
- **A shot-by-shot event log** — player, shot type, xG, minute, period, cumulative xG —
  page 6 (a real in-app race chart / chance timeline). Not in any CSV.
- **Pass combinations** (passer→receiver with passes & xG) — page 10. Not in any CSV.
- The **image pages** (heatmaps, pass-network plots, shot/defensive maps) — stored, not
  parsed.

So the recommendation: **a small Match Report PDF adapter** that extracts pages **6, 8 and
10**, plus **stores the PDF** as a viewable attachment for the image pages — and nothing
else. The `player_match_stats` appendix parsing is dropped in favour of the CSV.

**Honest scope.** It is a PDF, so even this narrow extraction is table-parsing, more
brittle than CSV. Pin to the "Match Report Version 1.1" layout, validate columns, fail
safe. Where a field also exists in a CSV, **CSV stays the source of truth** (see
`EXPORTS-README.md`). The pitch plots, heatmaps, pass-network diagrams and per-player event
maps are **images, not data** — do not parse them; keep the PDF so a coach can open them.

## What's in the file (page-by-page inventory)

**Parse these (PDF-only signals):**

| Page | Section | Data | → target |
|---|---|---|---|
| 6 | Race Chart — Data | shot log: player, shot-type/detail, xG, cumulative xG, period, minute, goal flag (both teams) | **`sb_match_shots`** (new) |
| 8 | Goalkeeper: Shots Faced | per keeper: shots faced, SoT, goals, off-target, blocked, **Total xG + Post-Shot xG** | **`sb_match_gk`** (new) |
| 10 | Pass Networks — Data → **Common Combinations** + **Passing xG** | passer, receiver, passes, xG | **`sb_match_pass_combos`** (new) |

Page 7 (shot-type split, Top-5 shooters/key passers) can be **derived** from `sb_match_shots`
+ the per-player Match Stats CSV — don't parse the pitch image.

**Do NOT parse from the PDF — the CSV covers these** (use the *Match Stats (per-player, both
teams)* CSV → `player_match_stats`):

- Pages 21–24 (appendix: shots/KP, passing/touches, defensive actions, xGChain/xG-buildup).
- Pages 13–14 (pressures + gegenpressing by player) — the CSV has `Pressures …` and
  `Counterpressures …` columns already.
- Page 4 (team match line) — `sb_team_match_stats` from the per-match Team **Match Stats**
  CSV is the source of truth.
- Page 10's **xGChain** table — also in the CSV; take only the pass **combinations** from the PDF.

**Image-only pages (store, don't parse):** 1 title, 5 race-chart visual, 9 pass-network
plot, 12 pressures locations + duration heatmap, 15 actions-under-pressure, 16–20 per-player
shot-map + defensive-activity maps. Page 25 is the glossary (use it to label metrics/tooltips).
Pages 2/11 (lineups, subs) are optional lineup data, low priority.

## Ingestion approach

- **Parser:** `pdfplumber` (text + `extract_tables`) is the right tool — these are real
  text tables, so no OCR. Add a `statsbombMatchReportPdf` adapter under `statsIngestion/`.
- **Fingerprint before parsing:** confirm it's this report — header text `MATCH REPORT` +
  footer `Statsbomb Match Report Version 1.1`. Capture the two team names (orange = home,
  teal = away banner) and the date from the title block. If the version string doesn't
  match, **reject with a clear message** rather than mis-parsing.
- **Section anchors:** locate each table by its page heading (`MATCH STATISTICS`,
  `RACE CHART - DATA`, `GOALKEEPER: SHOTS FACED`, `PASS NETWORKS - DATA`, `APPENDIX,
  PLAYER STATS` + sub-title, etc.), not by page number — page numbers shift if StatsBomb
  changes the layout. Each extracted table validates its expected column header set; a
  missing/renamed column fails that section (and is reported) without failing the whole file.
- **Team attribution:** the appendix and data pages are two side-by-side tables (home left,
  away right). Split on the column midpoint / the team banner; attribute every player row to
  home or away, and tag `is_own` for `owner_team_id`.
- **Player identity:** map names to `stat_player_mapping` (the existing `(team_id,
  source_player_ref)` mapping) with the same fuzzy/Icelandic-fold matching used for the CSV
  player ingest; unmatched names are surfaced in the preview for the coach to confirm, never
  silently dropped or merged.
- **Idempotent upsert** keyed on `(match, team, player)` for player rows and `(match, team,
  shot_index)` for the shot log, so re-uploading the same report refreshes, never duplicates.
- **Store the PDF** itself (Supabase storage) with `match_report_pdf_url` on the match, so
  the coach can open the image-only pages (heatmaps, pass networks, per-player maps).

## Source-of-truth rules (avoid double-writing)

- **Team match line (page 4):** `sb_team_match_stats` from the per-match **Match Stats CSV**
  remains source of truth. Use the PDF's page-4 numbers only to fill a match with no CSV, or
  for the few fields the CSV lacks — never overwrite CSV-sourced rows.
- **Player match stats:** the PDF is the **primary** filler of `player_match_stats` today
  (nothing else populates it). If a per-player CSV is later added, prefer CSV per the
  four-flag routing in `EXPORTS-README.md`; the PDF adapter tags its rows `source:
  "statsbomb_match_report"` so provenance is explicit.
- **New event tables** (`sb_match_shots`, `sb_match_gk`, `sb_match_pass_combos`) have no CSV
  equivalent — the PDF is their only source.

## Data model (new Supabase tables; migrations saved as timestamped `.sql`)

- `sb_match_shots(id, owner_team_id, match_ref, match_date, team, is_own, player_ref,
  minute, period, shot_type, xg, post_shot_xg NULL, cumulative_xg, is_goal, created_at)`
- `sb_match_gk(id, owner_team_id, match_ref, team, is_own, keeper_ref, shots_faced, sot,
  goals, off_target, blocked, total_xg, post_shot_xg)`
- `sb_match_pass_combos(id, owner_team_id, match_ref, team, is_own, passer_ref,
  receiver_ref, passes, xg)`

`player_match_stats` is **not** extended by this adapter — the *Match Stats (per-player, both
teams)* CSV fills it (its own brief/route). RLS-scope the three tables above to
`owner_team_id`; save every migration as `.sql` under `supabase/migrations/`.

## What it unlocks in the app (rules compute, AI explains, never a verdict)

All descriptive; nothing touches the readiness colour, load, or daily decision.

- **Finishing & goalkeeping quality** — goals vs xG vs **post-shot xG** per match and per
  player (the shot log + GK table): "created 1.71 xG, 1.53 post-shot on target, scored 1 —
  keeper over/under-performed by X." A genuinely new, coach-friendly read.
- **In-app race chart / chance timeline** from `sb_match_shots` (the page-5 visual becomes
  live data, not a picture).
- **Who links with whom** — pass combinations for a simple connection view.

(Per-match player stats — shots, KP, xGChain, passing, defensive actions, pressing +
gegenpress — come from the *Match Stats (per-player, both teams)* CSV, which fills the Player
Statistics per-match tab and the season trend. That CSV, not this PDF, is the source there.)

Explainability-first wherever surfaced: verdict → 2–3 facts → "Show details" tables; jargon
(post-shot xG, xGChain, gegenpress — all defined on the report's page-25 glossary) behind
tooltips; bilingual EN/IS; every figure cites `source: "statsbomb_match_report"`.

## Definition of done

1. `statsbombMatchReportPdf` adapter fingerprints the report, extracts pages **6, 8, 10**
   (shot log, GK post-shot xG, pass combinations) with per-section column validation, splits
   home/away, maps players, and previews before commit; re-upload is idempotent.
2. Migrations for `sb_match_shots`, `sb_match_gk`, `sb_match_pass_combos` written, applied,
   committed as `.sql`. (`player_match_stats` is filled by the CSV route, not here.)
3. The shot log, post-shot xG and pass combos load into their tables; the PDF is stored and
   openable for the image pages.
4. The adapter does **not** write team or player match stats (those come from CSV); its rows
   carry `source: "statsbomb_match_report"`.
5. Unmatched player names are surfaced in preview, never silently dropped/merged; a
   version-string mismatch is rejected with a clear message; a missing column fails only its
   section and is reported.
6. `npx eslint` clean on changed files; typecheck passes; a unit test runs the sample PDF
   (*Thor Akureyri v Breidablik*) through the adapter → expected row counts and spot-checked
   values (e.g. Arnar Bjarki Gunnleifsson shot xG 0.88; Thor keeper post-shot xG on target
   ≈ 1.53).

## Out of scope (v2 / Data API)

- Parsing the image pages (heatmaps, pass-network plots, shot/defensive maps) into data —
  those need the event/360 Data API (later phase of the StatsBomb ingestion brief). v1 keeps
  the PDF viewable for them.
- Automated fetch (v1 is a manual PDF upload, like every other StatsBomb import today).
- Anything touching readiness, load, or the daily training decision.

## Dependencies / relationship

- Complements `docs/tasks/statsbomb-ingestion-brief.md` (CSV exports) — this is the
  **per-match PDF** counterpart; routing/provenance follow `docs/samples/statsbomb/
  EXPORTS-README.md`.
- Feeds the Player Statistics per-match view and the season-report/opponent-scouting libs
  with real per-match player data for the first time.
