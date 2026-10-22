# Claude Code task — close the last two CMJ mapper aliases (eccentric duration + time-to-takeoff)

Paste to Claude Code (or `@docs/tasks/cmj-mapper-alias-fix-claude-code-brief.md`).

## Status — this is the last mile, not a rebuild

The Breiðablik squad performed a real CMJ session today (2026-07-22): **25 tests, all 25 players**.
The endpoint fix (`5a3c2af`) worked and over-delivered. Verified in `vald_forcedecks_results` for
today's rows:

| Field | Populated today |
|---|---|
| rsi_mod | 25/25 ✅ |
| jump_height_cm | 25/25 ✅ |
| peak_power_w | 25/25 ✅ |
| peak_force_n | 25/25 ✅ |
| concentric_impulse_n_s | 25/25 ✅ |
| concentric_duration_ms | 25/25 ✅ |
| asymmetry_percent | 25/25 ✅ |
| **eccentric_duration_ms** | **0/25 ✗** |
| **time_to_takeoff_ms** | **0/25 ✗** |

Only two fields are still null, and it is a **mapper alias mismatch**, not missing data. The full
phase battery is in the payload now — confirmed by inspecting `vald_raw_tests.payload →
trials[].results[]` for today's tests.

## The exact VALD result keys (read from today's real payload)

The mapper's current aliases don't match what VALD actually sends for these two:

| Column | Mapper looks for (normalizers.ts) | VALD's ACTUAL key (name) | Fix |
|---|---|---|---|
| `eccentricDurationMs` | `TRIAL_ECCENTRIC_DURATION`, `TRIAL_BRAKING_DURATION`, `EccentricDuration` | **`ECCENTRIC_TIME`** ("Eccentric Duration") | add `ECCENTRIC_TIME` |
| `timeToTakeoffMs` | `TRIAL_TIME_TO_TAKEOFF`, `TimeToTakeoff` | no takeoff-time key exists; **`CONTRACTION_TIME`** ("Contraction Time") is movement-start→takeoff | add `CONTRACTION_TIME` as the proxy |

Note: RSI-modified still works without `timeToTakeoffMs` because VALD sends RSI-mod precomputed — so
this fix is for the phase CV gate (which wants eccentric duration + a contraction-time proxy), not
for RSI.

## Why concentric populated but eccentric didn't (check before editing)

`concentric_duration_ms`, `peak_force_n`, `concentric_impulse_n_s` all populated 25/25 even though
their mapper aliases are `TRIAL_`-prefixed and VALD's keys are not (`CONCENTRIC_DURATION`,
`PEAK_TAKEOFF_FORCE`, `POSITIVE_TAKEOFF_IMPULSE`). That means `buildParamMap` (in normalizers.ts) is
already normalizing most VALD keys to the `TRIAL_` forms the mapper expects — but the normalization
has no entry for `ECCENTRIC_TIME` or `CONTRACTION_TIME`. So decide the fix at the **right layer**:
- If `buildParamMap` holds a key-normalization table, add `ECCENTRIC_TIME → TRIAL_ECCENTRIC_DURATION`
  and `CONTRACTION_TIME → TRIAL_TIME_TO_TAKEOFF` there (consistent with how the others are handled).
- Otherwise add the raw keys directly to the mapper's `paramValue([...])` alias lists.

Pick whichever matches the existing pattern — don't introduce a second mechanism.

## VALD's own typo — guard against it

VALD misspells "BRAKING" as **"BEAKING"** in two of its own result keys:
`BEAKING_CONCENTRIC_DURATION_RATIO` and `BEAKING_CONTRACTION_DURATION_RATIO`. The correctly-spelled
`BRAKING_PHASE_DURATION`, `ECCENTRIC_BRAKING_IMPULSE`, `ECCENTRIC_BRAKING_RFD` are separate keys and
spelled right. If any mapping ever needs those ratio keys, match the typo `BEAKING`, not `BRAKING`.
Leave a one-line comment noting this so it isn't "fixed" later and silently broken.

## Also now available (for the phase-metrics work, not required here)

The endpoint fix means these fatigue-sensitive phase metrics from the CV-gate brief are now arriving
in the payload and can be mapped when that work lands: `ECCENTRIC_BRAKING_IMPULSE`,
`ECCENTRIC_BRAKING_RFD`, `ECCENTRIC_DECEL_IMPULSE`, `TIME_TO_BRAKING_PHASE`, `TIME_TO_PEAK_FORCE`
("Concentric Time to Peak Force"), `PEAK_ECCENTRIC_FORCE`, `FLIGHT_CONTRACTION_TIME_RATIO`. Out of
scope for this alias fix — noted so the `phaseChange.ts` CV metrics have real keys to bind to.

## Change

Add the two aliases (at the correct layer per the check above). Nothing else.

## Acceptance

- Re-run a VALD sync (or re-normalize today's stored raw tests). `eccentric_duration_ms` and
  `time_to_takeoff_ms` populate for the 25 tests from 2026-07-22.
- The `resultKeysSeen` diagnostic already on the row confirms `ECCENTRIC_TIME` and `CONTRACTION_TIME`
  were present in the payload (they are — verified).
- No change to the 7 fields already populating; RSI unchanged.
- `npx eslint` clean on touched files; `npm test` passes. Stage specific files only.

## Do NOT

- Do not touch the endpoint fetch — it's delivering the full set correctly.
- Do not add the broader phase metrics here; that's the CV-gate brief's job. This is two aliases.
- Do not "correct" VALD's `BEAKING` typo in any key you match against it.
