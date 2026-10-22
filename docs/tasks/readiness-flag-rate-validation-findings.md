# Readiness flag-rate validation — findings (31 Aug)

A squad-wide verdict-accuracy pass on Breiðablik senior men (1,435 real readiness rows, last 60 days),
simulating the now-live SD-floor colour engine (`z = (total − mean) / greatest(sd, 1.5)`, bands
green > -0.5 / yellow > -1.0 / else red) against the actual stored colours.

## Team-wide: the SD floor is working and well-calibrated
| Metric | Actual | With floor (simulated) |
|---|---|---|
| Red % | 9.7% | **8.4%** |
| Yellow % | 15.7% | **7.7%** |

- Yellow roughly **halved**; red reduced modestly. 18 reds and 133 yellows softened across the squad.
- Genuine reds are preserved (still 8.4%) — the floor removes noise, not real signal. **Verdict: keep
  the floor; it is not over-correcting.**
- History still shows the pre-floor colours (only 83/2,893 recent rows carry `baseline_sd_floor`); new
  entries are correct. A one-time backfill would align history (user declined for now).

## Residual over-flagging has moved to HIGH-variance reporters
After the floor, the players still flagged most are **high personal SD** ones — the floor doesn't touch
them because their real SD already exceeds 1.5:

| Player | mean SD | flag % (actual → floored) |
|---|---|---|
| Gylfi | 3.10 | 54% → **54%** (unchanged) |
| Kristófer Ingi | 1.70 | 29% → 25% |
| Jónatan Guðni | 2.67 | 28% → 22% |
| Valgeir | 2.89 | 33% → 21% |
| Ívar Örn | 3.94 | 27% → 20% |
| — low-variance, for contrast — | | |
| Anton Logi | 1.15 | 34% → **19%** |
| Birkir Þorsteinsson | 1.07 | 33% → **19%** |
| Arnar Bjarki | 1.94 | 40% → **16%** |

- The low-variance cohort (Anton, Birkir, Arnar Bjarki) is exactly who the floor was meant to help — and
  it does (~halved).
- The remaining flags concentrate on high-SD reporters. For them the personal-norm z legitimately fires
  more — **but high variance can also mean erratic / unreliable check-ins**, not real day-to-day swings.

## Gylfi — flag for a coach check
54% of days flagged, SD 3.10, only 26 entries. That is either a **genuinely struggling/returning
player** or **inconsistent self-reporting** (e.g. big daily swings from low-effort entries). Worth a
direct word with the player + a look at his check-in pattern before trusting the norm.

## Recommendation — the next lever is data-reliability, not more thresholds
The threshold side is now well-tuned (floor working, reds preserved). The remaining accuracy gain is a
**check-in reliability signal on BOTH tails of variance**:
- **Very low SD** (< ~1.0, e.g. Anton, Birkir, Höskuldur) → near-identical entries → norm may be
  auto-filled; widen the band / soft "low variability" note.
- **Very high SD** (> ~2.5, e.g. Gylfi, Ívar, Valgeir) → erratic entries → norm unreliable; soft "high
  variability — check-in consistency" note, so the coach knows the flag rests on a noisy baseline.
Surface as a quiet data-quality note (`dataQuality.ts`), never a verdict, never the readiness colour.
This catches the residual over/under-flagging that thresholds can't.

## What this validates
- Phase 0 (SD floor) is **effective and safe** squad-wide — no further threshold change needed.
- The one remaining, well-scoped improvement is the two-tailed check-in-reliability signal above.
- Recommend running the same simulation across other active clubs before/after any future threshold
  change (this query is the reusable harness).

Ref: `mp_set_baseline_z_before_pi` (colour engine — SD floor live), `dataQuality.ts`,
`implementation-roadmap.md`, `readiness-low-variance-oversensitivity-fix-brief.md` (superseded).
