# Contextualised peak period (fusion flagship #2) — spec

**Question:** in a player's most intense 1/3/5-min window, WHAT was he doing tactically (Run in
Behind, Support Play, Move to Receive, Run with Ball, Recovery Run, Covering)? Fuses the physical
peak window (GPS/IMA — *how much / how hard*) with the time-stamped tactical events in the SAME
window (*what*). Grounded in **Ju et al. 2022** (Biol Sport 39(4):973-983, "integrated approach").
This is the biggest differentiator — no one in the smaller leagues does within-window fusion.

## Status (2026-08-23)

- ✅ **Engine done** — `src/lib/micropulse/peakPeriodContext/index.ts` (pure, feed-agnostic, 9 tests):
  `alignEventsToWindow`, `classifyEventAction` (Ju taxonomy), `computePeakPeriodContext` →
  layered read (verdict → facts → confidence) + the stacked-bar action distribution. It is
  decoupled from ingestion: it consumes a normalised `MatchEvent[]` + a `PeakWindow` with a clock
  position, and lights up unchanged when the two feeds below land.
- ⛔ **Blocked by two data feeds** (verified absent — this is the honest gate):
  1. **Time-stamped events.** Every ingested StatsBomb table is AGGREGATED (per-match/season
     OBV) — no per-event minute/second/x-y/type. Needs the StatsBomb IQ **event feed** (JSON/CSV).
  2. **Peak-window clock position.** `player_load_peak_period` stores only the peak VALUE per
     window — no start time. The parser doesn't capture one. Needs the Catapult **custom-period /
     raw-GPS** export that carries the window's clock position (the SAME export that carries
     peak-HSR for the Ju Table-2 benchmark — see `football-peak-period-context-vs-research.md`).

## Feed 1 — time-stamped events → `MatchEvent`

New table (when the export exists) `sb_match_events`:
`id, team_id, match_date, source, period int, minute int, second int, t_sec int (from KO),
player_id uuid, player_name, own_possession bool, type text, sub_type text, x numeric, y numeric,
forward bool, outcome_success bool, obv numeric, raw jsonb`. Unique `(team_id, match_date, source,
player_id, t_sec, type)`; RLS coach-read-by-team; service-role write. Ingester maps StatsBomb IQ
event rows (or InStat / FIBA equivalents) → these columns → `MatchEvent` (t_sec is the alignment
clock; period offsets added: P2 += 45·60, etc.). No provider specifics leak into the engine.

## Feed 2 — peak-window clock position → `PeakWindow.startSec/endSec`

Extend the peak-period capture: `player_load_peak_period` (or a companion `player_peak_window`)
gains `window_start_s`, `window_end_s`. Requires an OpenField **custom period / rolling export**
(or raw GPS) that reports WHEN each peak window occurred, not just its value; extend
`parseCatapultPeakPeriod` to detect a "peak … start" column. Until then `PeakWindow.startSec` is
absent and the engine returns the gated verdict naming this feed.

## Event → Ju action mapping (in `classifyEventAction`, conservative)

| Event (own possession, subject actor) | Ju action |
|---|---|
| Carry / Dribble, attacking third, forward | Run in behind / penetrate |
| Carry / Dribble, elsewhere | Run with ball |
| Reception / Ball receipt, attacking third, forward | Run in behind / penetrate |
| Reception / Ball receipt, elsewhere | Move to receive / exploit space |
| Pass | Support play (link) |
| Shot | Run in behind (arriving to finish) |
| Ball recovery / interception / tackle (out of poss.) | Recovery run *(off-ball proxy)* |
| Pressure / block / clearance (out of poss.) | Covering *(off-ball proxy)* |
| anything else | Other |

**Honest scope:** event feeds capture ON-BALL actions well; Ju's off-ball majority (Recovery Run,
Covering) was tracking/video-coded and is only partially recoverable — the read labels the off-ball
share as "needs tracking", never invents it.

## Surface (when lit)

On the Match Movement peak-demands card (and the player game recap): a **stacked bar of the peak
window** (Recovery Run / Support Play / Run in Behind / …) like Ju's figure, verdict "his peak is
driven by attacking receptions", the peak rate, confidence (event coverage), Ju citation behind
"Show details". Explainability-first, EN default / IS toggle.

## Guardrails

Descriptive/advisory — never touches the readiness colour or the daily decision. Rules classify;
AI (if any) only phrases. Every read carries confidence + the Ju citation + the off-ball caveat.
No fake alignment on absent data — the engine gates and names the missing feed.
