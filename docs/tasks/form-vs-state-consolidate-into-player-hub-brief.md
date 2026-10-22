# Brief — fold Form vs State into Total Player Analysis (keep the read, retire the page)

**Decision:** the standalone **Form vs State** page (`/coach/form-vs-state`) should become a **section inside
Total Player Analysis**, and the top-level nav entry retired. The *read* is a real differentiator (#2 —
"is this dip genuine form loss, or was he physically compromised / was it a hard away game?") and stays; it's
just a **sub-read of the player's footballer profile**, not its own destination. Same consolidation pattern
as Progressive Overload. Advisory / performance-only — never touches the readiness colour.

Files: `src/components/coach/FormVsStatePanel.tsx` (already embeddable — has a `standalone` prop),
`src/app/coach/total-player-analysis/page.tsx` (merge target — already links out to Form vs State),
`src/components/coach/TotalPlayerProfile.tsx` (the profile + its player picker),
`src/app/coach/form-vs-state/page.tsx` (retire → redirect), `src/app/coach/CoachSidebar.tsx`
(`playersLinks` — remove the entry).

## Why fold, not delete

- **The read is unique and worth keeping.** Total Player Analysis gives a *static* season snapshot
  (strengths/weaknesses percentiles). Form vs State gives a *temporal + attribution* read: per-match OBV vs
  the player's own norm, tagged by his **readiness colour** on each match date and **context** (home/away,
  opponent level, result), separating "out of form" from "was compromised / hard fixture". Complementary,
  not duplicate — which is exactly why it belongs *in* the player hub, next to the profile.
- **It's already built to embed.** `FormVsStatePanel` takes `standalone`; Total Player Analysis already
  renders a **link-card to it**. Folding it in is dropping the card and mounting the panel — small change.
- **As a standalone page it's weak today.** The API notes per-match minutes aren't populated, so "most
  players read 'not enough matches'". That's a **data** gap, not an idea gap — a near-empty top-level page
  reads as clutter. Inside the hub it sits quietly until per-match data fills in (fed by the match-minutes /
  fixtures sync), then lights up in context.

## The merge

1. **Mount the panel in Total Player Analysis.** Replace the existing "Form vs State →" link-card
   (`total-player-analysis/page.tsx`) with `<FormVsStatePanel />` (i.e. **not** `standalone`), as a labelled
   section — e.g. under the footballer read, since it's an OBV/footballer-axis trend. Keep the in-page
   explainer (OBV glossary + verdict chips) behind the same "Show details" toggle pattern (Level-2 detail).
2. **Share the selected player.** Give `FormVsStatePanel` an optional `playerId` prop and drive it from the
   profile's current player (TotalPlayerProfile's picker) instead of its own separate picker, so switching
   player updates both. Fall back to its own picker when rendered without a `playerId` (backward-compatible).
3. **One player hub, coherent read:** profile (footballer + athlete strengths/weaknesses) → "how to improve
   the gaps" → **Form vs State** (is a recent dip real or state/context?). The three answer the coach's whole
   "how is this player doing and why" in one place.

*(Alternative home, if preferred: Player Season Analysis (`/coach/player-analysis`) is the pure season-match-
output view and is an equally valid home for an OBV-trend read. Pick one — do not leave it in two places.
Total Player Analysis is the recommended target because it's the designated hub and already links here.)*

## Retire the page

- Remove the `/coach/form-vs-state` entry from `CoachSidebar.tsx` `playersLinks`.
- Redirect `/coach/form-vs-state` → `/coach/total-player-analysis` so old links / the `form-vs-state`
  tutorial deep-link don't 404; keep the route as a thin redirect.
- Point the `form-vs-state` tutorial copy at Total Player Analysis (or fold it into that page's tutorial).
- Keep `FormVsStatePanel`, `/api/coach/form-vs-state`, and `lib/micropulse/formVsState` — they're now the
  hub's module, not a standalone page.

## Boundary (unchanged, keep it)

Form vs State **reads** the readiness colour descriptively (to attribute a dip) but never sets or overrides
it, and never touches load or the daily decision — same wall Total Player Analysis already keeps
("performance-only"). The merge doesn't change that; state the boundary once on the section.

## Acceptance

- Total Player Analysis shows a **Form vs State** section for the selected player (panel embedded, not a
  link-out); switching player in the profile updates it. The explainer stays behind a toggle.
- The standalone page is gone from nav; `/coach/form-vs-state` redirects into Total Player Analysis; the
  tutorial points there. No read lost.
- The panel, API, and lib are unchanged in behaviour; it stays advisory and never touches the readiness
  colour. EN/IS. Lint + typecheck clean; manifesto five-question check passes.

Ref: `src/components/coach/FormVsStatePanel.tsx` (`standalone` prop, add `playerId`),
`src/app/coach/total-player-analysis/page.tsx` (the link-card to replace),
`src/components/coach/TotalPlayerProfile.tsx` (shared player selection),
`src/app/coach/form-vs-state/page.tsx` (→ redirect), `src/app/coach/CoachSidebar.tsx` (`playersLinks`).
Pairs with `progressive-overload-consolidate-into-hub-brief.md` (same consolidation pattern) and the
coach-pages audit (keep / background / consolidate).
