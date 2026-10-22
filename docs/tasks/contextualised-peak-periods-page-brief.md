# Brief — Contextualised Peak Periods page (`/coach/contextualised-peak-periods`)

**Goal:** an in-app reference/explainer page presenting Ju et al. (2022)'s contextualised-peak
framework — the tactical taxonomy (Table 1) + a stacked bar chart of peak-window HIR distance by
tactical action per position + explanatory text. It is the scientific basis coaches can point to for
the Movement-signature / Fusion read. A working prototype is built:
`docs/product/contextualised-peak-periods-page.html` — match its content and layout.

**Cite:** Ju W, Doran D, Hawkins R, et al. Contextualised peak periods of play in English Premier League
matches. Biol Sport 2022;39(4):973–983. doi:10.5114/biolsport.2022.112083.

## Build
- New route `src/app/coach/contextualised-peak-periods/page.tsx`; add to `CoachSidebar` under a
  "Science" / Load-Intelligence explainer group (reference page, not a data page — no team data
  required, so it works for every club).
- **Sections (from the prototype):** (1) lede; (2) the Table-1 taxonomy in three groups — In Possession
  / Out of Possession / Unclassifiable — verbatim definitions; (3) a stacked bar chart with a position
  selector (CDP/WDP/CMP/WOP/COP) — HIR distance (m) in the peak 1/3/5-min windows split by tactical
  action; (4) a per-position totals table; (5) "Why it matters for training"; (6) "How MicroPulse uses
  this" (link to the Movement-signature card + the Fusion read).
- **Chart data is static reference data** from the paper (hard-code it, as in the prototype). Heights =
  the paper's reported peak HIR distances; the per-category split is approximated from the paper's
  reported ranges/figures. Label this honestly in a footnote — do NOT present the split as exact
  per-category values, and do NOT wire it to team data (it is the literature, not this club's data).
- Use Chart.js (already an approved artifact lib) or the repo's existing chart component. Colours from
  the design tokens; the taxonomy category colours can mirror the paper's legend (given in the
  prototype's PALETTE).

## Explainability / house rules
- English default, Icelandic toggle (`const [lang] = useLang(); const isEN = lang !== "IS"`). Translate
  the section headings, the "why it matters" and "how MicroPulse uses this" copy, and the taxonomy
  labels; keep the citation as-is. (The prototype is EN-only — Code adds IS.)
- Descriptive/reference content — it never touches the readiness colour or any decision. No AI text.
- Keep the honest framing already in the prototype: MicroPulse approximates the taxonomy from GPS/IMA +
  on-ball events; it does not reproduce Ju's hand-coded video coding. HSR threshold = >19.8 km/h (matches
  Ju and the account's Velocity Band 5 edge).

## Optional follow-on (not required for v1)
Once the Fusion card (see `fusion-card-physical-peak-x-tactical-brief.md`) exists, add a "See it on a
real match" link from this page to a player's Fusion read, so the concept and the club's own data sit
one click apart.

## Acceptance
- Page renders at `/coach/contextualised-peak-periods`, taxonomy verbatim, chart switches across the 5
  positions, totals table matches the paper, EN/IS toggle works, citation present, honest footnote on
  the chart. Lint clean.

Ref: prototype `docs/product/contextualised-peak-periods-page.html`; the paper PDF; movement-signature
(`peakMovementSignature/index.ts`), `fusion-real-data-proof.md`, `fusion-card-…-brief.md`.
