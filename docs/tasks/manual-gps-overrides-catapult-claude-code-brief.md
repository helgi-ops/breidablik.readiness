# Claude Code task — a manual GPS entry must override the catapult reading everywhere (one row per player-date)

Paste to Claude Code (or `@docs/tasks/manual-gps-overrides-catapult-claude-code-brief.md`).

## Problem (verified in prod)
The coach "Handvirk GPS skráning" (manual GPS entry, for a forgot/broken pod) writes a SEPARATE
`player_external_load_daily` row with `source='manual'`, alongside the existing `source='catapult'`
row for the same (player, date). So a date can have two rows — e.g. Andri Rafn Yeoman
(`342ca30f-…`) on 2026-07-08 has `catapult` = 1 m (broken pod) AND `manual` = 2274 m (the coach's
correction). Surfaces then disagree:
- Return-to-Training read `source='catapult'` only → showed the bogus 1 m, ignored the correction.
  (Already fixed in `src/lib/micropulse/rttForPlayer.ts`: it now reads catapult+manual and prefers
  the manual row per date — reuse that pattern.)
- Other per-player reads may double-count the date or show the wrong (catapult) value, and the daily
  Catapult sync keeps re-inserting the broken catapult row on that date.

## Principle
A coach's manual entry for a (player, date) is a **correction** and must **override** the catapult
reading for that day, everywhere load is read per player. One effective row per player-date:
`manual` wins over `catapult`.

## Do both

### 1. Read-side: one shared resolver, applied at every per-player load read
Add a tiny helper and use it wherever `player_external_load_daily` rows for a player (across dates)
are turned into a per-day series:
```ts
// dedupe rows to one per date; a source='manual' row overrides source='catapult' for that date
export function oneRowPerDate<T extends { date: string; source?: string | null }>(rows: T[]): T[] {
  const byDate = new Map<string, T>();
  for (const r of rows) {
    const d = String(r.date);
    if (!byDate.has(d) || String(r.source) === "manual") byDate.set(d, r);
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
```
Apply at (grep `player_external_load_daily` under `src/app`, `src/lib`, `src/components`):
- `src/lib/micropulse/loadPlan/forTeam.ts` (`buildLoadPlanForTeam`) — it already reads
  `source in (catapult, manual)`; make sure per-player series are deduped per date (manual wins),
  not summed twice.
- The coach GPS tab / squad GPS table (the `/coach?tab=gps` list).
- Any per-player load history / ACWR / chronic baseline / Player Game Report / Match Movement /
  `player/today-recap` read.
Always SELECT `source` so the resolver can see it. Do NOT dedupe across players — this is per
player-date only.

### 2. Write-side: stop the sync from reverting a manual correction
The daily Catapult sync upserts the catapult row on (player_id,date,source) and will re-insert the
broken pod value each run. So the manual override must be durable:
- Preferred: when a `manual` row exists for (player, date), the sync should NOT write/overwrite the
  catapult row for that date (skip it), OR write it but leave the manual row as the winner. Simplest:
  in `syncCatapultDailyMetrics`, before upserting a catapult row, skip dates that already have a
  `manual` row for that player (a coach has explicitly corrected them).
- Keep the manual row tagged (it already is `source='manual'`); consider adding
  `raw_payload_json.manual_override=true` for clarity.

## Acceptance criteria
- For a (player, date) with both a `manual` and a `catapult` row, EVERY per-player surface shows the
  `manual` value and counts the date once (prove with Andri 2026-07-08 → 2274, not 1, in RTT, GPS
  tab, load history).
- Re-running the Catapult daily-sync does NOT revert a manually-corrected date back to the pod value.
- No surface double-counts a date that has two source rows.
- `npx tsc --noEmit` + `npx eslint` clean on touched files; stage specific files (no `git add -A`);
  user manages git checkpoints in VS Code.

## Related
Pair the resolver with the previous-club filter (`docs/tasks/previous-club-history-filter-claude-code-brief.md`)
— both are "which rows count, and how" concerns and can live in the same small load-selection helper.
