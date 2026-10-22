# Claude Code brief — **Automatic Season Report** ("what we do well / what to improve")

## Goal & rationale

Coaches asked for it directly: *"can the system give us a report of what we do well
and what to fix?"* Build an **auto-generated season report** for the coach's own team —
a plain-language read of **strengths, weaknesses, and things to improve**, benchmarked
against the league — that renders as a **tab on Team Match Insight** and exports to PDF.

It is the season-aggregate "zoom out" of what Team Match Insight already shows per
match: same team, same data, same coach. The output shape is already specced — the
prototype was produced by hand from real StatsBomb data and is the visual + copy
target:
- Copy/structure: `Greinar/Breidablik-season-report-statsbomb.md`
- PDF layout: `Greinar/Breidablik-season-report-statsbomb.pdf`
  (built by `scripts/build_breidablik_season_pdf.py` — reuse its layout for the PDF route)

Descriptive context only. Like the rest of Team Match Insight it must **never** touch
the readiness colour, the load, or the daily training decision (`v_coach_readiness_today_v8`
is untouched). **Rules compute the facts; any AI layer only phrases them, is labelled
"AI", and cites the signals.** Every recommendation shows the number behind it and is
coach-overridable.

## Where the data comes from (no new ingestion)

The report needs the team's **season aggregate + the built-in `League Average` row** —
i.e. the StatsBomb **Team Stats** export (see `docs/samples/statsbomb/EXPORTS-README.md`
and the StatsBomb ingestion brief). That is the *same* export and the *same*
`statsbombLeagueTeamCsv` adapter already specced for opponent scouting — just pointed at
the coach's **own** team.

- Own-team season profile: store it the same way `scout_team_season` stores a scouted
  team, but flagged as own (`is_own = true`, `owner_team_id = team`). Reuse the adapter;
  when the coach uploads their own Team Stats export on the Team Match Insight page, write
  the merged profile here and capture the `League Average` row into the shared
  `league_ref` (same reference opponent-scouting/set-piece use).
- **Do not** compute the season profile from `sb_team_match_stats` (per-match): that
  export lacks the against-side splits, OBV suite, and PPDA the report needs. Season
  report is driven by the Team Stats profile; per-match data is used **only** for the
  form-trend block (below).
- Graceful degradation: pressing metrics (PPDA, defensive distance, aggression) live in
  the *defensive-pressing* Team-Stats file. If it wasn't uploaded, mark those signals
  "not available — add the defensive-pressing export" rather than inventing them.

## Report computation — new pure lib `src/lib/micropulse/seasonReport/seasonReport.ts`

Input: the own-team season profile + the league reference (+ the team's
`sb_team_match_stats` rows for the trend). Output a `SeasonReport` object. **All
thresholds are constants at the top of the file; every flag records the metric, the
team value, the league value, and the rule that fired** (provenance is mandatory).

Blocks (mirror the prototype):

1. **Verdict (0).** One deterministic sentence built from the biggest signals — e.g.
   *"Control games and defend well, but create too little, and results are running ahead
   of the underlying numbers."* Assembled from the classified strengths/weaknesses, not
   free-text.
2. **Three supporting facts (1).** The "why" — the 2–3 largest gaps vs league with their
   numbers, visible without a click.
3. **Strengths / Weaknesses.** Classify each benchmarked metric vs league:
   - Compute a signed gap relative to league, direction-aware (for "faced/conceded"
     metrics, lower is better). Classify **strength** / **weakness** / **neutral** using a
     relative threshold (e.g. |gap| ≥ ~10–15% of league, tuned per metric family; a
     dead-band around league = neutral). Constants, documented.
   - Map each fired metric to a **plain-language statement** (a lookup keyed by metric,
     EN + IS), grouped by theme: attack / creation, defence, build-up & possession, set
     pieces. Each statement carries its number.
4. **Things to improve (priority-ordered).** For each weakness, a rule-based improvement
   prompt with the target ("move clear shots from 1.8 toward the league's 3.2"). **Order
   by importance × gap**, where importance weights come from the club's own top-4
   correlation work (`Greinar/What-puts-a-team-in-the-top-four.md`): xG difference and its
   components (goals/xG for & against) weighted highest, then possession/pressing, then
   volume metrics. Cite that as the weighting source. Each item is a labelled suggestion,
   coach-overridable, logged with a reason (audit trail).
5. **Results-vs-underlying watch (named signal).** Explicitly compute goals − xG (for and
   against). If the team is meaningfully **out-scoring its xG** (as the prototype found:
   2.06 goals on 1.38 npxG), surface a plain flag: *"results are running ahead of chance
   quality — a strength now, a regression risk if creation doesn't rise."* This is one of
   the report's most useful, non-obvious outputs; keep it as a distinct labelled signal,
   never folded silently into the verdict colour of anything.
6. **Form trend.** From `sb_team_match_stats`: per-match xG for/against, their means and
   variability (SD), and the last-5 direction (rising/falling xG difference). Plain read:
   *"attack has cooled — recent matches near 1.0 xG vs a 1.38 season mean."*
7. **Key contributors (optional, if squad uploaded).** Top attacking output, top creator,
   top defensive value from `player_season_stats` (per 90). Names for the own team are
   fine (internal report). Label the per-90 basis. Skip the block cleanly if no squad data.
