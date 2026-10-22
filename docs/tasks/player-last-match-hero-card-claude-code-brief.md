# Claude Code task — "Your last match" hero card on the player Home (engagement)

Paste to Claude Code (or `@docs/tasks/player-last-match-hero-card-claude-code-brief.md`).

## Goal
Add ONE small, celebratory **"Your last match"** hero card to the **player Home** so players open the
app more often to see their match physical output. Keep it minimal — the deep detail already has a
home. This is progressive disclosure (glance on Home → detail one tap away), matching the
explainability-first layered read. **Do not stack the full report on Home.**

## Where it goes (exact)
- **Home = the `today` tab** in `src/app/player/PlayerTabbedClient.tsx` (the bottom-nav `today` /
  IconHome tab). Render the card near the top of the `today` content (e.g. just under the greeting /
  readiness, above the session) — or as one of the existing `today` portals if that pattern is cleaner.
- The **"See full report →"** action switches to the **existing `gamereport` tab**
  (`setActiveTab("gamereport")` — the tab already exists, minTier "free", IconReport). Do NOT build a
  new page/tab; the deep match report + `PlayerMatchMovementCard` already live on `gamereport`.

## What the card shows (keep it tiny — hero + ≤3 lines)
- **Hero stat:** top speed from the player's most recent match with GPS, big (e.g. `31.8 km/h`).
- **PB badge:** if it's a season-best top speed, show a small "Season best" / "Árstíðar-best" pill.
  Reuse the existing Personal-Records / PR logic (there is already a PR engine — do not reinvent).
- **One plain sentence:** e.g. "You covered 10.3 km and hit 31.8 km/h against Fylkir." Include
  opponent + home/away if available; otherwise omit gracefully.
- **"See full report →"** link → `gamereport` tab.
- Nothing else. No radars, no dimension bars, no tables on Home.

## Data
- Reuse the **same data source that already powers the player `gamereport` tab / `PlayerMatchMovementCard`**
  (find its endpoint under `src/app/api/player/…` or wherever the player game-report fetch lives).
  Take just: last match date, opponent (if present), minutes, distance, top speed, and a season-best flag.
- If a lightweight "last match summary" isn't already exposed to the player, add a tiny read-only field
  to the existing player game-report endpoint rather than a whole new endpoint.
- **Scope to the player's own data only** (the player surface already enforces this — don't widen it).

## Rules / edge cases
- **Only render if** the player has ≥1 match with GPS this season. If none, **hide the card** (no empty state).
- If the last match had **no GPS** (indoor/away without vests), either skip to the last match that did,
  or hide — never show a blank/000 hero.
- **Tone:** celebratory and informational, never competitive/ranking ("you were slowest" etc.).
- **Bilingual** (EN/IS) via the player app's existing lang pattern.
- **Mobile-first** (PWA): one compact card, hero number prominent, tap target for "See full report".

## Constraints
- Tailwind core only; reuse existing player card styling so it matches Home.
- No new dependency. No DB migration if the data already exists; if you must expose one field, a small
  read-only addition to the existing player game-report endpoint is fine (no schema change).
- `npx tsc --noEmit` clean; `npx eslint` clean on changed files.

## Acceptance criteria
- The `today` tab shows one small "Your last match" card with a top-speed hero, optional PB pill, one
  plain sentence, and a working "See full report →" that switches to the `gamereport` tab.
- Card is hidden when the player has no GPS match data (no empty card).
- Home is not visibly heavier — it's one compact card, not a report.
- Player sees only their own data; EN/IS both correct; tsc + eslint clean.
