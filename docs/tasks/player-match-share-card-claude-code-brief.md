# Claude Code task — shareable match card ("flex card") for players

Paste to Claude Code (or `@docs/tasks/player-match-share-card-claude-code-brief.md`).

## Goal
Give a player a one-tap **"Share"** on their match that produces a clean, club-branded
9:16 image (Instagram-story / WhatsApp) of **the three stats players already care about**:
**Top Speed · Distance · Sprints**. The most impressive of the three that match is auto-
promoted to the hero slot with a context badge (e.g. "New season best"). This is an
engagement + growth loop: every share is club-branded marketing for MicroPulse.

Scope this as an MVP: the three-stat card + auto-flex + club theming + share. Match
Movement / identity cards are a later second template — do NOT build them now.

## Where it lives
Player app, on the player's own match view:
- `src/components/player/PlayerLastMatchHeroCard.tsx` (Home → last match) — primary entry.
- `src/components/player/PlayerGameReportCard.tsx` (Game Report tab) — same button.
Add a small **"Share"** button (share icon) that opens the generated card.

## Data — use what already exists (no new metric capture)
Per (player, match date) from `player_external_load_daily` (source='catapult'):
- **Top speed** = `max_velocity` (km/h). **Clamp glitches**: ignore/clip values > 45 km/h
  (reuse the existing plausibility guard used in `src/lib/micropulse/matchMovement/index.ts`
  and `src/lib/integrations/catapult/normalize.ts` — `top = v>0 && v<=45 ? v : 0`).
- **Distance** = `total_distance` (m → show km, 1 decimal).
- **Sprints** = `sprint_distance` (m), fall back to `velocity_band6_total_distance` if null
  (mirror `gpsFingerprintOf` in matchMovement/index.ts). Show as metres.
The player game report data already assembles these — reuse `src/lib/micropulse/playerGameReport`
and `src/app/api/player/game-report/route.ts` rather than re-querying.

Match context (opponent + date): reuse whatever the game-report/last-match surface already
shows. If no opponent string is available, omit it (show just the date) — don't block.

Works for **Core/Lite (GPS) teams too** — all three fields are GPS-captured. No IMA needed.

## Club theming — already stored, just read it
`teams.club_theme_color` (hex, e.g. Afturelding `#DC1E35`) and `teams.club_logo_url`
(public Supabase Storage URL). The card must:
- Use `club_theme_color` as the accent (hero number colour, badge, top band, motion streaks).
- Render `club_logo_url` as the crest (circle, `object-fit:cover`, white bg, coloured ring).
  If the logo is null or fails to load, fall back to a coloured circle with the club initial.
- Dark base (`#111418`) so any club colour stays legible. One club → its colours automatically;
  no per-club code.

## Auto-flex — which stat gets the hero slot
Compute the player's **season bests** for each of the three metrics from
`player_external_load_daily` (max over the current season for this player: max of `max_velocity`
(clamped), `total_distance`, `sprint_distance`). Then:
1. If this match **equals the season best** for a metric → that metric is the hero, badge =
   `"New season best"` (⭐). If more than one, prefer Top Speed > Distance > Sprints.
2. Else rank each metric by `matchValue / seasonBest` and feature the highest ratio.
   Badge = `"Match high"` (📈) only if it is also this player's top-N of the season for that
   metric (e.g. top 3); otherwise no badge (just the number).
3. The other two metrics render in the supporting row.
Keep this deterministic and unit-tested (a tiny pure function `pickHeroStat(match, seasonBests)`
returning `{ heroKey, badge }`).

## Card generation (SVG → PNG)
Build the card as **pure SVG** (text, rects, the crest `<image>`), then rasterise to PNG for
sharing:
- Serialise the SVG → `data:image/svg+xml` → draw onto a `<canvas>` at 1080×1920 → `toBlob('image/png')`.
- The crest must be **CORS-clean** to avoid tainting the canvas: fetch `club_logo_url` as a blob
  and inline it as a data URL inside the SVG before rasterising (don't rely on `<img crossorigin>`).
  If the fetch fails, use the initial-circle fallback (canvas stays clean).
- Use the mockup in this repo as the visual spec — the layout, type scale, motion streaks,
  badge pill, supporting row and `MICROPULSE.IS` footer are already designed. Match it.

## Share mechanics
- Mobile PWA: `navigator.share({ files:[new File([blob],'match.png',{type:'image/png'})], ... })`
  when `navigator.canShare({files})` is true.
- Fallback (desktop / unsupported): trigger a PNG download + show the image in a modal with a
  "Save image" hint. (`toBlob` + `URL.createObjectURL` + `<a download>`.)
- Nothing about teammates is ever included. Player-initiated only.

## Edge cases
- Top speed glitch > 45 km/h → clamp (never share a 59 km/h).
- Missing crest / colour → initial-circle fallback / MicroPulse default accent.
- No GPS row for the match (indoor/away no-pod) → hide the Share button (nothing to show).
- Player with < a few matches → season-best logic still works (best = the value itself → PB
  badge on first match is fine and motivating).
- Minutes/normalisation: these are match totals (not per-90) — that's what players brag about.
  Do NOT per-90 the shared numbers.

## Files (suggested)
- `src/lib/micropulse/shareCard/pickHeroStat.ts` — pure auto-flex + season-best logic (+ test).
- `src/lib/micropulse/shareCard/renderCard.ts` — build SVG string from `{player, club, stats, hero}`.
- `src/lib/micropulse/shareCard/toPng.ts` — SVG→canvas→PNG blob + crest inlining.
- `src/components/player/ShareMatchButton.tsx` — button + modal + Web Share/fallback.
- Wire the button into `PlayerLastMatchHeroCard.tsx` and `PlayerGameReportCard.tsx`.
- Season-best fetch: extend `src/app/api/player/game-report/route.ts` to also return the
  player's season bests for the three metrics (one extra aggregate query), so the client has
  everything to pick the hero without a second round-trip.

## Constraints (repo conventions — see CLAUDE.md)
- **Explainability-first**: the badge must be true (only say "season best" when it is). The card
  cites real numbers only; no invented values.
- Default UI language **English**, with the **IS** toggle (badge/labels bilingual:
  "New season best" / "Nýtt árstíðar-met", "Match high" / "Leiks-hámark",
  Top Speed/Hámarkshraði, Distance/Vegalengd, Sprints/Sprettir).
- No DB schema change expected. If you add one, also save the `.sql` under `supabase/migrations/`.
- `npx tsc --noEmit` and `npx eslint` clean on files you touch. Unit-test `pickHeroStat`.
- Don't `git add -A`; stage specific files. User manages git checkpoints in VS Code.

## Acceptance criteria
- On a player's match with GPS data, "Share" produces a 1080×1920 PNG in the club's colour with
  its crest, showing Top Speed / Distance / Sprints, the correct hero stat auto-selected, and a
  truthful badge.
- Works for a Lite/GPS club (e.g. Afturelding `#DC1E35`) and a Pro club with different colours —
  purely from `club_theme_color` + `club_logo_url`, no per-club code.
- Glitch speeds are clamped; missing crest/colour degrade gracefully.
- Web Share on mobile; download fallback on desktop. `tsc`/`eslint` clean; `pickHeroStat` tested.
