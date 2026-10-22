# Claude Code task — surface RSI-modified for CMJ (and stop pretending jump height is enough)

Paste to Claude Code (or `@docs/tasks/cmj-rsi-modified-claude-code-brief.md`).

## Why

CMJ monitoring in MicroPulse is **jump-height only**. `lib/micropulse/vald/snapshot.ts` reads
`jump_height_cm` and nothing else. The research is blunt about why that is not enough:

- **Marques & Buchheit 2026 ("Jump Height Lies")** — after matches, jump height barely moved
  (−0.12 to +0.11) while **RSI-modified fell −0.39** and contraction time rose +0.55. Players
  jumped as high but produced the force slower. Jump height is the one metric that *couldn't* see
  the fatigue. [SPSR 293](https://sportperfsci.com)
- **Gathercole et al. 2015** — the variables that stayed abnormal longest after fatigue were
  time- and eccentric-related, not the output. Jump height and peak power recovered first.
  [10.1123/ijspp.2013-0413](https://doi.org/10.1123/ijspp.2013-0413)

RSI-modified (jump height ÷ time-to-takeoff) is the single most-cited fatigue-sensitive CMJ metric
across both papers. This task surfaces it. It is deliberately scoped to **RSI-modified only** —
phase metrics (braking/propulsive impulse, phase durations) and trial-averaging with CV thresholds
are a **separate follow-up** and are listed under "Explicitly out of scope" below so they don't get
pulled in.

## The actual root cause (read this before touching code)

I traced it end to end. **The mapper is already correct.**
`lib/integrations/vald/normalizers.ts` (~lines 257–260) already reads RSI-modified:

```ts
rsiMod:
  paramValue(params, ["TRIAL_RSI_MODIFIED", "TRIAL_RSI_MOD"]) ??
  paramValue(params, ["RSIMod", "RSIModified"]) ??
  firstNumber(record.rsi_mod, record.rsiMod),
```

The column `vald_forcedecks_results.rsi_mod` exists. It is **0 of 731 CMJ rows populated**. The
reason is upstream: the synced VALD payload does not contain RSI-modified. I checked
`vald_raw_tests.payload → trials[].results[]` on a real recent CMJ — it carries only ~4 result
definitions (`JUMP_HEIGHT`, `MEAN_TAKEOFF_FORCE`, `MEAN_ECCENTRIC_FORCE`, `PEAK_TAKEOFF_POWER`),
each with per-limb splits. Neither `RSI_MODIFIED` nor `TIME_TO_TAKEOFF` is in the payload, so it
cannot even be derived.

**CORRECTION (verified in VALD HUB, 2026-07-21):** the earlier assumption that this is a VALD
config gap is WRONG. Logged into hub.valdperformance.com → Dashboard → ForceDecks CMJ, the metric
list already contains **RSI-modified**, **Eccentric Braking Impulse**, **Eccentric Braking RFD**,
**Flight Time:Contraction Time**, and the full impulse-at-{50..250}ms set. VALD computes and stores
all of it. There is NO Hub toggle that "exposes a metric to the API" — the dashboard metric selector
only changes what Hub displays, not what the API returns.

So the gap is **entirely on the MicroPulse sync side**: the ForceDecks fetch
(`/v2019q3/teams/{scopeId}/tests/detailed/{from}/{to}`) is returning a thin summary result set
(~4 metric definitions) when the full result set — including RSI-modified — exists in VALD. The fix
is to pull the full ForceDecks results, not to change anything in VALD. **Check VALD's API docs for
the endpoint/parameter that returns the complete per-trial result set** (likely a per-test results
or "recording" endpoint, or a parameter on the detailed endpoint) and request that. Do NOT invent
values.

So this task does the two things code *can* do:

1. Make the gap **visible and diagnosable** so the human knows the VALD config is the blocker and
   can confirm when it's fixed.
2. Make RSI-modified **flow through and surface** the moment the payload starts carrying it —
   with no further code change needed.

## Where (all paths verified 2026-07-21)

| Thing | Location | State |
|---|---|---|
| Metric mapper | `lib/integrations/vald/normalizers.ts` ~257 | Already reads RSI-mod; leave the read, see change 2 |
| Results columns | table `vald_forcedecks_results` | `rsi_mod`, `time_to_takeoff_ms` exist; both 0/731 |
| Raw payload | table `vald_raw_tests.payload` | `trials[].results[]`, ~4 metrics — thin |
| ForceDecks fetch | `lib/integrations/vald/provider.ts` ~210 | `/v2019q3/teams/{scopeId}/tests/detailed/{from}/{to}` |
| CMJ → coach | `lib/micropulse/vald/snapshot.ts` ~67 | Reads `jump_height_cm` only |
| Alerts surface | `components/dashboard/ValdAlertsPanel.tsx` | Existing VALD surface; add RSI here, do NOT build a new page |
| Trial expansion | `lib/integrations/vald/sync.ts` ~423 | Already one row per jump (3/test) |

## Change

**1. Diagnostic — log the result definitions that actually arrive.** In the ForceDecks ingest path
(`sync.ts` where trials are normalized, or `normalizers.ts`), when a CMJ trial is parsed, record the
distinct set of result keys seen (e.g. into the sync run's `note()` / summary, or a debug column).
The goal is a one-line answer to "which metrics is the endpoint actually returning?" without a DB
spelunk. Keep it cheap — a `Set` of keys per sync run is enough. This is how you confirm whether the
endpoint change in the correction above pulled the full result set through.

**2. Derive RSI-mod when the components are present but the metric isn't.** RSI-modified =
`jump_height (m) ÷ time_to_takeoff (s)`. If a future payload carries jump height + time-to-takeoff
but not a precomputed RSI-mod, compute it in the normalizer and store it, flagged as derived (add a
`rsi_mod_source` text column: `"vald" | "derived"` — migration + saved `.sql` under
`supabase/migrations/`, CLAUDE.md). If neither RSI-mod nor time-to-takeoff is present, store null —
**never a zero**. This is the null-vs-zero rule: a missing RSI is a claim about the data, not the
athlete.

**3. Surface RSI-modified where jump height already surfaces.** In `snapshot.ts`, read `rsi_mod`
alongside `jump_height_cm` and build the same personal-baseline comparison the CMJ jump-height
snapshot already uses (28-day baseline, latest vs baseline). Surface it in `ValdAlertsPanel.tsx`
next to jump height, bilingual EN/IS. Follow the layered read: the headline is the plain verdict
("RSI-modified niðri vs venjulegt" / "RSI-mod below normal"), the number and the baseline sit under
it, and the citation (Marques & Buchheit 2026; Gathercole 2015) is available on the detail.

**4. Confidence + honest empty state.** If `rsi_mod` is null for the squad (the current reality),
the panel must say so plainly — "RSI-modified not available: VALD is not sending it yet" — rather
than showing a blank or a zero. This mirrors the FMP-missing and imputed-verdict states already in
the app. When RSI is present but the baseline is thin (< ~14 tests), show low confidence, same as
the readiness engine.

## Acceptance

- With today's data (no RSI in payload), the panel shows the honest "not available yet" state, and
  the sync diagnostic reports which result keys VALD is actually sending.
- If a test row has `rsi_mod` populated (you can insert one synthetic row on the basketball demo
  team `725b9cff-c7c9-4d0d-b16d-d3e086a766d6` to prove the path), it renders with a personal-baseline
  read and a confidence label.
- Jump-height behaviour is unchanged for every existing surface — verify, don't assume.
- Any DB change has a matching timestamped file in `supabase/migrations/`.
- `npx eslint` clean on touched files (pre-existing errors in legacy files are tech debt — don't add
  to them). `npm test` passes.
- Stage specific files only — never `git add -A`.

## Explicitly out of scope (do NOT build these here)

- **Phase metrics** (Weighing/Unweighting/Braking/Propulsion/Flight/Landing durations, braking and
  propulsive impulse, eccentric/concentric RFD). These need the ForceDecks profile to output them
  AND per-metric CV thresholds from Gathercole 2015 Table 2 so noisy time-variables don't flag as
  fatigue. Separate brief.
- **Trial averaging.** Claudino et al. 2017 (151 studies) showed the **mean** of the trials is more
  fatigue-sensitive than the best trial, and rows are already stored one-per-trial. Averaging is the
  right display default but belongs with the phase-metrics work, not here — noted so it isn't
  forgotten. [10.1016/j.jsams.2016.08.011](https://doi.org/10.1016/j.jsams.2016.08.011)
- **The force-time curve itself** (the 6 shaded phases drawn on the trace). That needs the raw
  1000 Hz signal, which the VALD cloud API does not return — only ForceDecks desktop raw exports do.
  Do not attempt it from the summary payload.

## Do NOT

- Do not fabricate or default RSI values. No RSI in the payload → null, and a panel that says so.
- Do not touch the readiness trigger, `v_coach_readiness_today_v8`, or the jump-height snapshot logic
  beyond adding the RSI read beside it.
- Do not chase a VALD HUB config change — it was verified there is no such toggle; RSI-modified is
  already computed and stored in VALD, and the fix is the sync pulling the full result set.

## The real fix (this IS the task, not a human action)

RSI-modified already exists in VALD — confirmed visible in Hub. The endpoint the sync currently uses
returns a thin summary result set. Find the VALD ForceDecks API endpoint/parameter that returns the
complete per-trial result set and request it, so RSI-modified (and later the phase metrics) arrive
in the payload. The mapper already reads them; the diagnostic in change 1 confirms when they land.
No VALD-side action, no support ticket, no maintenance-window dependency.
