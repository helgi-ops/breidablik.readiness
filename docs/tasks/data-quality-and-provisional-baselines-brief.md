# Data quality + provisional baselines

**Status:** engines DONE (3 files, tsc + eslint clean). UI + alerting remain.

## Why — what the database actually says

A coach mentioned his substitutes' numbers looked high. Chasing it surfaced this:

| Team | Catapult tier | GPS | IMA | Stride bands | Verdict |
|---|---|---|---|---|---|
| Breiðablik | full | 621/621 | 606 | 600 | ✅ healthy |
| **HK** | **full** | 656/656 | 655 | **0** | ⚠ **paying for data it never received** |
| Grindavík | lite | 547/547 | 0 | 0 | ✅ correct — Lite has no IMA |
| Þór | lite | 486/486 | 0 | 0 | ✅ correct |
| Afturelding | lite | 228/228 | 0 | 0 | ✅ correct |
| Keflavík | lite | 379/379 | 10 | 10 | ✅ correct |

**One real fault: HK.** On the `full` tier since April, never received a single
stride reading — and nobody knew until a coach happened to speak up three months
later. (Catapult has since been contacted; they are adding the missing parameters.)

### The mistake this feature exists to prevent

The first version of the engine inferred entitlement by comparing teams to each
other — "others get IMA, so you should too" — and flagged **four healthy Lite teams
as broken**. The second invented a `catapult_product` column, a fourth competing
source of truth beside `plan_tier`, `catapult_plan_type` and
`catapult_data_tier_override`. Both were wrong the same way: answering a question
the platform had already answered.

The tier is resolved by the existing `getCatapultDataTier()` → `full` | `lite`.
One source, one verdict (CLAUDE.md). A monitor that cries wolf on healthy teams
teaches the coach to ignore the warnings that matter.

A monitoring system that cannot monitor itself is not trustworthy. That is the
feature.

## Done (do not rebuild)

- **`src/lib/micropulse/dataQuality.ts`** — `classifyFeed()` (feed health) and
  `checkRow()` (impossible values). Pure, bilingual reasons.
- **`src/lib/micropulse/provisionalBaseline.ts`** — `provisionalBaseline()`:
  shrinkage blend of the player's own history with his position-group norm.
- **`src/app/api/coach/data-quality/route.ts`** — `GET`, per team.

### The idea that makes it work: entitlement, not inference

"Has this feed gone quiet?" only catches a signal that worked and then broke. It
**never fires** on a signal broken from day one — there is no last-seen date to go
stale. That is exactly how HK ran for three months at zero.

So the engine asks a different question: **is this team's tier supposed to include
this signal?** If yes and nothing has ever arrived → `never` → actionable, on day
one. If no → silence, because absence is the correct behaviour.

Statuses: `healthy` · `degraded` · `silent` (worked, then stopped) · `never`
(entitled, never arrived) · `not_expected` (not in the tier — absence is correct).

**Signals covered (extended 2026-07-15).** The engine now watches ten signals, not
the original six. The four added — `ima_run_distance`, `impacts`, `jumps`, `fmp` —
are exactly the ones that failed in the July "mirror image" and that the first
version was blind to (HK had IMA+impacts+jumps but no FMP / no free-running;
Breiðablik had the opposite, no impacts). All four are FULL-tier entitlements.
Verified against live coverage: the engine now flags Breiðablik's impacts (4% →
degraded), HK's jumps (79% → degraded) and HK's FMP (0% → never) — none of which
it could see before. `ima_run_distance` and `gps` are GPS-derived, so their
coverage is scored on outdoor sessions only (the endpoint's `isOutdoor` filter).

Coverage is only counted on sessions where the signal *could* exist — a gym day has
no GPS and must not be scored as a gap, or the thing cries wolf until it's ignored.

### Provisional baselines

`weight = n / (n + 10)` — start at the position group's norm, converge on the player
as his own sessions accrue. Confidence **is** that weight, so the coach always sees
how much of the verdict is really about this player.

`MATURE_SESSIONS = 30` is not "about 4 weeks" — it is the exact n where the weight
hits 0.75, the "high" confidence threshold. Maturity and confidence are therefore
the same statement and the label can never contradict the number next to it.
Even at maturity the group still supplies 25%, so the copy says the baseline is
**personal** — never that it is purely his.

## TODO — UI

1. **Data Quality page** (coach nav). Feed table: signal · status · coverage ·
   plain reason. Then the row issues (impossible velocity, manual-vs-device
   conflicts). Worst first — `sortFeeds()` already orders them.

2. **Inline badges.** Wherever a number is shown that a `block`-severity issue
   touches, show the number *with* its reason attached — never silently. Follow the
   layered read: verdict → plain why → raw detail behind the toggle.

3. **Confidence on every new-player verdict.** When `provisional === true`, the
   verdict renders with its confidence band and `reasonIs`. A provisional baseline
   may produce a verdict; it may **not** hide that it is provisional.

4. **Exclude `block` rows from baselines and PBs.** A 59.4 km/h GPS spike must never
   set a personal best or contaminate a baseline. This is the highest-value item on
   this list — those two rows are in the DB right now.

## TODO — alerting (operator, not coach)

Daily cron → run `classifyFeed` per team × signal → on any `never` or `silent`,
notify **Helgi**, not the coach. The coach can't fix a Catapult misconfiguration and
shouldn't be made to feel responsible for one. Include team, signal, days affected.

This is the piece that turns "a coach happened to mention it after three months"
into "the system told us on day one".

## Known bad rows to clean

- Magnús Arnar Pétursson, 2026-06-12 — **59.4 km/h** (world record ~37).
- Arnþór Atlason, 2026-05-21 — **38.1 km/h**.
- Atli Hrafn Andrason, 2026-07-10 — manual **10,902 m**, pod recorded **6,547 m**
  (he played only the first half). Two independent rules flag it: 67% device
  conflict *and* 218.9 m/min. Coach-entered, so **ask before overwriting**.
