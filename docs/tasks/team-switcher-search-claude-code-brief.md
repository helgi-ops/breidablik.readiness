# Claude Code task — searchable, scrollable TeamSwitcher (P1, UX)

Paste to Claude Code (or `@docs/tasks/team-switcher-search-claude-code-brief.md`).

## Problem
`src/components/coach/TeamSwitcher.tsx` lists **every** team the coach belongs to in one dropdown.
For an admin with ~83 club teams this is unusable: no search box, no scroll cap (the dropdown has
`min-w-[220px]` but **no `max-height` / `overflow-y-auto`**, so the list overflows the screen), and
same-named teams (e.g. two "HK" — men and women) look near-identical because gender is only a small
right-aligned label. Net effect: the coach can't reliably find/switch to a specific team (e.g. HK men).

The data and access are correct (both HK teams are in `coach_teams`); this is purely a client-side
UX fix. **No DB change, no access change, no endpoint change.**

## Changes to `src/components/coach/TeamSwitcher.tsx`

1. **Add a search box** at the top of the open dropdown:
   - Controlled `query` state; filter teams case- and diacritic-insensitively against the team `name`
     AND its sport/gender label (so typing "hk", "karla", "HK men" all work). Reuse the existing
     `sportLabel` / `genderLabel` from `@/lib/teamLabels` to build the searchable string.
   - Autofocus the input when the dropdown opens; reset `query` to "" when it closes.
   - Bilingual placeholder via `useLang`: IS "Leita að liði…", EN "Search team…".
   - Keep the existing PT vs club grouping, but apply the filter to both groups; hide a group header
     when its filtered list is empty. Show a small "Ekkert lið fannst / No teams found" line when the
     whole filtered result is empty.

2. **Make the dropdown scrollable**: add `max-h-[70vh] overflow-y-auto` (and keep it above other
   content) so long lists scroll instead of overflowing the viewport. Keep the search box pinned at
   the top (it can stay inside the scroll container, or make the input sticky — either is fine).

3. **Show gender clearly on the club rows** so two same-named teams are distinguishable at a glance.
   Keep the name, and render the sport·gender label (already present on the right) — but ensure it is
   **always shown** and legible; optionally also append the gender to the name, e.g. render
   `HK` with a muted ` · karla` / ` · konur` suffix or a small pill. Use `genderLabel(t.gender, lang)`;
   don't hardcode Icelandic.

4. **Keep** the current behaviors: fetch from `coach_teams` + `teams` as-is; primary-team-first sort
   (apply after filtering); `if (!loaded || teams.length <= 1) return null`; the current-team highlight;
   the trigger button showing the active team's name + icon.

## Constraints
- Tailwind core utilities only; no new dependencies; `"use client"` stays.
- Bilingual through the existing `useLang` pattern.
- `npx tsc --noEmit` clean; `npx eslint src/components/coach/TeamSwitcher.tsx` clean.
- Don't touch the data layer, RLS, `coach_teams`, or `/api/coach/teams`.

## Acceptance criteria
- Opening the switcher shows a search box; typing "HK" narrows to the two HK teams, each clearly
  labelled men vs women; picking one switches to it.
- With 80+ teams the list scrolls within the viewport (no off-screen, unreachable items).
- EN/IS both correct; tsc + eslint clean.
