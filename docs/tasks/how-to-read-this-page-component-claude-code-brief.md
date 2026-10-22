# Claude Code task — "How to read this page": an in-app, per-page, column-level explainability guide

Paste to Claude Code (or `@docs/tasks/how-to-read-this-page-component-claude-code-brief.md`).

## What this is (and the one-line why)

The whole-system "how to use" is good but generic. This task adds a **per-page, contextual "How to read
this page"** surface that goes **column by column** and — crucially — teaches the **explainability read**
(verdict → why → counterfactual → confidence → evidence), because that is the thing MicroPulse does that
no other load app does. Ship it for **Load Intelligence first**, as a reusable component every page can
adopt.

The content is already written and grounded in the live code:
`docs/how-to-use/load-intelligence-how-to-read.md` (thresholds and citations verified against
`lib/micropulse/externalLoad/signals.ts`). This task is about **surfacing** it in-app, not inventing it.

## The principle (why this is different from a tooltip/data-dictionary)

Every column gets **four layers**, and the component must render them in this order (never collapse 1–3
into the same toggle as the raw detail — that violates the explainability manifesto):

1. **What it is** — plain language, no jargon.
2. **How to read the badge** — the exact bands/cut-offs the page actually uses.
3. **The explainability read** — the "why", a **counterfactual** ("if X had been Y → clear"), and the
   **confidence** (enough data / mature baseline?).
4. **The evidence** — the paper the signal is built on.

The page already has per-column `i` info popovers (`GpsLoadIntelligence.tsx` → `metricInfo`), but those
only cover layer 1–2. This task **extends that same content model** to all four layers and adds a
page-level "How to read this page" entry point.

## Status — extend what exists, don't fork

- `GpsLoadIntelligence.tsx` already defines `metricInfo` (bilingual, per `SortKey`) rendered in a
  `Popover`. **Extend that structure**, don't build a parallel one:
  ```ts
  metricInfo[key] = {
    title, whatItIs, howToRead: [{badge, meaning}], why, counterfactual, confidence, citation
  }
  ```
  Keep the existing `i` popover but enrich it to show all four layers.
- Add a page-level **"How to read this page"** trigger (a link/button in the card header, next to the
  "23 players" pill) that opens a drawer/sheet containing: the 5-second glance explanation, the
  layered-read order (verdict → cohort alerts → tiles → table), and every column's four-layer block.
- The content strings come **verbatim from `docs/how-to-use/load-intelligence-how-to-read.md`** (single
  source of truth). Do not paraphrase numbers — the thresholds there are copied from the code.

## Reusability (this is a component, not a one-off)

- Build a generic `<HowToReadPage>` drawer + a `<MetricExplainer>` block that take a typed content model:
  ```ts
  type MetricExplainer = {
    key: string;
    title: { en: string; is: string };
    whatItIs: { en: string; is: string };
    howToRead: Array<{ badge: string; meaning: { en: string; is: string } }>;
    why: { en: string; is: string };
    counterfactual: { en: string; is: string };
    confidence: { en: string; is: string };
    citation: string; // paper, language-neutral
  };
  type PageGuide = { pageKey: string; glance: {en;is}; readingOrder: {en;is}; metrics: MetricExplainer[] };
  ```
- Store each page's guide as data (e.g. `lib/micropulse/pageGuides/loadIntelligence.ts`) so the other
  pages (Decel, IMA, HSR, Today, Readiness, HR Intelligence, …) can add their own guide file and reuse
  the same components. Load Intelligence is the reference implementation.

## Design / explainability rules (non-negotiable)

- **Layered read preserved:** the drawer opens on the glance + reading order; column detail is expandable
  underneath. Never dump all raw bands before the plain "why".
- **Bilingual EN/IS**, English default, matching the page's existing `lang` prop; jargon (ACWR, Band 2–3,
  MVC, HID%) stays inside the explainer, never in the primary table view.
- **Counterfactual + confidence are mandatory** for every metric block — if a metric genuinely has no
  counterfactual, say why ("directional signal, not a threshold"), don't omit the layer.
- **No-data ≠ zero:** the guide must state, per relevant column, that "—" means no pod / lower Catapult
  tier, never 0 (mirror the code's `hasAnySignal` / self-hide logic).
- Design tokens from the redesign (`globals.css`): cobalt `#2740e6` for the trigger/links, the
  traffic-light greens/ambers/reds already used for the badges; Archivo headings / Geist body.
- Accessible: the drawer is keyboard-navigable, the `i` popovers keep `aria-label`, no colour-only
  meaning (badge text + colour).

## Where (build layout)

- `components/coach/HowToReadPage.tsx` (generic drawer) + `components/coach/MetricExplainer.tsx` (one
  metric's four-layer block).
- `lib/micropulse/pageGuides/loadIntelligence.ts` — the typed content, transcribed from
  `docs/how-to-use/load-intelligence-how-to-read.md`.
- Wire the trigger into `GpsLoadIntelligence.tsx` header and enrich its existing `metricInfo` popovers to
  the four-layer model (reuse the same guide data — one source).
- No DB change expected. If any content is stored server-side later, save migrations as timestamped
  `.sql` (CLAUDE.md).

## Acceptance

- Load Intelligence shows a "How to read this page" trigger that opens a drawer with: the glance, the
  reading order (verdict → cohort alerts → tiles → table), and a four-layer block for all six columns
  (Load, Decel Burden, Acc:Dec, HID%, Res. Decel, PL Spike).
- Every column's per-`i` popover shows all four layers (what / how-to-read / why + counterfactual +
  confidence / citation), in EN and IS.
- Every number in the guide matches the live thresholds in `signals.ts` (decel bands 0.20/0.45/0.70;
  Acc:Dec 0.7/1.3; HID fatigue ≥20% + stable distance; residual 60/100/135; PL spike 1.15/1.5) — add a
  test or a comment linking each to its source constant so they can't silently drift.
- Components are generic: a second page could be added by dropping in a new `pageGuides/*.ts` with no
  component changes.
- `npx eslint` clean on touched files; the page renders in both languages; stage specific files only.

## Do NOT

- Do **not** paraphrase or round the thresholds — copy them from the code/`load-intelligence-how-to-read.md`
  and keep them linked to their source constant so they can't drift.
- Do **not** collapse the plain "why" into the same toggle as the raw bands (layer 3 must be reachable
  without opening layer 2's detail).
- Do **not** build a Load-Intelligence-only widget — it must be the reusable component the other pages
  adopt.
- Do **not** introduce jargon into the primary table/tiles; it lives inside the explainer only.
- Do **not** claim a signal is a verdict — these explain the existing signals; the canonical readiness
  colour is untouched.

## After this ships

Roll the same pattern to the other deep pages in priority order — Today (command centre), Readiness,
Decel Intelligence, HSR, IMA, HR Intelligence — each as a `pageGuides/*.ts` file. The per-page written
content already exists for many of them in `docs/load-guides/` (the "full-page-explained" series) and can
be transcribed into the same four-layer model.
