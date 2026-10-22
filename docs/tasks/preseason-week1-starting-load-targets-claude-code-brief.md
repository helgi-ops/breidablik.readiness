# Claude Code brief — pre-season week-1 starting load targets + ramp (individual + team, all KPIs + sRPE/AU)

Goal: give the coach a **starting point** for pre-season week 1 — an individualised and team-level load
target across **all the main variables + sRPE (arbitrary units)** — that is a **controlled re-entry**, not
full match load, plus the **week-by-week ramp** toward the pre-season build. A launch pad the coach edits
and builds from. Lives in the **Periodization hub**. Descriptive/coach-owned; never the readiness colour.

## The design decision (anchor)

- **Anchor = the player's own typical MATCH demand** (reuse the existing match unit). But **week 1 ≠ full
  match load** — detrained players coming off the break start LOW and ramp up. The existing preseason
  target (~2.2–4.2× a match/week) is the **build destination**, not week 1.
- **Week 1 = a conservative fraction** (re-entry), then a **safe progressive ramp** across the pre-season
  weeks toward that destination (ACWR-aware: no chronic base post-break → keep acute modest, ~+5–10%/wk).
- **When pre-season has no recent matches** (season ended months ago, no friendlies yet): anchor on **last
  competitive season's** typical match demand; else **position/team normative**; else **sRPE-only**.
  Friendlies refine the anchor as they arrive. Label which anchor + confidence.

## Reuse (verified — extend, don't rebuild)

- **`periodization/index.ts` `weeklyTargetFromMatch`** — already computes match-anchored weekly targets
  (preseason + inseason), per player, in the hub. It returns ONE preseason number; **add the week-index
  ramp** (week 1 low → build).
- **`externalLoad/loadTargets.ts` + `weeklyLoadTypes.ts`** — all main KPIs (TD, HSR, sprint, accelB23,
  decelB23, PlayerLoad, IMA, stride bands) + `match_demand` distribution + mesocycle multiplier.
- **sRPE / AU already a currency** — the hub reads `loadSource: "gps" | "srpe"` (RPE×min). Surface sRPE as
  a parallel target so non-GPS teams get an AU number too.
- **`detectSeasonPhases`** (pre-season weeks) + ACWR context already in the hub.

## New pure lib `src/lib/micropulse/periodization/preseasonStart.ts`

```ts
export type LoadAnchor = "match_this_season" | "match_last_season" | "normative" | "srpe_only";
export interface PreseasonWeekTarget {
  weekIndex: number;              // 1 = first pre-season week
  multipleOfMatch: number | null; // week's weekly load as ×match (week 1 low, ramps up)
  weeklyLoadTarget: number | null; perSessionLoad: number | null; sessionCount: number;
  byKpi: Partial<Record<string, number>>;   // per-KPI weekly target (all main variables)
  sRpeAuTarget: number | null;    // RPE×min arbitrary-units weekly target
  note: Bi; anchor: LoadAnchor; confidence: "high"|"moderate"|"low";
}
export function preseasonStartRamp(opts: {
  matchTypicalLoad: number|null; matchKpiAvg?: Partial<Record<string, number>>|null;
  sessionsPerWeek: number; preseasonWeeks: number;
  week1MatchMultiple?: number;   // default ~1.3× (re-entry) — configurable
  peakMatchMultiple?: number;    // default from weeklyTargetFromMatch preseason (~2.2–4.2×)
  anchor: LoadAnchor;
}): PreseasonWeekTarget[];        // one row per pre-season week; week 1 is the starting point
```

- **Week 1** at `week1MatchMultiple` (default ~1.3× match/week, conservative), over a **default of 4
  sessions** (`sessionsPerWeek` default 4, configurable), ramping to `peakMatchMultiple` over
  `preseasonWeeks` (linear or slightly progressive; ACWR-safe). Both **team** (squad match unit) and
  **individual** (per player's own match unit + minutes/readiness cap — reuse the existing per-player logic).
- **Worked example (week 1, 4 sessions, 1.3× match):** weekly load ≈ 1.3 × one match, split across 4
  sessions ≈ **~0.33× a match per session** (each KPI and the sRPE/AU scaled the same way). That is the
  controlled re-entry the coach starts from; later weeks raise the multiple (and can add a 5th session).
- **Every main KPI** scaled from `matchKpiAvg` by the same weekly multiple + the loadTargets emphasis, so
  the coach sees TD / HSR / sprint / accel / decel / PlayerLoad **and** the sRPE/AU number.
- Framed as a **starting point** ("week 1 re-entry — build from here"), fully editable.

## Surface (Periodization hub)

- In the hub, for the **selected pre-season week** (default week 1): a **team card** + a **per-player
  table** of the starting targets — all KPIs + sRPE/AU, the ×match multiple, and the ramp curve across
  the pre-season weeks. Show the anchor used ("last season's matches" / "normative" / "sRPE-only") + a
  confidence chip. Coach edits the week-1 multiple / ramp and it recomputes.
- Ties to Week setup (the week's MD/day plan) and the existing load-curve view.

## Guardrails / tests
- Pure lib; deterministic; null-safe (no match unit → normative or sRPE-only, labelled; never fabricate a
  GPS number). Advisory; coach edits. Reuse `weeklyTargetFromMatch`, `loadTargets`, `weeklyLoadTypes` — no
  new load engine. **Boundary:** targets never set the readiness colour or the daily decision.
- Tests: week 1 << peak week (re-entry); ramp monotonic to the peak multiple; per-KPI scales with the
  multiple; sRPE/AU target present; anchor fallback chain (this-season → last-season → normative → srpe);
  individual vs team differ by the player's match unit; boundary test.

`npx eslint` + tests; lint-clean.

## Acceptance
- [ ] Pre-season week-1 **starting** target (team + per-player), all main KPIs + **sRPE/AU**, in the hub.
- [ ] Week 1 is a controlled re-entry (fraction of match), with a safe ramp to the pre-season build.
- [ ] Anchored on matches (this season → last season), with normative / sRPE-only fallbacks, labelled + confidence.
- [ ] Editable starting point the coach builds from; reuses existing engines; descriptive-only boundary test passes.

## Citations
Teixeira 2021 (~80/20 training:match); Figueiredo (match as the load unit); Gabbett / Malone (ACWR, progressive
loading, controlled re-entry); Foster (sRPE). Existing preseason logic already cites these.
