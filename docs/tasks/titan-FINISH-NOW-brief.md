# Code brief — FINISH Titan (Njarðvík W live now) — ready to paste

Njarðvík W (basketball, team `a174db7b-…`) submitted their first real Titan `_synced_data` export. The
platform pieces exist (parser, `/coach/integrations/titan` page, `/api/integrations/titan/upload` + `/sheet`
+ `/daily-sync`). This brief closes the last gaps so Titan is done end-to-end.

## Already done (no action)
- **First data ingested** (hand-loaded, verified): 13 Njarðvík W players, 2026-10-15, `player_external_load_daily`
  `source='titan'`, `total_player_load` + `impacts`, `raw_payload_json.indoor=true`. Avg player load ~658,
  29 impacts. (Only player-load + impacts were usable — see the export problem below.)
- **Sidebar link added**: "Titan CSV upload" → `/coach/integrations/titan` (in `adminLinks`, next to Catapult
  CSV upload). Pending commit/deploy.

## 1. Harden the parser for the real (malformed) export — **do first, small**
The club's actual `_synced_data` export is **degenerate**: columns 3,4,6,7,8 all carry the header
**"IMU Player Load"** (duplicated), **"Load / Minute" is a flat `1`** for every player, and **IMU Duration /
Jumps / Low-High Active are absent**. Today the parser (`src/lib/integrations/titan/parseSyncedData.ts`)
mostly survives this (first "imu player load" → player_load ✓, impacts ✓, missing cols → null ✓) **but it
would still ingest the bogus `loadPerMinute = 1`.** Fixes:
- **Drop implausible `loadPerMinute`.** Load/minute = player_load ÷ duration; if `imuDurationMin` is null
  (as here) **set `loadPerMinute = null`** rather than trust the sheet's value. (Optionally also null it when
  it's a constant across all rows — a tell of the degenerate export.)
- **Validate + warn on upload.** When `resolveTitanHeaderMap` finds **duplicate** canonical columns, or
  **IMU Duration / Jumps are absent**, return a non-blocking warning to the upload UI:
  *"This export is missing Duration / Jumps (only player load + impacts imported). Re-export the `_synced_data`
  tab from Titan/Hudl with the full column set for complete data."* Still ingest what IS valid — don't block.
- Keep the existing good behaviour: blanks/error strings → null (never 0); day-first + ISO dates; skip blank
  rows; alias matching.

