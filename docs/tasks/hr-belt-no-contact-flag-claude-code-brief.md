# Claude Code task — flag "HR belt worn but not reading" (no skin contact) instead of showing a flat player

Paste to Claude Code (or `@docs/tasks/hr-belt-no-contact-flag-claude-code-brief.md`).

## Why — this is a real signature in today's data, not a hypothetical

The Catapult HR alias fix (migration `20260722120000`) is live and a re-sync populated avg HR,
%HRmax/%HRavg and the 8 zone bands. Reading the 2026-07-22 Breiðablik rows back, two clearly
different patterns appear:

**A working belt (Andri, worn correctly on skin):**
`avg 132, max 180, min 81, %HRmax 94.7, %HRavg 69.5`; zone time distributed
`band2 1564s, band3 1449s, band4 1032s, band5 241s, band6 1.2s`, summing to **4,288 s** — the
full session length. A physiologically sensible profile.

**A belt that logged but never read (several teammates):**
`avg NULL, max NULL, min NULL, %HRmax NULL, %HRavg NULL`, and **band1 = the entire session**
(`2,810s`, `4,289s`, `4,289s`, `1,585s` …) with every other band NULL.

That second pattern is the fingerprint of a belt that was on but whose electrodes were not making
skin contact: HR floors, so the monitor dumps the whole session into the lowest band and can't
compute a valid avg/max. The coach had already suspected some players didn't wear the electrodes on
skin — the data now proves it. **The problem is that nothing surfaces this.** The row lands with
null HR and looks identical to "no belt worn at all," so a coach can't tell "he didn't wear a
monitor" from "his monitor didn't work — go check the strap."

