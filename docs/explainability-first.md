# Explainability First

**MicroPulse's core philosophy. Every feature, every metric, every UI decision is evaluated against these principles.**

---

## Why this is the philosophy

In sport science the bottleneck is not data, algorithms, or even accuracy. The bottleneck is **coach trust**. Coaches reject systems they cannot understand — even when the system is right. Adoption dies in the gap between a flagged player and the coach knowing what to do about it.

Predictive ability is a commodity in 2026. GPS pipelines, wellness check-ins, ACWR ratios — any competent team can build them. The defensible moat is whether the coach can read the system in five seconds and act with confidence.

Explainability is therefore not a feature. It is the architectural principle that every other feature must satisfy.

---

## The principles

### 1. Decision provenance is mandatory
Every verdict carries its inputs. If the engine says "yellow", the coach can trace which signal triggered it — drivers, composite, load, fatigue type. No opaque outputs.

### 2. Plain language by default, jargon behind toggles
The first thing a coach sees must be a sentence they can read without sport-science training. Composite, ACWR, neural load, IMA, FMP — these live in tooltips, "show details" toggles, and S&C drill-down views. They never appear on the morning brief surface.

### 3. Counterfactuals are first-class
Every flagged player gets a "what would change this" lever. The coach should never wonder *what is the system asking me to do differently?* The lever is part of the data model, not an afterthought.

### 4. Confidence is quantified, never hidden
Every verdict shows the data behind it: signal coverage today (4 of 5 signals), baseline maturity (28 days of personal norm), freshness (today vs yesterday's check-in). A coach should always know whether to trust the flag.

### 5. AI explains, rules decide
The deterministic engine takes verdicts. AI may interpret, summarise, or surface cross-signal patterns — but only over actual data, always cited, and always labelled as AI synthesis. **AI never originates a recommendation; rules originate, AI explains.**

### 6. Override is an audited dialogue
When a coach disagrees with the system, the override is logged with a reason. The system learns from these (calibration); the coach can see their own historical disagreements; sport scientists can audit where the engine is consistently overridden.

### 7. Scientific provenance is visible
Every signal carries a citation to the research that underpins it (Gabbett 2017, Buchheit 2024, McBurnie 2022, Robertson 2017, di Prampero 2015, etc.). Coaches and S&C can audit the foundation. This is also a moat: a hand-tuned, paper-cited engine is hard to replicate.

### 8. Two audiences, one app, clear hierarchy
The default surface is the head-coach surface. The drill-down is the S&C / sport-scientist surface. Never make the coach pay for the S&C view's complexity, and never hide the S&C detail from those who want it.

---

## Where we are (as of May 2026)

| Principle | Status | Note |
|---|---|---|
| 1. Decision provenance | ✓ | Prose explanation per player, breakdown chips, driver chips |
| 2. Plain language default | ✓ | Compact-mode badges, plain tooltips, "Show team metrics" toggle |
| 3. Counterfactuals | ✓ | Top counterfactual rendered on attention rows |
| 4. Confidence quantified | ✓ | Confidence pill (N/5), baseline maturity, "few entries" subtitle |
| 5. AI explains, rules decide | ⚠️ | Architecture aligned (ELITE AI button is labelled, opt-in, cites data); no rules-vs-AI policy document yet |
| 6. Override audit | ❌ | No DB-level audit trail for coach overrides; can't surface "you disagreed N times" stats |
| 7. Scientific provenance | ⚠️ | Paper citations in tooltips for major signals; coverage incomplete across the engine |
| 8. Two audiences, one app | ✓ | Compact / Detailed toggle on Daily Briefing; "Show team metrics" on Command Center |

**Self-assessment: ~65% complete.** The remaining 35% is infrastructure (audit-trail tables, citation coverage, decision-trace tracking) — not single-file UI changes.

---

## What this means in practice

### Anti-patterns to refuse
- Adding a number to the screen without a plain-language label.
- Showing a chip whose abbreviation requires sport-science training to decode (HIR, IMA, FMP, ACWR, NBS in the primary view).
- Making the coach scroll past 10 tiles to reach the verdict.
- Surfacing an AI-written recommendation without citing the underlying signals.
- Letting a coach silently override a verdict with no audit record.
- Building features for the S&C audience that the head coach must navigate around.

### Patterns to use
- One-sentence verdict at the top of every card. Tiles and chips are drill-down.
- Plain-language label first; numeric chip second; jargon tooltip third.
- For every flag, render the counterfactual ("if X had been Y → GREEN").
- For every verdict, render the confidence (signal coverage + baseline maturity).
- For every AI-generated string, render a "✨ AI synthesis" label and a citation.
- For every override, prompt for a one-line reason; store it.
- For every signal, attach a paper citation in the tooltip.

### Decision rule for new features
Before shipping any new feature, ask:

1. Does this carry its own provenance? (If you click into it, can you see what fed it?)
2. Can a non-S&C coach read it in five seconds?
3. Does it answer "why" as well as "what"?
4. If it makes a recommendation, can the coach see (and override) the reasoning?
5. If it uses AI, is the AI labelled as AI, and does it cite real data?

If any answer is "no", the feature is not ready.

---

## Roadmap to 100%

The 35% gap is concrete infrastructure, prioritised by impact-per-effort:

1. **Decision audit trail (DB + UI).** New table `decision_overrides`: timestamp, player_id, system_verdict, coach_verdict, reason. Surface "your override history" view; surface "where the engine is consistently overridden" for sport scientists. ~1-2 days.

2. **AI Q&A on attention rows.** Button on each flagged player: "Why is he flagged?" Opens an AI dialogue with that player's actual signals scoped in. Cites every claim back to its source signal. Follows the "AI explains, rules decide" rule. ~1 day.

3. **Weekly story (AI synthesis).** End-of-week, AI writes a 1-paragraph "what was the story of the week" using real squad data: load trends, who improved, who didn't, what to plan into next week. Cited. ~1 day.

4. **Decision-trace ("show me how this 0.74 was computed").** Click any composite or risk number → modal with the actual formula and inputs. Already partially implemented in tooltips; needs a dedicated trace view. ~1 day.

5. **Citation coverage sweep.** Every signal tooltip must carry a paper. Audit the codebase; fill gaps. ~half-day.

---

## Closing

This document exists so that every future product decision — every chip, every modal, every algorithm change — can be evaluated against a shared standard rather than re-argued from scratch.

If a feature does not strengthen one of the eight principles, it weakens them. There is no neutral ground for explainability: clarity is built or eroded with every screen.

> *"The model that ships is the model the coach trusts."*
