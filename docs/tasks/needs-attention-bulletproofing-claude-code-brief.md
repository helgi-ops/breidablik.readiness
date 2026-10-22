# Claude Code task — make "Needs attention" (Today) bulletproof

Paste to Claude Code (or `@docs/tasks/needs-attention-bulletproofing-claude-code-brief.md`).

## Goal

The **Needs attention** panel on the coach Today page is the single most consequential surface in the
app — it's the list a coach acts on every morning. It must never (a) fire a hard **ALERT** on data that
isn't really there, (b) show a "↓↓ worse" trend built on an estimate, or (c) disagree with the other
"Needs attention 3" counts on the same screen. This task hardens the selection + delta logic and locks it
with a test matrix. **Behaviour changes are conservative: prefer softening/labelling a flag over dropping
it — but an estimated flag must be visibly estimated, not identical to a measured one.**

## What exists today (grounded — don't rebuild)

- **`buildAttentionList()`** in `components/coach/DailyBriefingCard.tsx` is the single source that turns
  `BriefingRow[]` → `AttentionItem[]`. It reads the **canonical** `row.final_color` (correct per
  CLAUDE.md), layers injury → readiness colour → composite/load → neural/adaptation reasons, sets
  `level: "alert" | "monitor" | "ok"`, and attaches `confidence`, `baselineMaturity`, and `delta`.
