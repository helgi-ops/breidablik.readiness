# Brief — one daily session: merge the corrective block into the strength session (fix the override collision)

**Status correction:** the deficit-ledger **strength consumer is already built** — `unifiedDeficits/`
(collect → reconcile → strengthPlan) feeds `snap.ledgerEmphases`, and `applyLedgerEmphasisRules` biases the
`/coach/strength` session (plyometric / unilateral / eccentric / max-strength), MD-day-gated, acute-rules-win,
fully audited, with a vitest suite (`ledgerEmphasis.test.ts`). This brief is **not** that work. It fixes the
one real remaining gap: the **daily-delivery collision** between the two consumers.

## The gap

Both sends write the **same row**:
- Corrective send — `api/coach/movement-screen/corrective/route.ts` → `player_today_strength_override`,
  `onConflict: "player_id,entry_date"`, `structure = [{block, items: string[]}]`.
- Strength send — `strengthProgramming/persistTodayOverride.ts` → `player_today_strength_override`,
  **same** `onConflict: "player_id,entry_date"`, `structure = [{block, items: [{name,sets,reps,rest,method,note}]}]`.

So on any given day a player can have **either** the corrective box **or** the strength session — the last
send silently overwrites the first. They are the two consumers of the same reconciled ledger (corrective =
mobility/activation/movement-quality deficits; strength = force-quality deficits), and they should arrive as
**one coherent session**, not fight for one slot.

## The fix — corrective becomes a block inside the daily strength session

The `/coach/strength` session already renders **Movement Prep** and **Isometric Primer** blocks. The corrective
(screen-driven activation/mobility work) belongs there as the session's **movement-prep / activation block** —
one session, one override row, one send.

**Engine.** Give `buildStrengthSession` the player's screen-driven correctives as an optional input (reuse the
existing corrective prescription: `prescribeCorrectives(latestScreen.result.readings)` → the same activate /
mobilise / integrate items). Prepend/merge them as a **"Corrective (movement screen)"** block ahead of the
readiness-tuned strength blocks:
- The correctives are **not** readiness-set-reduced (they are low-load activation/mobility) — keep them as-is,
  like the isometric primer.