Per the manifesto and the existing `dataQuality.ts` doc-comment ("the system says when it does not
know"): a monitoring system that can't tell a dead signal from an absent one isn't trustworthy. This
is the same class of bug as the HK silent-IMA feed — a plausible-looking null hiding a broken sensor.

## The exact signature (be precise — do not over-fire)

Three states must stay distinct:

| State | max/avg HR | zone durations | Flag? |
|---|---|---|---|
| **Valid read** | present | distributed across bands | no |
| **Belt worn, no contact** | both NULL | logged, and **band 1 ≈ whole session** (band1 share ≥ ~0.8), other bands NULL | **yes → `hr_belt_no_contact`** |
| **No belt at all** | both NULL | **no** zone time logged (all NULL / sum 0) | no — genuine absence, not a fault |

The discriminator between the two null cases is **whether the belt logged zone duration at all**.
A belt that was never worn logs nothing; a belt worn without contact logs the full session in band 1.
Requiring **band-1-dominant** (not just "band 1 present") is what stops a normal easy session — where
a player legitimately spent most time low but still produced a valid max — from being mislabelled.

Edge case to keep SEPARATE, not fold in: if max/avg are NULL but zone time is spread across the
**middle** bands (2–5), that is NOT a no-contact signature — it's a possible mapping regression
(HR stats dropped while zones mapped). Do not classify that as `hr_belt_no_contact`; if you want,
add a distinct `hr_stats_missing_unexpected` kind for it so it's visible as its own anomaly. Don't
silently absorb it.

## Where

| Thing | Location | Note |
|---|---|---|
| Row-level checks | `src/lib/micropulse/dataQuality.ts` — `checkRow()` + `RowIssueKind` | Add the new kind here — it's the exact pattern (`impossible_velocity`, `manual_conflicts_device` …): pure, bilingual `reason`/`reasonIs`, `severity`. |
| Row check input | `RowCheckInput` interface, same file | Add the HR fields needed (below). |
| HR surface | `src/components/coach/HrLoadCrossCheckCard.tsx`, `src/lib/micropulse/hrLoad/index.ts` | Where HR already surfaces to the coach — render the flag here, don't build a new page. |
| Data-quality API | `src/app/api/coach/data-quality/route.ts` | Existing route that already serves `checkRow`/feed output — thread the new issue through it. |
| DB columns (live) | `player_external_load_daily` | `avg_heart_rate, max_heart_rate, min_heart_rate, hr_zone_1..8_time_s, pct_max_heart_rate, pct_avg_heart_rate` all exist as of `20260722120000`. |

## Change

**1. New `RowIssueKind`: `hr_belt_no_contact`** (and optionally `hr_stats_missing_unexpected` for the
edge case above). Severity **`warn`**, not `block`: the row's GPS/load/IMA are fine — only the HR
for that session is untrustworthy. The flag scopes to HR, it doesn't invalidate the whole row.

**2. Extend `RowCheckInput`** with the HR fields the check needs:
```ts
maxHeartRate?: number | null;
avgHeartRate?: number | null;
hrZoneTimesS?: (number | null)[]; // bands 1..8, so the check can compute band-1 share
```

**3. Detection in `checkRow()`** — pure, no I/O:
- `zoneSum = sum of non-null hrZoneTimesS`. If `zoneSum <= 0` → **no flag** (no belt worn; absence
  is correct, say nothing — same principle as `not_expected` at the feed level).
- If `zoneSum > 0` AND `maxHeartRate == null` AND `avgHeartRate == null` AND
  `band1 / zoneSum >= HR_NO_CONTACT_BAND1_SHARE` → push `hr_belt_no_contact`.
- Add the threshold as a named, auditable constant, e.g.
  `export const HR_NO_CONTACT_BAND1_SHARE = 0.8;` with a one-line comment citing the observed
  signature (band1 = full session, no valid max), the way `MAX_PLAUSIBLE_VELOCITY_KMH` is stated.
- **Null-vs-zero holds**: don't fabricate an HR; the flag explains the null, it doesn't fill it.

**4. Bilingual reason** (coach-readable, no jargon — match the tone already in the file):
- EN: "This player's heart-rate belt logged the whole session at its lowest reading with no valid
  pulse — the strap was on but the electrodes weren't making skin contact. The HR for this session
  isn't usable; check the strap/electrode placement."
- IS: "Púlsbeltið hjá þessum leikmanni skráði alla æfinguna á lægsta gildi án gilds púls — beltið var
  á en nemarnir náðu ekki húðsnertingu. Púlsinn fyrir þessa æfingu er ónothæfur; athugaðu
  beltið/staðsetningu nemanna."

**5. Surface — layered, minimal.** In `HrLoadCrossCheckCard.tsx`: if any player has
`hr_belt_no_contact`, the headline is the plain verdict ("N belts didn't read — check straps"), the
per-player list and the "band 1 = whole session" detail sit behind the existing detail toggle. When
HR is simply absent (no belt), stay silent — do not nag. Honest states only: valid / didn't read /
not worn.

## Acceptance

- A synthetic row with `max=null, avg=null, band1=4289, bands2-8=null` → returns
  `hr_belt_no_contact`.
- Andri's real shape (`max=180`, distributed bands) → **no** flag.
- A row with all HR null AND all zones null (no belt) → **no** flag (absence, not fault).
- A row with `max=null` but zones spread across bands 2–5 → **not** `hr_belt_no_contact` (either no
  flag, or the separate `hr_stats_missing_unexpected` if you added it) — prove it doesn't misfire.
- Unit tests cover all four, and both `reason`/`reasonIs` strings exist and are non-empty.
- `npx eslint` clean on touched files; `npm test` passes. Stage specific files only.

## Do NOT

- Do not flag a row that logged **no** zone time — that's a belt not worn, and nagging about it every
  day is the trust-corroding false positive `dataQuality.ts` already warns against (`not_expected`).
- Do not fabricate or impute an HR value for a no-contact row — missing → null, the flag is the
  output, not a filled number.
- Do not change the readiness trigger, `v_coach_readiness_today_v8`, or the HR mapper/aliases just
  shipped — this reads the already-stored columns, it doesn't touch ingest.
- Do not raise severity to `block` — the session's non-HR load is valid and must still count.
```