8. **Confidence.** Matches in sample + which export families are present (e.g. "pressing
   metrics unavailable"). Same confidence pattern as the readiness surfaces.

Add a deterministic one-paragraph summary per block following
`src/lib/micropulse/matchInsights/narrative.ts` (rules, not an LLM). If an LLM phrasing
layer is added, it must be labelled "AI" and cite the numbers — it may rephrase, never
introduce a fact not in the computed object.

## API

`GET /api/coach/season-report?season=` → build/return the `SeasonReport` for
`owner_team_id`, auth COACH/ADMIN/STAFF, team-scoped exactly like the existing
match-insights route. Ingestion reuses the Team Stats upload path (own-team branch of
the `statsbombLeagueTeamCsv` adapter); no new upload UI beyond a provider/own-team option
on the existing Team Match Insight import panel.

## Coach UI — a tab, not a new page

Add a **"Season report"** tab alongside the existing per-match view on
`src/app/coach/match-insights/page.tsx` (Team Match Insight). Rationale for a tab over a
separate page: same team, same data source, same audience — it is the aggregate view of
the same thing. (Opponent Scouting stays a **separate** page — different subject/team +
different upload — per its own brief.)

Layout follows the prototype and the manifesto's layered read:
- **(0)** bold one-line verdict at the top.
- **(1)** the three facts + the Strengths / Weaknesses columns + the Improve list — all
  visible without a click, plain language.
- **(2)** the full benchmarked numbers table behind **"Show details" / "Hvernig á að lesa
  þetta"**, with jargon (npxG, OBV, PPDA) in tooltips.
- Bilingual EN/IS via the existing `T`-map + `PanelExplainer` pattern from
  `match-insights/page.tsx`. English default, IS toggle.
- **"Season report (PDF)"** button → a PDF route reusing the layout in
  `scripts/build_breidablik_season_pdf.py` (green STRENGTHS / red WEAKNESSES columns,
  cobalt numbers table, bone-white surface — matches the design tokens in `globals.css`).

## Disambiguation — don't let the button collide with the Movement view (IMPORTANT)

Team Match Insights already carries a **Movement (GPS/IMA)** read — auto-generated,
season-wide (e.g. "19 graded matches", sprint/total distance, second-half fade). A
floating **"Season report (PDF)"** button at the top of the page, sitting above that
Movement content, reads as *"export what I'm looking at"* — but this season report is a
different thing (StatsBomb tactical: xG, OBV, strengths/weaknesses). Two season-wide
reads on one page **will** confuse coaches unless separated explicitly. Rules:

1. **Put the PDF button inside the "Season report" tab, not floating at page top.**
   Export must always equal on-screen content. Remove/relocate any global top-right
   "Season report (PDF)" button so it can't be pressed while the Movement view is shown.
2. **Name by the question each answers** (both are season-wide, so "season" alone is
   ambiguous):
   - **Movement (GPS/IMA)** — *how we move* (sprint, total distance, second-half fade).
   - **Team season report (StatsBomb)** — *how we play* (xG, OBV, clear shots, strengths
     / weaknesses vs league).
   Tab labels and the PDF title/filename must use these distinct names.
3. **Bind the season report to the StatsBomb source + show provenance.** It reads the
   StatsBomb **Team Stats** profile (season aggregate + `League Average` row) — which
   Wyscout does not provide. Show it only under the **StatsBomb** DATA toggle, with the
   existing "AUTO-GENERATED FROM YOUR DATA" provenance badge and a "StatsBomb Team Stats"
   source line.
4. **Gate, never fall back.** If the StatsBomb Team Stats season profile is missing,
   **disable** the button/tab with a hint ("Upload your StatsBomb Team Stats export to
   generate this") — it must never silently export the Movement/IMA view or an empty PDF.
5. The Movement PDF (if one exists) and the Season-report PDF are **separate exports**
   with separate titles; never route both through one ambiguous button.

## Definition of done

1. Own-team season profile stored via the reused adapter (migration written, applied,
   committed as timestamped `.sql` under `supabase/migrations/`); `league_ref` shared with
   opponent-scouting/set-piece.
2. `seasonReport.ts` produces verdict → 3 facts → strengths/weaknesses → prioritised
   improvements → results-vs-xG watch → form trend → (optional) contributors → confidence,
   each flag carrying its numbers and the rule that fired.
3. The "Season report" tab renders all blocks in EN and IS, layered read (0→1→2), plain
   language in the primary view, jargon behind tooltips/details.
4. Every improvement shows its signal and is coach-overridable (logged with reason);
   nothing touches the readiness colour, load, or daily decision; any AI phrasing is
   labelled "AI" and cites data.
5. PDF export renders a readable one/two-page report matching the prototype, launched
   from **inside** the Season-report tab (no floating page-level button), named "Team
   season report (StatsBomb)", disabled with a hint when the Team Stats profile is absent,
   and never confusable with the Movement (GPS/IMA) view.
6. `npx eslint` clean on changed files; typecheck passes; a unit test covers
   `seasonReport.ts` (a fixture season profile → expected strengths/weaknesses/priorities,
   including the results-vs-xG path and the missing-pressing-data degradation).

## Out of scope (later)

- Auto-fetch of StatsBomb data (v1 is the manual Team Stats export upload, as today).
- Event/360-level detail (routine-level set pieces, pass maps) — StatsBomb Data API, a
  later phase in the ingestion brief.
- Anything touching readiness, load, or the daily training decision.

## Dependencies

- **StatsBomb ingestion brief** (`docs/tasks/statsbomb-ingestion-brief.md`) — the
  `statsbombLeagueTeamCsv` adapter and `league_ref` this reads from; land Phase 0 first.
- **Opponent-scouting brief** (`docs/tasks/opponent-scouting-report-brief.md`) — shares
  the `scout_team_season` store (own-team branch) and the league reference.
- **Set-piece brief** (`docs/tasks/set-piece-report-brief.md`) — the set-piece block here
  can reuse `setPieceReport.ts` rather than duplicating logic.