- De-duplicate against the ledger emphases: if a corrective already covers a quality the emphasis would add
  (e.g. the screen's glute-med activation vs a unilateral emphasis), keep one and record the corroboration
  (the same CONFIRM-vs-ADD pattern `applyLedgerEmphasisRules` already uses).
- Structure unification: `strengthSessionToTodayStructure` already emits `{name,sets,reps,rest,method,note}`
  items; render the corrective items in that shape (name + dose + cue→note) so the whole session is one
  structure and PlayerClient renders it with no new code.

**Delivery.** One **"Send to player's app"** writes one `player_today_strength_override` row carrying
Corrective + Isometric Primer + strength blocks. Retire the separate corrective upsert to that table (the
Correctives tab's "send" routes into the same session builder instead of writing its own override), so the two
paths can never overwrite each other.

**MD / rest-day handling.** On non-strength days (`buildStrengthSession` returns null for MD+1 recovery / rest /
injured), the corrective can still be delivered on its own (activation/mobility is fine on a recovery day) —
so keep a fallback corrective-only override for those days. The collision only needs resolving on strength
days, where both would otherwise write.

## Source routing — strength runs on VALD ForceDecks (CMJ **and IMTP**); corrective runs on the screen (+ IMA)

The intended split is already the architecture (`quality.ts` `QUALITY_DOMAIN` "drives which consumer reads it"):
VALD → strength qualities (reactive_strength, force_deficit, velocity_deficit, limb_asymmetry, decel_mechanics)
→ strength emphasis; movement screen (+ IMA mobility/mechanics) → corrective qualities (valgus, glute-med,
ankle-DF, hip/T-spine mobility) → corrective. Keep and honour that split.

**Wired today (CMJ):** `valdSignals.ts` reads `vald_forcedecks_results` and emits CMJ asymmetry → unilateral,
RSI-mod → plyometric/reactive, long eccentric phase → eccentric/absorption.

**Gap to close (IMTP) — required for "strength primarily from CMJ + IMTP":** IMTP is ingestible
(`vald` mappers/ingest recognise it, store `imtpPeakForce`) but **nothing reads it into the ledger**.
`force_deficit` / `velocity_deficit` are emitted **only by VBT (GymAware LV-profile)** — not by IMTP. So the
max-strength driver does not come from IMTP today. Add an **IMTP signal source** to `unifiedDeficits`:
- **IMTP peak force (relative to body mass)** low → `force_deficit` (max-strength emphasis), `source: "vald"`,
  status confirmed. IMTP early **RFD** low → an explosive-strength/reactive nudge.
- **DSI = CMJ concentric peak force ÷ IMTP peak force** (needs both tests): low DSI (≈<0.6) → ballistic /
  speed-strength (`velocity_deficit`); high DSI (≈>0.8) → max-strength (`force_deficit`) — Comfort/Sheppard
  interpretation; make thresholds configurable and flag as such.
- Reconcile with VBT: when both VALD-IMTP and VBT point the same way → one higher-confidence deficit; when they
  conflict → surface both (the reconciler already does this). VALD/IMTP is the **primary** strength driver;
  VBT complements it (and covers clubs without IMTP).

**IMA stays mostly corrective/mechanics** (decel_mechanics, directional) as the coach expects; IMA asymmetry may
still nudge `limb_asymmetry` (unilateral) but does not become a primary strength driver — CMJ/IMTP do.

## Readiness / MD connection + auto vs manual (unchanged by this brief)

The merged session **inherits the existing automatic generation** — no new manual work:
- **MD comes from the week setup** — `fetchMdContext` reads `week_plans` (coach MD-override optional).
- **Readiness-tuned** — `verdict` (athlete_decision_history) + wellness (readiness_entries) tune every session;
  the deficit emphases are auto-collected + reconciled. The corrective block uses the player's latest screen.
- So the content builds **per player, automatically, MD- and readiness-appropriate** — the coach authors nothing.

**Delivery stays the existing one action, team-wide:** `POST /api/coach/team/send-strength-sessions` already
iterates all active players, builds each session, persists each override, and web-pushes — one coach click
sends the whole team their individualised session. This brief keeps that trigger (the manifesto review-gate:
coach + AI-refinement + override before the player sees it); the corrective merge simply rides the same build +
the same single send. **Out of scope:** a scheduled/cron auto-send (fully hands-off, no click) — a separate
opt-in decision, not required here. Nothing in this brief makes the coach do per-player manual work.

## Explainability (unchanged principles)

- One session, layered read: verdict/summary → the blocks (Corrective, primers, strength) → per-item "why"
  (cue as note; emphasis provenance "see Total Player Analysis"). Corrective items keep their screen source +
  re-screen note; emphasis items keep their ledger audit.
- Coach still has the final word (overrides applied last); nothing auto-advances anything; descriptive only —
  never the readiness colour; injured → physio rehab block, not this session; pain / red flags → clinician.

## Acceptance

- `buildStrengthSession` accepts the player's screen correctives and merges them as a **Corrective block** at
  the front of the daily session, in the unified `{name,sets,reps,rest,method,note}` structure; de-duplicated
  against ledger emphases (CONFIRM vs ADD), not readiness-reduced.
- **One send, one override row** carries corrective + primers + strength; the Correctives-tab send routes
  through the session builder rather than writing its own `player_today_strength_override` — the collision on
  `(player_id, entry_date)` is gone.
- Non-strength days keep a corrective-only fallback (activation/mobility on recovery); injured players still
  get the physio-rehab block, not a strength session.
- Every item traceable (corrective → screen + re-screen note; emphasis → ledger audit); coach override wins;
  descriptive only — never the readiness colour. EN default / IS toggle. Lint + typecheck clean; the existing
  `ledgerEmphasis` vitest suite still passes + a new test asserts one merged override (no double-write).

Ref: `strengthProgramming/index.ts` (`buildStrengthSession`), `adaptationRules.ts` (`applyLedgerEmphasisRules`,
CONFIRM/ADD, MD-gating, acute-rules-win), `strengthProgramming/loader.ts` (`fetchLedgerEmphases`),
`unifiedDeficits/` (collect/reconcile/strengthPlan — the built ledger), `toTodayStructure.ts` (unified item
shape), `persistTodayOverride.ts` + `api/coach/movement-screen/corrective/route.ts` (the two colliding sends),
`movementScreen/correctives/mapping.ts` (`prescribeCorrectives`, `prescriptionToStructure`),
`unified-individualisation-engine-deficit-ledger-spec.md` (two-consumers-one-ledger),
`corrective-isometrics-and-clinician-panel-grouping-brief.md`, `docs/explainability-first.md`.
