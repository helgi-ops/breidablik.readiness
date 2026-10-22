# Claude Code task — Automatic basketball stats ingestion (KKÍ / baskethotel)

Paste to Claude Code (or `@docs/tasks/basketball-stats-ingestion-claude-code-brief.md`).
Read `@docs/research/basketball-stats-sources.md` first — it has the verified source findings.

## Goal (and the one-line why)

Bring Icelandic top-flight basketball (KKÍ *Bónus deild karla*) per-player stats into MicroPulse
**fully automatically — zero coach effort**, so a basketball team can be tracked the same way football is.
No uploads, no logins for the coach.

## Confirmed source (verified live 2026-07-30)

KKÍ's stats on kki.is are rendered by **MBT / baskethotel** widgets. There is a **public GET data endpoint
with the api key embedded in the page** — reachable server-side with no login:

```
https://widgets.baskethotel.com/widget-service/show?api=a0d07178160bf749eb6e5e761fc623fe42e2bb57
  &lang=is&request[0][widget]=<WIDGET_ID>&request[0][param][season_id]=<SEASON_ID>&...
```

Verified via the deployed probe function `basketball-probe`: server-side GET (with header
`referer: https://www.kki.is/`) returns **HTTP 200**, ~13 KB. Bónus deild karla 2025-2026 `season_id=130403`;
men's top league id seen as `190`. Widget IDs seen: `303` (games list / full view). The response is
**MBT.API widget HTML/JS, NOT clean JSON** — the framework then renders box-score tables.

**So this is HTML-widget parsing, not a clean feed.** Budget for that.

## Pipeline (scheduled edge function — mirror `apifootball-sync`)

1. **Discover games:** call the games-list widget for the season → parse out game IDs + dates + teams +
   final scores. (Filter to the tracked team.)
2. **Per finished game:** call the game box-score / `GAME_FULL_VIEW` widget → parse the per-player box-score
   HTML table: `MIN, PTS, FG (m/a), 3P (m/a), FT (m/a), OREB, DREB, REB, AST, STL, BLK, TO, PF, +/-, EFF`.
3. **Map players** to MicroPulse `players` (name-normalise like the Wyscout matcher: strip Icelandic
   diacritics; keep a persisted mapping; unmatched → `player_id=null`, surfaced, never guessed).
4. **Store** per-game rows in a `player_basketball_match_stats` table (core cols + `stats jsonb` catch-all,
   `source='baskethotel'`, `source_ref=game_id`, unique on team+game+player), and roll up a season view.
5. **Schedule** daily / after game nights (pg_cron or Supabase scheduled function). Secure it (verify_jwt or
   cron secret) — the current `basketball-probe` is open and temporary; delete it.

## Gates & honesty (manifesto)

- Provenance on every stat (`source`, `synced_at`). Descriptive context only — **never touches the readiness
  verdict / daily decision.** No-data ≠ zero. Bilingual EN/IS, English default.
- Robust parsing: MBT widget HTML can change; tolerate missing columns, keep the raw box-score row in `stats`
  jsonb so nothing is lost. Unit-test the parser against a saved widget-HTML fixture.

## Where to build

- Pure parser under `lib/micropulse/basketballStats/` (widget-HTML → normalized rows; no IO; tested against a
  fixture captured from `basketball-probe`).
- Scheduled edge function `basketball-sync` reading the widget-service, mapping players, upserting.
- Migrations saved under `supabase/migrations/` (CLAUDE.md). `npx eslint` clean; stage specific files only.

## Acceptance

- Running the function for `season_id=130403` produces `player_basketball_match_stats` rows for real
  Bónus deild karla games, mapped to `players`, idempotent on re-run.
- A per-player view shows basketball box-score stats; nothing touches the readiness colour.
- Coach does nothing — data appears on schedule.

## Cheaper-to-build alternative (flag to the user, don't assume)

If HTML-widget parsing proves brittle, a **clean JSON feed** (baskethotel/Genius Sports data API, or Hudl
InStat Basketball on the club's existing Hudl contract) removes the parsing entirely — paid, quote-only.
Recommend the user ask their Hudl rep before investing heavily in the scraper.

## Do NOT

- Do not require any coach upload/login — this must be server-side automatic.
- Do not hardcode widget HTML column positions rigidly — map by header, keep raw row in jsonb.
- Do not let basketball stats influence readiness/decisions.
- Do not leave `basketball-probe` (open endpoint) in production — replace with the secured `basketball-sync`.

---

## VERIFIED endpoint spec (captured live 2026-07-30 — build against this)

All confirmed **server-side, HTTP 200, no login** via the deployed `basketball-probe` function
(`referer: https://www.kki.is/` header set). Provider: MBT/baskethotel, data by **Genius Sports**. Response
encoding is **windows-1252** (decode before parsing — Icelandic chars).

Base: `https://widgets.baskethotel.com/widget-service/show?api=<PUBLIC_KEY>&lang=is&request[0][widget]=<W>&request[0][param][season_id]=<S>...`
Public key (embedded in kki.is): `a0d07178160bf749eb6e5e761fc623fe42e2bb57`. 2025-2026 Bónus deild karla `season_id=130403`.

**Widget IDs / calls:**
- `widget=303` → **games list** for a season → parse rows for `game_id`, date, teams, final score.
- `widget=400` + `param[game_id]=<id>` → **game card** (info + the full **stat legend/glossary**).
- `widget=400` + `part=boxscore` + `param[game_id]=<id>` + `param[season_id]=<S>` → **per-player box score
  table** (both teams). VERIFIED: 53 KB, real player rows, `player_id="…"` and `team_id="…"` attributes
  embedded (use these as stable `source_player_ref` / team keys — better than name matching).
- Other `part` values on widget 400: `play_by_play`, `game_development`, `shot_chart`, `advanced_stats`.

The response is `MBT.API.update('view1', '<escaped HTML>')` — unwrap the single-quoted HTML string, unescape,
then parse the `<table class="mbt-table mbt-complex">` rows.

**Box-score column glossary (Icelandic abbrev → meaning), straight from widget 400:**
`MIN`=mínútur · `PTS`=stig · `2P`=2ja-stiga (A attempts / M made / %) · `3P`=3ja-stiga (A/M/%) ·
`FT`=vítaskot (A/M/%) · `REB`=fráköst with `O`=sóknar, `D`=varnar, `T`=samtals · `AS`=stoðsendingar ·
`ST`=stolnir · `BS`=varin skot · `TO`=tapaðir · `PF`=villur (`CM`=fengnar, `RV`=sóttar) · `EFF`=skilvirkni ·
`+/-`=plús/mínus.

**Fixtures for parser tests:** call the probe with `&raw=1` to fetch live HTML, e.g.
`…/functions/v1/basketball-probe?widget=400&game_id=6146419&part=boxscore&season_id=130403&raw=1`
(games list: `?widget=303&season_id=130403&raw=1`). Save one of each as a `__fixtures__` file and pin the parser.

**Pipeline is thus:** games-list(303) → for each finished game, boxscore(400/boxscore) → parse table →
map by embedded `player_id` → upsert `player_basketball_match_stats` (+ season rollup). Fully server-side,
zero coach effort. Delete `basketball-probe` and ship a secured `basketball-sync` for production.
