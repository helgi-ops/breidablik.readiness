# Claude Code task — capture Catapult's raw payload so we can see why avg HR + HR zones don't arrive

Paste to Claude Code (or `@docs/tasks/catapult-hr-capture-diagnostic-claude-code-brief.md`).

## The situation (verified 2026-07-22)

Breiðablik ran a real HR-belt session today. In `player_external_load_daily` for today's 19 rows:

| Field | Populated |
|---|---|
| `max_heart_rate` | 14/19 (values 99–180, plausible) |
| `avg_heart_rate` | **0/19** |
| `hr_zone_1..5_time_s` | **0/19** |

Two separate things are going on, and only one is a code matter:

1. **5 of 19 got no HR at all** — consistent with those players not having the vest electrodes on skin. That's a hardware/usage matter for the club, not code. (Andri Yeoman, the player who definitely wore it correctly, got `max_heart_rate = 180`.)
2. **avg HR + zones are null for ALL 19, including the correctly-worn vest.** So this is NOT skin contact and NOT a Reporting-Parameters gap — the club confirmed **all HR parameters are enabled in OpenField Reporting Parameters.** Max HR maps; avg HR and zones don't, despite the mapper having comprehensive aliases for all of them (`metricCatalog.ts` ~154–193, `normalize.ts` ~426+).

## Why we're stuck, and the one thing that unblocks it

I cannot tell whether avg HR / zones are (a) arriving under a parameter name the normalizer's alias list doesn't match, or (b) not in the API response at all (a reduced stat-set, like the VALD thin-payload issue we just fixed) — **because the raw Catapult payload is not persisted.**

`sync.ts` (~396) writes `raw_payload_json: row.rawPayload ?? null`, but `row.rawPayload` is never populated — the normalize step doesn't attach the source payload to the row (`rawPayload?: unknown` in `types.ts` ~287 is optional and unset). So `raw_payload_json` is null for every row and there's nothing to inspect.

This is the exact debugging path that worked for VALD: once we could see the real result keys (`ECCENTRIC_TIME`, `CONTRACTION_TIME`), the fix was obvious. Do the same for Catapult.

## Change

**1. Persist the raw payload.** In the Catapult normalize/sync path, carry the per-row source payload through to `row.rawPayload` so the existing `raw_payload_json` column actually stores it. Keep it scoped to what's needed to see parameter names — the per-activity parameter object is enough; don't bloat the row with the entire multi-activity response if a slice suffices.

**2. Diagnostic — log the distinct parameter keys seen.** Mirror the VALD `resultKeysSeen` pattern: per sync run, record the set of parameter names actually present in the Catapult response (into the sync summary / `integration_logs`, or a debug field). This gives a one-line answer to "what does OpenField actually call avg HR and the zone durations?" without a DB dig.

**3. Nothing else yet.** Do NOT guess new aliases or change the API request in this task. The point is to *see* the payload first. Once a sync has run with capture on, the follow-up is one of:
   - a small alias addition in `metricCatalog.ts` / `normalize.ts` if avg HR / zones are present under an unmatched name, OR
   - an endpoint/stat-set change if the response genuinely omits them (the VALD pattern).

Leave a short comment at the persist site noting this so the follow-up is obvious.

## Acceptance

- After deploy + one Catapult sync, `raw_payload_json` is populated for new rows and the sync log lists the distinct parameter keys seen.
- No change to any currently-populating field (max HR, player load, IMA, etc.) — verify.
- `raw_payload_json` capture is bounded (no unbounded blobs); PII/privacy unchanged — it's the same athlete load data already stored, just retained raw.
- `npx eslint` clean on touched files; `npm test` passes. Stage specific files only.

## Note for the human (separate from code)

HR **zones** additionally require a **per-athlete HRmax set in OpenField** (the athlete profile, not just Reporting Parameters) — the zones are computed as % of that max, so with no HRmax the zone durations stay empty even with the parameters enabled. Avg HR does **not** need this, which is why avg HR is the cleaner diagnostic: it should arrive with the parameters on. Worth confirming an HRmax is set on the athletes before reading too much into empty zones.

## Do NOT

- Do not fabricate avg HR or zone values, and do not derive avg HR from max HR. Missing → null, never 0.
- Do not change the Catapult API request or add aliases in this task — capture first, fix second.
- Do not touch the readiness trigger, the CMJ/VALD work, or the jump-height/HR fields that already populate.
