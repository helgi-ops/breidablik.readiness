# Fusion — proven on real Wyscout data (Breiðablik–Fram, 24 Aug 2026)

The physical×tactical fusion now has a **working real event feed**. The missing piece was never the
engine (the feed-agnostic `peakPeriodContext` was already built) — it was a time-stamped event export.
Wyscout's **SportsCode XML** export provides it, and the ingester now parses it.

## What was built + verified
- **`src/lib/micropulse/wyscoutEvents/parseSportscode.ts`** — parses Wyscout SportsCode XML (UTF-16)
  → normalised time-stamped events `{ startSec, endSec, code, labels[] }`, plus `busiestWindowFor`
  and `labelsInWindow` helpers. Pure, lint-clean.
- **Verified on the real export** (compiled + run against the uploaded files): player-events = 857
  instances (per-player, on-ball actions), team-events = 318 instances (tactical phases), times
  1→5710s. Same output as the reference parse.

## The FULL fusion read on a real match — physical peak × tactical content
Both feeds are now live for this match: the Catapult CTR (physical peak windows with clock) was
loaded into `player_peak_window` (106 rows, 12 players, 72 peak windows, all with a kickoff-aligned
clock), and the Wyscout events give the tactical content. Aligning them on the **same kickoff clock**
(first-half, where the two clocks share an origin with no half-time gap) gives the read siloed systems
cannot:

**Óli Valur Ómarsson (Catapult) = "(9) O. Omarsson" (Wyscout)** — same player, two different "peak"
windows, **opposite tactical character**:

- **Hardest single minute (peak 1-min Player Load, 8:17):** team was *defending* — 2 crosses conceded,
  a corner conceded, a goal-scoring chance conceded. His on-ball: an **interception + a clearance**.
  → *His most intense physical minute was scrambling to defend a set-piece barrage.*
- **Hardest 5-min running (peak 5-min distance, 27:02–32:02):** team was *attacking* — attacking style
  ×4, crosses ×3, attacking corners ×2, a chance + a shot. His on-ball: 5 passes, a 1v1 dribble, **2
  crosses, an opportunity, a shot**.
  → *His highest-distance spell was driving the attack down the flank.*

That is the whole point: **the same player's two peaks had opposite tactical meaning** — one defensive,
one offensive. GPS alone tells you *when* he worked hardest; event data alone tells you *what* he did;
only the overlay tells you his hardest minute was defensive and his hardest 5-min run was his own
attacking output. This is real, on one real Breiðablik match.

(Side note the data surfaced twice — once in Wyscout, once in the CTR: **Anton Logi Luðvíksson** only
appears from ~70' (Wyscout 23 actions; CTR has only a "Seinni halfleikur" row, no first half) — a
<30-min sub. Exactly the "top-up on MD+1/MD+2" case from the RPE-MD-day brief.)

## Status — the fusion now runs end-to-end on real data
- **Was:** movement-signature proxy only; event fusion "in progress, engine built".
- **Now:** BOTH feeds ingested from a real match — Wyscout events (`parseSportscode.ts`) **and** the
  Catapult physical peak windows with clock (`player_peak_window`, loaded from the CTR) — and the
  overlay produces the true physical-peak × tactical-content read above.
- **Honest limits that remain:** (1) clean alignment is shown in the **first half**; second-half
  alignment needs half-time-gap handling between the Catapult session clock (real elapsed, includes
  half-time) and Wyscout play-time (~95 min, half-time removed) — a small clock-mapping step, not new
  data. (2) **Per-period HSR is now real.** This export has no single "HIR Distance" column, but the
  account's velocity Band 5 starts at 5.50 m/s = **19.8 km/h** (the Ju threshold) and Band 6 at 7.00
  m/s = 25.2 km/h (sprint), so **HSR = Velocity Band 5 + Band 6** — backfilled onto every per-period
  row (session avg 623 m, H1 383 m, H2 304 m, threshold 19.8). The only piece still gated is
  *peak-window* HSR (the MII peak intervals carry Distance + Player Load only, not a velocity-band
  breakdown), so the Ju-2022 *Table-2 peak* score still needs raw GPS. (3) The in-app upload route's
  parser expects the
  *Bulk-CTR* column spellings ("HIR Distance", "Velocity Band 5 Total Distance") — this Activity-Report
  export uses different names, so the coach-facing upload needs a small parser tweak to accept it (see
  below). The direct load done here bypassed that.

## Workshop line (updated, still honest)
> "I got it running on a real Breiðablik match. I can take a player's hardest physical minute off the
> GPS and show what he was doing tactically at that exact moment — and the interesting bit is his
> hardest minute was defending a corner while his hardest 5-minute run was his own attack down the
> wing. Two different peaks, opposite meaning. GPS alone or event data alone can't tell you that —
> only putting them on the same clock can."

Ref: `parseSportscode.ts`, `peakPeriodContext` (alignment engine), `player_peak_window` (physical peak
feed — to sync), `statsbomb-events-manual-ingest.md` (the generic ingest brief this fulfils via
Wyscout), `rpe-md-day-expectation-flag-brief.md` (the sub/top-up tie-in).