## 2. Show Titan upload on Today for Titan teams — the real "it should be on Today"
Build the **Today Sync/Upload card** from `today-datasource-sync-upload-and-team-profile-...brief.md`, at least
the **Titan slice**: a per-team data-source profile where Njarðvík W = provider `hudl_titan`, `env: indoor`,
`mode: file` (Upload). On Today, for a Titan team, render an **Upload card** ("Upload today's Titan
`_synced_data`") that posts to the existing `/api/integrations/titan/upload`. Reuse `getCatapultDataTier()` /
the team-profile pattern — do **not** add a competing tier source. Scope now = Titan (+ Catapult which already
syncs); other providers can follow on the same card. This removes the "go to a sidebar URL" step — the coach
sees the right upload on Today because the system knows the team is on Titan.

## 2b. Name matching is accent-SENSITIVE today — this is the real blocker. FIX FIRST.
**Verified against the live roster + a real export: 0 of 13 names map today.** The resolver in
`src/lib/integrations/titan/ingestServer.ts` (`normName` / `tokenKey`) lower-cases and strips punctuation **but
keeps Icelandic diacritics** ("björk" stays "björk"). Titan/Hudl exports the names **stripped of accents**
("Sara Bjork Logadottir", "Kristin Bjork Gudjonsdottir", "Emma Theodorsson"), so every name misses the
accented roster entry → all unmatched. The roster names are CORRECT; the matcher is the problem. The brief
below already *claimed* "accent-insensitive" — the code does not actually do it. Make it real:

- **Fold diacritics on BOTH sides before comparing**, inside `normName` (so `byNorm`, `byToken` and every
  lookup inherit it). Fold to ASCII: NFD + strip combining marks, **and** map the non-decomposable Icelandic
  letters explicitly: `ð→d`, `þ→th`, `æ→ae`, `ö→o` (NFD alone leaves ð/þ/æ intact). Keep the existing
  lower-case, punctuation→space, collapse-space, and token-sort behaviour. Do **not** change
  `stripLeadingUsername`'s regex (it already allows accented username tokens).
- After this, **11 of 13 map automatically** (simulated: Alexandra Eva Sverrisdóttir, Helga Jara, Helena
  Rafnsdóttir via username-strip, Krista Gló, Ásta Júlía, Sara Björk, Kristín Björk, Hulda María, Eygló
  Kristín, Emma Theódórsson, Aníta Rut). The two genuine mismatches below are handled by a DB name fix, not
  code — do not add fuzzy/edit-distance matching (false-positive risk on a 14-player roster).
- **The two DB name corrections are being applied in parallel** so that, once this accent fix ships, all 14
  map: `Dagbjört Dóra` → `Dagbjört Dóra Kristmannsdóttir` (DB was missing the surname the export carries), and
  `Brittanny Dinkins` → `Brittany Dinkins` (aligned to the Titan spelling). After both the code fix and these
  renames, a re-upload maps every rostered player who wore a unit (Danielle Rodriguez simply wore none).

## 2c. The real export's columns changed (new header set, zero load)
The latest `_synced_data` export is **not** the degenerate one in §1 — it has clean, distinct headers:
`Date, Player Name, IMU Load Index, IMU Movement Profile (Idx) Settled/Low/Mid/High Intensity Duration, IMU
Jumps, Impacts`. **But `IMU Load Index` and all four intensity durations are `0` for every row** (confirmed in
the Training Report totals too: Total/Avg Session Load = 0, active minutes = 0); only **Jumps** and **Impacts**
carry real values. So:
- **Extend `HEADER_ALIASES`** to recognise this header set: `imu load index` → player_load; the four
  `imu movement profile (idx) … intensity duration` columns → their low/mid/high-active duration slots; keep
  `imu jumps` → jumps, `impacts` → impacts. (Normalisation already strips the `(idx)` punctuation to spaces.)
- **Store zero load as NULL, not 0** when `IMU Load Index` is 0 across the whole file (the same
  "never fabricate 0" rule as `loadPerMinute`): a constant-zero load column is a not-calculated tell, so Jumps +
  Impacts become the only stored signal. Surface a non-blocking warning: *"This export contains no IMU Load
  Index (only Jumps + Impacts imported) — enable the Load Index metric in Titan for full load."*
- This is an **owner/config issue upstream** (Titan isn't calculating the Load Index for these indoor units);
  the code must ingest what's real (Jumps + Impacts) and flag the rest, never store 0 as load.

## 3. Confirm the rest works
- `/coach/integrations/titan` upload page accepts the CSV and routes through the hardened parser → upserts to
  `player_external_load_daily` (`source='titan'`, indoor), name-mapped to the team roster (accent-insensitive
  per §2b; strip a leading lowercase username token like "helenarafns").
- `/api/integrations/titan/daily-sync` (published-sheet cron) uses the same parser (so the warning + the
  loadPerMinute guard apply there too).
- Indoor tier / no-GPS gating already hides GPS-only surfaces for a Titan team — verify the new load shows on
  the indoor-load surface for Njarðvík W.

## Guardrails / tests
- **Degenerate-export test:** given the real Njarðvík W `_synced_data` (duplicate "IMU Player Load" headers,
  Load/Minute = 1, no Duration/Jumps), the parser returns player_load + impacts, `loadPerMinute = null`,
  duration/jumps = null, **and a warning**; nothing bogus stored.
- **Name mapping (accent fold):** add a unit test asserting the real export's 13 names all resolve against the
  live Njarðvík W roster after the §2b accent fold + the two DB renames — e.g. `Kristin Bjork Gudjonsdottir`→
  `Kristín Björk Guðjónsdóttir`, `Emma Theodorsson`→`Emma Theódórsson`, `helenarafns Helena Rafnsdottir`→
  `Helena Rafnsdóttir`. Without the fold, assert they do NOT match (regression guard, since today they silently
  all miss). Never silently mis-assign; a true unmatched name surfaces to the coach.
- **Boundary:** Titan load is descriptive indoor load; it feeds the load/ACWR surfaces, never the readiness
  colour. `estimated=false` (this is real measurement).
- `npx eslint` on changed files; typecheck; any schema saved as a migration.

## Owner action (parallel, non-code)
Re-export the `_synced_data` tab from Titan/Hudl with the **full column set** (Date · Player Name · IMU Player
Load · IMU Duration · Load/Minute · Low Active · High Active · IMU Jumps · Impacts) so future uploads carry
duration + jumps, not just player load + impacts. The report-template export settings produced the duplicated
columns — fix there.
