# Check-in reliability → a DISPLAY-ONLY confidence badge (safe scope)

The full reliability spec proposed feeding the check-in-variability class into flag **confidence**
("lower confidence on that player's flags"). That was held back because confidence is not purely
cosmetic — it **gates** in places, so a naive down-weight could hide a genuinely struggling but
erratic reporter's real flag (Gylfi: SD 3.10, 54% flagged). This brief scopes the SAFE version: a
badge that annotates the flag the coach already sees, and touches **no** value that any gate reads.

## Non-negotiable
- **Display only.** The badge reads the already-computed `_checkin_reliability` note (from
  `/api/coach/team/checkin-reliability`, plumbed onto each Decision Summary row) and renders a small
  caveat. It **never writes or modifies any `confidence` value** anywhere.
- **Never suppresses, downgrades, or hides a flag.** Every flag that shows today still shows,
  unchanged, at the same urgency. The badge is additive context beside it.
- Never the readiness colour, never a verdict. Bilingual EN/IS. Soft, non-punitive framing.

## The danger zones the badge must NOT touch (why the modifier was held)
Confidence is consumed by real gates — leave every one of these exactly as-is:
1. `src/lib/micropulse/attention/attentionEngine.ts:1277` —
   `provisional = !injury && !estimated && (confidence.level === "low" || immatureBaseline)`.
   Low confidence downgrades a flag to *provisional* (kept visible, but de-emphasised). This
   `confidence` is **data** confidence (coverage + freshness via `computeAttentionConfidence`), not
   check-in reliability. Feeding reliability into it would make an erratic reporter's flags
   provisional — a real change to weight. **Do not.**
2. `src/lib/micropulse/coachSignals/index.ts` — the `form_vs_state` adapter (~line 121) returns
   *steady / no chip* for a `low`-confidence (mostly-imputed) read. So confidence **suppresses a chip**
   in some adapters. Feeding reliability into a signal's `confidence` could stop the chip raising.
   **Do not.**
3. `_final_recommendation_decision.confidence` → `confidenceToBand()` → the modal header. This is the
   engine's decision confidence; the badge sits **beside** its label, it does not alter it.

The badge is safe precisely because it derives from `_checkin_reliability` — a signal computed
**independently** of the flag pipeline — and is rendered, never fed back in.

## What the badge is
A small, muted chip shown **only** when `row._checkin_reliability` is set (i.e. the player is at a
variance tail), placed next to the existing confidence label:
- `low_variability` → "norm: near-constant check-ins" (amber-muted).
- `low_variability` + auto-fill (`repeatRate ≥ 0.5`) → "norm: likely auto-filled" (the repeat-rate
  detector already names this in `reason`).
- `high_variability` → "norm: erratic check-ins".
Tooltip / drawer already carries the full plain-language `reason` (already shipped). The badge is just
the at-a-glance marker that points the coach to it.

Copy (bilingual, `{ en, is }`), e.g.:
- EN "Norm reliability: erratic check-ins" / IS "Áreiðanleiki viðmiðs: ósamkvæmar skráningar".
- EN "Norm reliability: likely auto-filled" / IS "Áreiðanleiki viðmiðs: líklega sjálfvirkt útfyllt".

## Where it surfaces (all read-only)
1. **Decision Summary modal header** — `src/components/coach/DecisionSummaryCard.tsx:1284-1285`,
   right after `{confidence} confidence`. Render `· {reliabilityBadge}` when `_checkin_reliability`
   is set. Primary home; the full note already lives in the drawer below (`ReadinessLoadDetail`).
2. **(optional) Attention row** — `src/components/coach/AttentionList.tsx`: a tiny inline marker on a
   reliability-flagged player's row, so the caveat rides along with the attention flag. Must be a
   pure visual add — do NOT route it through `attentionEngine` confidence.
3. Stop there. The main-view compact chip and the drawer note already exist; the manifesto's
   layered read is satisfied (glance badge → drawer "why").

## Data — nothing new to compute
`_checkin_reliability` (`{ level, sd, n, reason, reasonIs }`, plus `repeatRate` in the API payload) is
already fetched into `checkinReliability` state and enriched onto every row. The badge is a pure
render off `row._checkin_reliability.level` (+ the auto-fill flag from `reason`). No new endpoint, no
engine change.

## Guardrails
- Grep-proof the "no gating" promise: the diff must add **zero** references to `_checkin_reliability`
  inside `attentionEngine.ts`, `coachSignals/`, or any `confidence`-producing function. It appears
  only in render code (DecisionSummaryCard / AttentionList JSX).
- No new lint errors; the badge is muted (slate/amber), visually subordinate to the verdict + the
  real confidence band — it must not read as its own alert.

## Verification
- **Behavioural invariant:** snapshot the set of flags / attention items / chips for the squad before
  and after — identical. Same players flagged, same levels, same provisional markers, same confidence
  bands. Only new DOM is the badge.
- Visual: on Breiðablik, the badge appears for the 8 reliability-tail players (6 high, 2 low, 2 of
  which show "likely auto-filled" — Gabríel 0.75, Andri 0.67) and for nobody else.
- Confirm zero change to `readiness_entries.color` and to any `confidence` value.

## Rollout
1. Badge component + copy; render at DecisionSummaryCard:1285 (primary).
2. Optional: the AttentionList inline marker.
3. Before/after flag-set snapshot to prove the behavioural invariant.

Ref: `checkin-reliability-note.md` (memory), `dataQuality.ts` (`checkCheckinVariability` +
`checkinRepeatRate`), `/api/coach/team/checkin-reliability`, `DecisionSummaryCard.tsx:1195-1285`,
`attention/attentionEngine.ts:1277` (the gate to leave untouched), CLAUDE.md (canonical colour).
