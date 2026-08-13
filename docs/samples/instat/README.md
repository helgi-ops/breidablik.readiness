# InStat / Hudl basketball samples

InStat is a descriptive **source** (`source='instat'`) layered on top of the
KKÍ box score — never a readiness signal. Two confirmed export paths (Hudl rep,
Aug 2026); the realistic ones for KKÍ clubs are the first two:

1. **Manual table export (CSV/Excel)** — PRIMARY. Coach selects the metrics
   (box-score + advanced) and downloads a table. Parsed by
   `statsInstatBasketballCsv.ts` (SheetJS), per-player → `player_basketball_match_stats`.
2. **Game Report PDF** — free, per match. Parsed deterministically by
   `statsInstatBasketballPdf.ts` (`pdf-parse` text layer): team box score +
   per-quarter + Four Factors, both sides → `basketball_team_match_stats`.
3. API — deprioritised (too expensive for KKÍ clubs); out of scope for v1.

## Fixtures are NOT committed

Like the `statsbomb/` and `wyscout/` samples, InStat provider data is proprietary
and kept **local-only** (git-untracked), not committed to the repo.

- `InStat-Game-Report-Valencia-Baskonia.pdf` — the deterministic PDF test
  (`src/lib/micropulse/basketballStats/__tests__/statsInstatBasketball.test.ts`)
  reads this fixture when present via `describe.skipIf(!hasFixture)`, and skips it
  in CI. The synthetic title / fingerprint / Four-Factors / CSV tests in the same
  file always run, so CI keeps meaningful coverage without the proprietary file.

To run the full PDF test locally, drop the InStat Game Report PDF at that exact
filename in this folder.
