# Claude Code brief — off-week / holiday maintenance program (strength + running)

Goal: when players go on a week off, let the coach generate and send each player an **individualised
multi-day maintenance program** — strength + running — that they can do **self-guided, anywhere, offline**.
Framed as **maintenance, not building** (don't detrain): mid-season research shows ~1–2 strength
sessions/week + some running retains the pre-break level; the aim is "keep the engine ticking".
**Descriptive/coach-owned; never the readiness colour.**

## Where it appears for the coach

**Team Planning → Week setup (`/coach/week-setup`)** — a week off is a *week the coach plans*, so this is
its home. When the coach marks the week (or its days) **OFF / break**, surface a **"Generate & send
off-week program"** action → builds per-player plans → sends to the player app + offers a **PDF per player
(or a team pack)** to download. Also reachable from the strength send flow. Each player then sees the plan
in the **player app** (and has the offline PDF).

## Reuse (don't rebuild)

- **Strength engine** (`strengthProgramming`) + **e1RM / VBT** for individual loads; the season-phase
  brief's maintenance templates. Add a **bodyweight fallback** for players with no gym on holiday.
- **Running:** `intervalSpeedsFromMas` (Type 1–5 %MAS speeds per player) + the `intervalSession.ts` brief
  → prescribe runs at the player's own speeds.
- **Delivery:** the existing "send to player's app" path (`player_today_strength_override` / strength send)
  extended to a multi-day plan; **PDF** via the `pdf` skill; the player PWA for viewing.
- **Season logic:** `detectSeasonPhases` / the break = mini-block trigger — an off-week is a maintenance
  micro-block.

## Individualised by NEED (each player gets what HE needs — the core)

The plan is **driven by a per-player needs profile**, not a generic template with swapped loads. It pulls
the signals MicroPulse already computes and **weights the week toward what that player needs**, while
maintaining the rest:

| Signal (reuse) | If it flags… | The plan does |
|---|---|---|
| `unifiedDeficits` ledger | hamstring/adductor/eccentric or asymmetry deficit | eccentric emphasis + Nordic/Copenhagen; unilateral work |
| `positionFitnessRequirements` / fitness fit | below his position's aerobic requirement | more running volume |
| `fitnessTrend` (MAS/CS) | aerobic trending down | add a tempo/interval run |
| `preseasonEmphasis` + `bodyComposition` | low relative strength / low lean mass | strength- or hypertrophy-leaning (with body comp) |
| RTP / injury status | on a return-to-play track | **continue his rehab track**, not a generic plan |
| recent minutes + `robustnessWatch` | high load / carrying fatigue | lighter, more recovery; fewer hard days |
| otherwise | no strong flag | balanced maintenance (the default) |

Each player's plan shows **why** ("extra eccentric hamstring — right-limb deficit; more aerobic — MAS
trending down; lighter — 3 congested weeks"). **Honest coverage:** thin data → fall back to balanced
maintenance, labelled; RTP players are never given a generic plan over their rehab. Advisory — the coach
edits per player before sending.

## The plan model

New pure lib `src/lib/micropulse/offWeek/plan.ts`:

```ts
export type GymAccess = "gym" | "bodyweight";
export interface PlayerNeeds {                 // assembled from the signals above (server-side)
  deficitEmphases?: string[];                  // eccentric / unilateral / …  (unifiedDeficits)
  belowAerobicReq?: boolean;                   // positionFitnessRequirements / fitness fit
  masTrend?: "up"|"stable"|"down"|null;        // fitnessTrend
  strengthLean?: "hypertrophy"|"max_strength"|"power"|"balanced"|null; // preseasonEmphasis + bodyComp
  rtpTrack?: string|null;                      // continue this rehab track instead of a generic plan
  fatigueFlag?: boolean;                       // recent minutes + robustnessWatch → lighten
}
export interface OffWeekInputs {
  days: number;                 // e.g. 5–7
  masKmh: number|null;          // running speeds
  oneRepMaxes?: Record<string, number>|null;  // gym loads (else bodyweight)
  gymAccess: GymAccess;
  needs: PlayerNeeds;           // the individualisation driver
  readinessNote?: string|null;  // e.g. carrying a niggle → lighten
}
export interface OffWeekDay {
  dayIndex: number; type: "strength"|"run"|"combined"|"rest";
  title: Bi; blocks: Array<{ label: Bi; prescription: Bi }>;  // RPE / time / distance — NO GPS needed
  note: Bi;
}
export interface OffWeekPlan { days: OffWeekDay[]; summary: Bi; caveat: Bi; }  // "maintenance week — self-guided"
export function buildOffWeekPlan(inp: OffWeekInputs): OffWeekPlan;
```

- **Self-guided prescriptions only:** RPE, time, distance, reps — runnable anywhere, no GPS/coach.
- **Default shape (tunable):** ~2 strength sessions (key lifts at RPE 7, or a bodyweight circuit), ~2 easy
  aerobic runs + 1 tempo/interval at the player's %MAS speeds, rest days between. Fewer days → drop the
  extras first (maintenance minimum).
- **Individualised by need:** the `needs` profile weights the week (more eccentric / more running /
  strength-lean / lighter / continue rehab), on top of individual loads (`oneRepMaxes` else bodyweight)
  and speeds (`masKmh` else time/RPE). Each player's plan carries its per-player "why".
- **Honest labels:** "maintenance — not a building block"; loads/speeds only as accurate as the last
  test; the coach edits before sending.

## Delivery

- **App:** persist the multi-day plan to the player (extend the strength-send store to hold a dated
  multi-day plan, or one row per day); the PWA renders it and works offline once loaded.
- **PDF:** a clean per-player sheet (name, the days, prescriptions, RPE/pace key) via the `pdf` skill —
  the offline artefact for travel. Option to export a **team pack** (all players) in one action.
- Coach reviews/edits in Week setup before sending (coach owns).

## Guardrails / tests

- Pure `plan.ts`; deterministic; null-safe (no MAS → runs as time/RPE; no 1RM → bodyweight); never
  fabricate loads/speeds. Advisory; coach edits + sends.
- Reuse strength engine, `intervalSpeedsFromMas`, the send path, the pdf skill — no new engines.
- **Boundary:** the off-week plan never touches the readiness colour or the daily decision.
- Tests: 7-day plan has ~2 strength + 2–3 runs + rest; bodyweight when no 1RM; runs as time/RPE when no
  MAS; fewer days trims extras; PDF renders per player; boundary test.

`npx eslint` + tests; lint-clean. Any store/migration saved under `supabase/migrations/`.

## Acceptance
- [ ] "Generate & send off-week program" in Week setup (OFF/break week) → per-player strength+running plan.
- [ ] Individualised **by need** — a per-player needs profile (deficit ledger, aerobic fit, MAS trend,
      body-comp/strength lean, RTP, fatigue) weights the week, with a per-player "why"; RTP players keep
      their rehab track; thin data → balanced maintenance, labelled. Plus individual loads/speeds.
- [ ] Sent to the player app (offline-capable) + per-player PDF (and team-pack export).
- [ ] Coach edits before send; descriptive-only boundary test passes; reuses existing engines; eslint+tests clean.

## Citations
Rønnestad 2011 (in-season maintenance dose); Mujika & Padilla 2000 (detraining); Buchheit & Laursen (MAS
running zones). See `docs/tasks/strength-periodization-off-pre-in-season-research-synthesis.md`.
