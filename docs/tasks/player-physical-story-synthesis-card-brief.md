# Brief — "Player physical story" synthesis card (explainability that ties the Load Intelligence cards together)

**Goal:** a single card at the **top of the Power Curve player tab** (`/coach/load-intelligence-hub?tab=
powerCurve`, above *Role-demand fit*) that reads the cards already on the page and tells the coach **one
coherent story** — so they get the whole picture in a sentence before drilling into any single card. This
is the manifesto's layered read applied to the whole page, not a new metric.

Right now the page shows seven strong cards (Role-demand fit, Power curve, Season trend HSR+IMA, Season
IMA, Movement Signature, Mechanical load by direction, Movement Style). Each is excellent on its own, but a
coach has to assemble the narrative himself — and can hit apparent contradictions (e.g. "multidirectional"
in one card, "linear runner" in another). This card does that assembly for him.

## The layered read (explainability-first, per `docs/explainability-first.md`)

- **Level 0 — one-sentence verdict** (bold, first, the ~5s glance): the player's physical identity in one
  line. *Example (Kristófer Ingi): "Centre-forward with a strong, durable endurance engine that moves
  unusually for the position — more box-to-box than target-man — with anaerobic reserve and mechanical
  power the things to build."*
- **Level 1 — 2–3 plain supporting facts** (the ~15s "why", visible without a click), each ending with a
  small **source tag** naming the card it came from, so the coach can jump to it:
  1. *Durable engine.* "Holds 82% of his hardest-minute pace over 5 minutes — above the squad." → *Power
     curve*
  2. *Unusual shape.* "Works mostly left-forward and right-back, more lateral than a typical striker." →
     *Role-demand fit · Movement signature*
  3. *Recent trend.* "High-speed running has drifted down over the last few matches; movement is
     multidirectional." → *Season trend*
- **Level 2 — "Show the full read"** toggle: doesn't repeat the cards; it (a) reconciles the apparent
  tensions in plain language and (b) links/anchors down to each card. Never jump 0 → 2.

## Reconcile the tensions in plain words (the coach's real confusion)
The card must resolve, in one line each, the contradictions a coach will notice:
- **"Multidirectional" vs "linear runner":** "He *positions* laterally a lot (covering/shuffling), but
  when he runs *fast* it's straight-line — both are true, different measures."
- **"Solid engine" + "watch-item".** "The aerobic base is strong; the gap is the explosive/repeated-sprint
  base underneath the peaks — that's the watch-item, not the endurance."
- **"At norm output" + "HSR trending down".** "Output is at his usual level; the recent HSR dip is worth
  a glance — form or load management, not yet a flag."

## How it's composed — rules, not free AI
Compose deterministically from the **already-computed outputs** of the cards below (do NOT re-derive the
metrics; read their results):
- Role-demand fit → engine/driver/output verdicts + watch-items.
- Power curve → retention % + squad rank.
- Season trend → HSR direction (up/down/steady) + latest/rolling.
- Season IMA / Movement signature → accel-decel density trend, forward/back/lateral mix, top two directions.
- Movement style → linear ↔ multidirectional label.
Use sentence **templates** keyed off these values (verdict picks from engine×driver×output combinations;
facts pick the 2–3 most decision-relevant from a priority order: watch-item > durability > shape > trend).
Keep it "Rules compute — not AI" like the rest of the page. If you instead use `askClaude` for phrasing,
label it **AI** and pass it only the card outputs (it explains, it does not decide) — per the manifesto,
rules decide, AI explains, and it cites the cards.

## Confidence
Show one confidence chip on the card = the **minimum** confidence across the source cards, and surface the
comparison-group caveat when small: the position comparisons here are **vs CF n=2–3**, so any "unusual for
the position" claim must carry a low-confidence note ("small position group — read as a hint"). Baseline
maturity (days of data) feeds it too.

## House rules
- English default + Icelandic toggle (`const [lang] = useLang(); const isEN = lang !== "IS"`). Translate the
  verdict + facts + reconciliation lines.
- **Descriptive only — never touches the readiness colour, the load target, or the daily decision.** Same
  footer as the other cards.
- Don't restate numbers the cards already show; the story links to them.

## Acceptance
- The synthesis card renders at the top of the Power Curve player tab and, for Kristófer Ingi, produces the
  Level-0 verdict + 3 facts + the reconciliation lines above, each fact tagged with its source card and
  linking to it.
- Confidence chip = min of the source cards; the "vs CF n=2–3" small-group caveat appears.
- Reads correctly for a *different* archetype too (e.g. a genuine sprint-type player: verdict flips to
  "explosive, fades over longer efforts" from the power-curve retention) — prove it's template-driven, not
  hard-coded to one player. EN/IS toggle works. Lint clean.

Ref: `PeakPeriodCurveCard.tsx` / the Load Intelligence Hub power-curve tab (the cards this reads),
`peakMovementSignature` + `directionalSignature` (movement outputs), `season-hsr-ima-trend-brief.md` +
`ima-season-graph-brief.md` (the trend cards), `docs/explainability-first.md` (the layered-read rules),
`fusion-real-data-proof.md` (the fusion framing). The manifesto five-question check must pass before ship.
