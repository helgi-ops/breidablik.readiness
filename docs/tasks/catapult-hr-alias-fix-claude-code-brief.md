# Claude Code task — map Catapult's real HR field names (avg HR, zones, %HRmax)

Paste to Claude Code (or `@docs/tasks/catapult-hr-alias-fix-claude-code-brief.md`).

## Status — the diagnostic worked; this is the fix half

The capture commit (`3da774d`) is live and a Catapult sync ran on it. The `hrParamKeysSeen`
diagnostic in `integration_logs` now shows exactly what OpenField sends. It was pure naming — the
payload contains everything; the mapper's aliases just didn't match. Decisive keys, read from the
2026-07-20 sync log (a day that carried HR):

- **Average HR** → `mean_heart_rate`  (mapper's `AVG_HEART_RATE_KEYS` has every variant EXCEPT this
  one — that's the whole reason avg HR was null while max HR mapped)
- **Max HR** → `max_heart_rate`  (already matches — that's why it worked)
- **Min HR** → `min_heart_rate`
- **HR zones** → `heart_rate_band1..8_total_duration`  (Catapult uses **8 bands**, and the
  time-in-zone key is `heart_rate_bandN_total_duration`; the mapper looks for
  `hr_zone_1..5_time_s` / `hrz_N_duration`, none of which match)
- **%HRmax / %HRavg** → `percentage_max_heart_rate`, `percentage_avg_heart_rate`  (the submaximal-HR /
  HRex signal — arriving now, unmapped)
- **Per-athlete HRmax** → `athlete_max_hr` present in payload → confirms HRmax IS set on the
  athletes, so zones will compute once mapped (removes the earlier caveat)

## The 8-vs-5 decision (make it explicitly)

Catapult sends **8** HR bands; `player_external_load_daily` has **5** zone columns
(`hr_zone_1..5_time_s`). Pick ONE and note it in a comment:

- **Preferred: extend to 8** — add `hr_zone_6/7/8_time_s` columns (migration + saved `.sql` under
  `supabase/migrations/`, CLAUDE.md) and map `heart_rate_band1..8_total_duration` 1:1. Catapult's
  8-band model is the real structure; collapsing loses information and the HRex/dose-response work
  (Buchheit — time in high HR zones) specifically cares about the top bands.
- Acceptable fallback if extending is out of scope now: map bands 1–5 to the existing 5 columns and
  leave a comment that bands 6–8 are dropped pending the schema extension. Do NOT silently sum or
  reshape 8→5 — that fabricates zone boundaries.

State which you chose. Don't do both.

## Where (verified 2026-07-22)

| Thing | Location |
|---|---|
| Avg HR alias list | `lib/integrations/catapult/normalize.ts` — `AVG_HEART_RATE_KEYS` (~426) |
| Zone/other aliases | `lib/integrations/catapult/normalize.ts`, `metricCatalog.ts` (~166–193) |
| Row insert | `lib/integrations/catapult/sync.ts` (~396–423) writes `avg_heart_rate`, `max_heart_rate`, `hr_zone_1..5_time_s` |
| DB columns today | `avg_heart_rate`, `max_heart_rate`, `hr_zone_1..5_time_s` — **no** `%HRmax` or band 6–8 columns exist |

## Change

1. **Avg HR** — add `mean_heart_rate` to `AVG_HEART_RATE_KEYS`. (Also add `min_heart_rate` mapping if
   a min-HR column is wanted; optional — say if you skip it.)
2. **Zones** — map `heart_rate_bandN_total_duration` to the zone columns, per the 8-vs-5 decision
   above. Units: confirm whether Catapult sends duration in seconds or ms and convert to the column's
   seconds (the diagnostic sample or a raw row shows the value shape).
3. **%HRmax** — this is the HRex/submaximal signal and there's no column for it. Add
   `pct_max_heart_rate` (and optionally `pct_avg_heart_rate`) columns + migration `.sql`, map
   `percentage_max_heart_rate` / `percentage_avg_heart_rate`. If a schema change here is more than you
   want in this task, at minimum add the aliases behind a TODO and note that the HRex column is the
   follow-up — do not drop the finding.
4. **Null-vs-zero** — every one of these: missing → null, never 0. Same discipline as the rest.

## Acceptance

- Re-sync (or re-normalize today's captured raw rows). For a day that carried HR (e.g. 2026-07-20),
  `avg_heart_rate` and the zone columns populate for the players who wore the belt on skin.
- `max_heart_rate` and every already-populating field are unchanged — verify.
- The `hrParamKeysSeen` diagnostic still fires (keep it; it's how we'll verify future syncs).
- Any DB change has a matching timestamped `.sql` in `supabase/migrations/`.
- `npx eslint` clean on touched files; `npm test` passes. Stage specific files only.

## One thing for the human to check (not code)

The diagnostic showed the **2026-07-22** sync returning `hrParamKeysSeen: []` (empty) while
**2026-07-20** returned the full HR set — even though Andri had a real max HR on the 22nd. That
suggests the specific activity synced for the 22nd in that window didn't carry the HR band params
(wrong activity picked, or HR sat on a different activity that day). Worth confirming in OpenField
which activity on the 22nd holds the belt data, so today's session maps too — otherwise the fix will
backfill the 20th but today's jump-day HR could still look thin. This is a data/activity-selection
question, not a code bug.

## Do NOT

- Do not reshape 8 bands into 5 by summing/interpolating — extend the schema or map 1–5 and say so.
- Do not fabricate avg HR from max, or default anything to 0.
- Do not remove the `hrParamKeysSeen` / raw-capture diagnostic — it's now the standing way to see
  what Catapult sends.
- Do not touch the CMJ/VALD work, the readiness trigger, or `v_coach_readiness_today_v8`.
