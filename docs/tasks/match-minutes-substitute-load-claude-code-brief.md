# Match minutes — substitutes' GPS is contaminated by touchline warm-up

**Status:** backend DONE (migration + lib + endpoint, all green). UI remains.
**Reported by:** HK coach — "the substitutes' numbers are far too high."
**Verified against:** HK vs Ægir, 2026-07-10 (Lengjudeild karla, 3–4), KSÍ lineup.

## The bug

Catapult splits a match into periods by the **stadium clock** ("1st half", "2nd
half") — **not** by who is on the pitch. A substitute's pod goes on at half-time,
he jogs the touchline for ~30 min, comes on for ~20 — and **every metre lands in
the "2nd half" period**.

Ground truth from the DB (`player_drill_load`, 2026-07-10):

| Player | 1st half | 2nd half | Distance | High-speed % |
|---|---|---|---|---|
| Atli Þór Gunnarsson | — | **51.5 min** | 3,983 m | **3.7%** |
| Jóhann Þór Arnarsson | — | **51.5 min** | 3,863 m | 6.6% |
| Alexander Örn Guðmundsson | — | **51.5 min** | 3,789 m | 10.2% |
| Dagur Ingi Axelsson | — | **51.5 min** | 2,848 m | 12.1% |

All four substitutes carry **exactly the full second half**. Atli Þór shows
3,983 m at **3.7% high-speed** — a player genuinely playing runs 8–13%
(Bradley 2009). He was jogging, not playing. And Dagur Ingi, with the *highest*
high-speed share, has the *lowest* distance — he came on earlier and warmed up
less. The contamination is systematic and visible.

### What was NOT wrong (checked, ruled out)

- **Not warm-up inside the activity file.** The daily total equals the sum of the
  two half periods **exactly** (0 m difference, all 14 players). No warm-up period
  exists in the file.
- **Not name mis-mapping.** The 10 highest-distance players are exactly the 10
  outfield starters on the KSÍ team sheet.
- **Starters are fine.** Over the true 101.3 min (halves were 49.8 + 51.5 with
  stoppage) they run 99–116 m/min — textbook.

## The distinction that fixes it

- **Matchday load** — everything the pod recorded, warm-up included. **Valid for
  ACWR / load monitoring**: the body did the work. Do not discard it.
- **Match running** — on-pitch output only. Trustworthy **only** when the pod
  window and minutes played agree.

Blending these into one number is what made a substitute look like he ran half a
match.

## Done already (do not redo)

- `supabase/migrations/20260712203000_player_match_minutes.sql` — table
  `player_match_minutes` (player_id, match_date, team_id, minutes_played, source,
  entered_by). **Applied.** Separate table on purpose: a Catapult re-sync upserts
  `player_external_load_daily` and would clobber coach input if it lived there.
- `src/lib/micropulse/matchMinutes.ts` — pure `classifyMatchLoad()`. Returns
  context + `usableAsMatchBenchmark` + bilingual plain-language `reason`.
- `src/app/api/coach/match-minutes/route.ts` — `GET` (pod window, started?, entered
  minutes, verdict per player) and `PUT` (save minutes). tsc + eslint clean.

### The one subtlety the classifier gets right

**Subbed OFF ≠ subbed ON.** A starter who comes off keeps his pod on while he
**sits** — that adds no running, so his totals are still true match numbers
(Karl Ágúst: 7,372 m / 65 min = 113 m/min, perfectly normal → **kept, usable**).
A substitute coming **on** has jogging distance baked in → **flagged, excluded**.
Treating both as "contaminated" would throw away good data. The classifier
distinguishes them via `startedMatch`, derived from the presence of a "1st half"
period row.

## TODO — the UI

1. **Minutes entry.** On the match day (Fixtures / the match's Today view), a
   compact table: player · started? · pod window · **[minutes played]** input.
   Pre-sort starters first. Save via `PUT /api/coach/match-minutes`.
   Blank = unset (row deleted). `0` = named but never came on — a real, distinct
   statement, so do **not** conflate blank with 0.

2. **Label contaminated rows wherever match GPS is shown.** When
   `verdict.usableAsMatchBenchmark === false`, show the number but attach the
   reason (`verdict.reasonIs` / `verdict.reason`) — e.g. *"Came on as a substitute
   for 20 min, but the pod recorded 51.5 min — the other 31.5 min are touchline
   warm-up."* Layer-1 of the explainability read: the plain "why" is visible
   **without** opening a drill-down.

3. **Exclude from benchmarks.** Any baseline, position norm, or "his usual match"
   comparison must filter to `usableAsMatchBenchmark === true`. Matchday LOAD
   (ACWR, weekly totals) keeps using the full number — that is deliberate.

4. **Nudge when minutes are missing.** `context === "unknown"` → the coach hasn't
   entered minutes. Prompt on the match day rather than silently showing an
   unverified number.

## Separate issue found — needs a decision

**Atli Hrafn Andrason, 2026-07-10.** He played **only the first half** (Catapult:
6,547 m, no 2nd-half period). But the system holds a **manual entry of 10,902 m**
— someone typed in numbers as if he had played the whole match. That row is
wrong and currently overrides his real data (manual beats catapult by design).

It is coach-entered data, so it was **not** overwritten without asking. Options:
replace it with the real Catapult figures (6,547 m, aggregable from
`player_drill_load`), or delete it and let the Catapult row stand.

## Not done

- Two impossible max velocities are stored with no sanity gate: Magnús Arnar
  **59.4 km/h** (2026-06-12) and Arnþór **38.1 km/h** (2026-05-21). World record is
  ~37. Add a validity ceiling at ingestion (reject/flag as GPS spike) and clean
  the two rows.