- **`computeDelta()`** (same file) computes the day-over-day "worse/better/new/same" from today's colour
  + score vs `playerDeltas[playerId]` (yesterday's colour/score).
- **`computeAttentionConfidence()`** already scores coverage (5 signals) and returns `level:
  high|moderate|low` + notes ("No check-in today", "Last check-in: …").
- **`AttentionList.tsx`** is presentational; the dashboard (`DevCoachDashboardClient.tsx` ~L9736–9805)
  maps `AttentionItem` → the grouped list (`ALERT / REHAB / INJURED / WATCH`) and the ↑↑/↓↓/● delta.
- The Decision Summary card renders its own "Needs attention" count from **`system_decision` +
  `final_color`** — a *different* code path.

## The gaps to close (ranked)

### 1. Imputation blindness (the #1 gap)
`v_coach_readiness_today_v8` exposes **`is_imputed`** (task #12) and the coach UI already labels estimated
verdicts (task #13) — but **`BriefingRow` has no `is_imputed` field**, and neither `buildAttentionList`
nor `computeDelta` consult it. Consequence: a player who didn't check in, whose RED is an *estimate*,
fires the exact same hard ALERT as a measured RED, and can show "↓↓ worse".
- **Fix:** add `is_imputed?: boolean | null` to `BriefingRow`; thread it from the canonical view through
  the dashboard row mapping.
- An **estimated** verdict must **not** produce an identical hard ALERT. Cap it at a **labelled
  "provisional / estimated"** state (keep it visible — coaches still want to know — but distinct from a
  measured alert; reuse the existing estimated-verdict label styling from task #13).
- The confidence pill already says "No check-in today"; make the **row itself** carry the estimated
  marker, not just the tooltip.

### 2. Delta validity + freshness
`computeDelta` compares today↔yesterday with no check that either side is real/fresh.
- **Suppress or relabel** "worse/better" when **today or yesterday is imputed**, or when today's
  `entry_date !== todayIso` (stale row). Show "estimated" / "new today" instead of a confident trend.
- A "worse" built on an imputed today- or yesterday-colour is misinformation — this is the most
  dangerous single output on the page.

### 3. One count, three places (single-source)
The panel header count, the **ALERT today** group count, and the **Decision Summary "Needs attention"**
badge must all derive from **one selector**. Today the Decision Summary uses `system_decision` /
`final_color` independently, so the two "3"s on the same screen can silently diverge.
- **Fix:** extract a single `selectNeedsAttention(rows, …)` (or reuse `buildAttentionList`) and have both
  cards consume it. Add a test asserting the counts are identical for a shared fixture.
- Per CLAUDE.md: never surface `athlete_decision_history.athlete_state` or
  `stage4_decisions.system_decision` **as the verdict colour**. The list's colour stays `final_color`;
  `system_decision` may inform the *action* text only.

### 4. Confidence-gated flag weight
`baselineMaturity` and `confidence.level` are computed and shown, but a RED resting on **5 observations /
low coverage** fires an identical ALERT to one on 25.
- When `confidence.level === "low"` **or** baseline is immature (e.g. `obs < MIN_MATURE_OBS`), tag the
  alert **"provisional"** (same treatment as estimated). Don't drop it — label it. This is the manifesto's
  "every verdict shows its confidence" made operational at the alert level.

### 5. Magic numbers → named, cited constants (drift-proofing)
Extract and share (single source with the load/readiness engines; add the paper cite next to each):
- readiness low-score threshold `12` (`(row.total_score ?? 99) <= 12` — also kill the `?? 99` sentinel);
- PL-spike thresholds `1.15` / `1.6`; composite `high`/`moderate`;
- delta "meaningful score move" `>= 3`;
- confidence ratios `0.8` / `0.5`.
Duplicated literals across the attention list, the dashboard badge (`>= 1.6`), and the engines will drift;
one constant module per threshold, imported everywhere, prevents it.

### 6. Determinism
- **Dedupe by `player_id`** before building (a duplicated row today = the player listed twice).
- Add a **stable final tiebreak** (`playerId`) to every sort (`buildAttentionList` group sort +
  `AttentionList` group sort) so ordering can't jitter day-to-day on ACWR ties.

### 7. Graceful degradation (make explicit + tested)
- Post-match downgrade (`isPostMatchContext`) depends on `recentDayTypes` / `md_day`; when both are
  missing, a normal MD+1 load echo currently fires ALERT. Decide + test the intended behaviour (prefer:
  if plan data is absent, annotate "match context unknown" rather than silently hard-alerting).
- Injured category depends on `playerInjuries[id].status`; ensure a **closed/expired** injury can't keep
  a player pinned in INJURED (verify upstream status freshness; test a resolved injury drops off).

## Test matrix (the proof of "bulletproof")

Add unit tests (pure functions are already testable) covering, at minimum, expected `level` + `delta`
for each row:

| Scenario | Expected |
|---|---|
| Measured RED, full data | ALERT, delta as computed |
| **Imputed RED (no check-in today)** | **provisional/estimated, NOT hard ALERT; delta = estimated/none** |
| RED today, yesterday imputed | delta relabelled (not a confident "worse") |
| Stale row (`entry_date` = 3 days ago) | freshness-flagged; delta not "worse" |
| Measured RED, baseline obs < MIN_MATURE | ALERT tagged "provisional" |
| YELLOW, low coverage (1/4 wellness) | monitor, provisional |
| Post-match MD+1 PL spike 1.7× | monitor (downgraded), "post-match" annotated |
| Post-match spike, plan data missing | annotated "context unknown", not silent hard alert |
| Active injury + green readiness | in list (INJURED/REHAB), injury leads |
| Resolved injury | not pinned in INJURED |
| Duplicate player_id in rows | listed once |
| No rows / all green | empty state ("Everyone ready…") |
| ACWR tie between two players | stable, id-ordered |
| Count parity | header == ALERT-group-sum-of-alerts == Decision Summary badge |

## Where (build layout)

- `components/coach/DailyBriefingCard.tsx` — add `is_imputed` to `BriefingRow`; gate `buildAttentionList`
  level + `computeDelta` on imputation/freshness/confidence; extract the shared `selectNeedsAttention`.
- `DevCoachDashboardClient.tsx` — thread `is_imputed` (and any freshness field) into the rows; point the
  Decision Summary count at the shared selector; add the stable tiebreak in the mapping.
- New `lib/micropulse/attention/thresholds.ts` (or similar) — the named constants, each with its citation.
- Unit tests alongside (`__tests__`), covering the matrix above.
- Bilingual EN/IS for every new label ("estimated", "provisional", "match context unknown").

## Acceptance

- An imputed/estimated verdict never renders an identical hard ALERT to a measured one — it's visibly
  estimated, and its delta is not a confident "worse/better".
- The three "Needs attention" counts on the Today page are provably equal (test).
- Every threshold is a named constant with a citation; no bare `12` / `1.6` / `?? 99` literals remain in
  the attention path.
- Duplicate rows can't double-list a player; sort order is deterministic.
- The full test matrix passes; `npx eslint` clean on touched files; no new lint errors; stage specific
  files only.
- The canonical colour is still `final_color`; `athlete_state` / `system_decision` are never surfaced as
  the verdict colour.

## Do NOT

- Do **not** silently **drop** a flag to make the panel look cleaner — soften/label, but a real concern
  stays visible.
- Do **not** read `athlete_decision_history.athlete_state` or `stage4_decisions.system_decision` as the
  verdict colour (CLAUDE.md). The trajectory "↓↓ worse" delta is the sanctioned trend surface — keep it
  labelled and built from the canonical colour/score history, not from `athlete_state`.
- Do **not** treat missing data as 0 or as "fine": no check-in / no baseline / no load = **no-data**,
  labelled — never an implied green.
- Do **not** change the visual grouping or the layered read; this is a correctness/robustness pass.
