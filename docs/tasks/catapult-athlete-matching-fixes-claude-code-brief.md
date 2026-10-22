# Claude Code task — fix Catapult athlete matching (cross-team mismatch + accents + unmatched UI)

Paste to Claude Code (or `@docs/tasks/catapult-athlete-matching-fixes-claude-code-brief.md`).

## What went wrong (real incident, root-caused)
A Breiðablik OpenField athlete "Dagur Orn Fjeldsted" (jersey 16) was auto-mapped to a **Keflavík**
player named "Dagur", so his GPS/IMA sessions landed on the wrong club's player for months. Two
different people, same first name. Data has been repaired by hand; this task fixes the causes so
it can't recur. Code lives in `src/lib/integrations/catapult/mapAthletes.ts` and
`src/app/api/integrations/catapult/{daily-sync,unmatched-athletes}/route.ts`.

## Bug 1 (HIGH) — team-scoping is bypassed on the env-config sync path
`mapCatapultAthleteToPlayer(athlete, { sourceTeamId })` already team-scopes the roster IF
`sourceTeamId` is passed (`loadPlayersWithEmail` does `.eq("team_id", sourceTeamId)`). But
**Breiðablik syncs via the legacy ENV-var config** (`getConfigFromEnv()`, `config = undefined` in
`daily-sync`), so `syncCatapultDailyMetrics` has no `teamId` to pass → `sourceTeamId` is null →
matching runs against **every team's roster** → "Dagur Orn" matched a bare "Dagur" in Keflavík.

Fix: the env/legacy Catapult config must resolve to a concrete `team_id` (Breiðablik) and thread it
through so `sourceTeamId` is always set. Options (pick with owner):
- Add `teamId` to the env config (`getConfigFromEnv()` returns Breiðablik's team_id from an env var
  or a lookup), and pass `config.teamId` into `syncCatapultDailyMetrics` → `mapCatapultAthleteToPlayer`.
- Make `sourceTeamId` **required** for auto-matching: if it's null, DO NOT auto-match (return null
  and record as unmatched) rather than matching across all clubs. A null-team auto-match is exactly
  the failure mode — never match globally.
Auto-matching across teams must be impossible. Prefer both: require sourceTeamId AND fix the env
path to supply it.

## Bug 2 (HIGH) — accent normalization mangles Icelandic vowels
`normalizeName()` handles þ/ð/æ explicitly but relies on `NFKD` + `.replace(/[^\w\s]/g, " ")` for
the rest. For "ö" (and á/é/í/ó/ú/ý/ü) NFKD splits the vowel into base + combining mark, and the
combining mark is replaced by a **space**, so "Örn" → "o rn" (two tokens), while OpenField's plain
"Orn" → "orn". Result: the correct same-name match ("Dagur Örn Fjeldsted" ↔ "Dagur Orn Fjeldsted")
FAILS, and the loose fallback then grabs the wrong player.

Fix: fold diacritics to their base letter WITHOUT inserting spaces. After `.normalize("NFKD")`,
strip combining marks with `.replace(/[̀-ͯ]/g, "")` (do this BEFORE the `[^\w\s]→space`
step), keeping the þ/ð/æ replacements. Then "Örn"→"orn", "Guðni"→"gudni", etc. Add a unit test:
`normalizeName("Dagur Örn Fjeldsted") === normalizeName("Dagur Orn Fjeldsted")`.

## Bug 3 (MED) — first-name-only candidate makes matches too loose
`getCatapultNameCandidates()` adds the bare first name (`candidates.add(first)`), so an athlete
"Dagur Orn Fjeldsted" can match a player whose whole name is just "Dagur". Combined with Bug 1 this
is what fired. Even within a team this is risky. Fix: drop the bare-first-name candidate, or only
accept a first-name-only match when it's unique AND flag it low-confidence for review (don't
auto-persist a 0.64 match silently). Keep exact-normalized-name and email as the high-confidence
paths; treat first-initial/last-initial heuristics as "suggested", surfaced in the mapping UI, not
auto-committed.

## Bug 4 (MED) — unmatched-athletes UI is broken for env-config teams (400 + retry loop)
`GET /api/integrations/catapult/unmatched-athletes` calls `getConfigForTeam(teamId)` (team_settings
only). Breiðablik has no DB config (env-var path), so it returns null → 400
("Catapult er ekki tengt fyrir þetta lið"). The panel `UnmatchedAthletesPanel.tsx` then retries in
a tight loop (observed ~198 calls). Fixes:
- Endpoint: fall back to `getConfigFromEnv()` when `getConfigForTeam` is null (mirror daily-sync's
  env fallback), so env-configured teams (Breiðablik) work.
- Panel: on a non-2xx response, show the error and STOP — no infinite refetch. Add a retry cap /
  backoff and a manual "Try again" button. A 400 must not spin the endpoint.
This matters because it's the coach's own tool to fix exactly this class of problem; right now a
Breiðablik coach can't self-serve a mapping.

## Data cleanup (one-off, verify then run)
Existing `catapult_athlete_map` rows may hold other cross-team mismatches created before the fix.
Audit: for each map row, check the mapped player's `team_id` equals `source_team_id` (where set),
and flag rows where a `match_method='name'` mapping points to a player on a different team than the
athlete's source org. Produce a report for the owner before changing anything — do NOT bulk-move
data automatically (moving load/readiness across clubs is destructive; the Dagur case was fixed
manually after confirming ownership).

## Related follow-up (from an existing code comment)
`upsertCatapultAthleteMapping` still keys on `(catapult_athlete_id)` alone. Once `source_team_id`
is always populated, switch the PK/onConflict to `(source_team_id, catapult_athlete_id)` so the
same athlete id can exist per team without clobbering. Migration under `supabase/migrations/`.

## Acceptance criteria
- Auto-matching NEVER matches an athlete to a player on a different team. Prove with a unit/integration
  test: athlete "Dagur Orn Fjeldsted" (Breiðablik org) does not match Keflavík "Dagur"; it matches
  Breiðablik "Dagur Örn Fjeldsted" via the accent-folded exact name.
- `normalizeName` folds ö/á/é/í/ó/ú/ý/ü/ð/þ/æ to base letters with no spurious spaces (unit tests).
- The env/legacy sync path passes a concrete `team_id`; a null team never triggers a global match.
- The unmatched-athletes panel loads for Breiðablik (env config) and does not loop on errors.
- `npx tsc --noEmit` + `npx eslint` clean on touched files; any migration saved under
  `supabase/migrations/`; stage specific files (no `git add -A`).
