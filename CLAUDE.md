# Project conventions

Guidance for anyone — human or AI — writing code in this repo.

## Core philosophy: Explainability First

All coach-facing features must satisfy [`docs/explainability-first.md`](docs/explainability-first.md).

In short:
- One-sentence verdict at the top of every card; tiles and chips are drill-down.
- Plain language by default; sport-science jargon (composite, ACWR, HIR, IMA, FMP, neural load) lives behind tooltips and "Show details" toggles, never in the primary view.
- Every flagged player gets a counterfactual ("if X had been Y → GREEN").
- Every verdict shows its confidence (signal coverage + baseline maturity).
- AI labels itself as AI and cites the underlying signals. Rules decide; AI explains. Never the other way around.
- Coach overrides are logged with a reason (audit trail).
- Every signal carries a paper citation (Gabbett 2017, Buchheit 2024, McBurnie 2022, Robertson 2017, di Prampero 2015, etc.).
- The default surface is the head-coach surface; the drill-down is the S&C surface.

Before shipping any new feature, run the five-question check in the manifesto:

1. Does this carry its own provenance?
2. Can a non-S&C coach read it in five seconds?
3. Does it answer "why" as well as "what"?
4. If it makes a recommendation, can the coach see (and override) the reasoning?
5. If it uses AI, is the AI labelled as AI, and does it cite real data?

If any answer is "no", the feature is not ready.

## Canonical verdict source

When you need today's verdict color for a player (or any historical day's color), read from **`v_coach_readiness_today_v8.final_color`** (which is sourced from `readiness_entries.color`). This is the column the Daily Briefing dashboard already displays, and aligning every other surface to it is the system's promise that "what the coach sees is what the AI / report / export sees."

Do NOT read `athlete_decision_history.athlete_state` as a verdict color, and do NOT read `stage4_decisions.system_decision` as a verdict color. Those tables exist and have their own purposes:

- **`athlete_decision_history`** — internal trajectory-aware engine output. Used by the sequence-escalation logic (3-day yellow → red), counterfactual computation, and the `input_signals` snapshot. Its `athlete_state` column can DISAGREE with the dashboard color on the same day because it adds trajectory rules the personal-norm engine doesn't. Never surface it as "the verdict" to a coach.
- **`stage4_decisions.system_decision`** — engine's suggested training action (FULL / REDUCED / RECOVERY). NOT a color. Used by the Decision Summary action table for what to actually plan, separate from the readiness verdict.
- **`readiness_entries.color`** = `v_coach_readiness_today_v8.final_color` — the personal-norm comparison ("how does today compare to his usual?"). THIS is the canonical color.

If a feature genuinely needs the trajectory-aware verdict (e.g. an alert when sharp drop is detected), surface it as a distinct labelled signal ("trend alert" / "↘ sharp drop") next to the color, never as the color itself. The day-over-day delta badge in the Daily Briefing is the existing surface for that.

This is principle #1 of the manifesto (decision provenance is mandatory) in operational form: one source, one verdict, visible everywhere.

## Languages

Default UI language is **English**. Icelandic (IS) is the toggle. Both must be coach-readable — no sport-science jargon in either language.

## Migrations

Any DB change applied directly via `mcp__supabase__apply_migration` MUST also be saved as a `.sql` file under `supabase/migrations/` with timestamp prefix so the migration history is reproducible.

## Linting

Don't introduce new lint errors. Existing errors in legacy code are pre-existing tech debt; new code should be clean. Run `npx eslint <file>` after edits to the file you touched.

## Git

- Branch checkpoints are managed by the user in VS Code terminal. The sandbox can't reliably remove `.git/index.lock` or push to remotes.
- Never use `git add -A` — stage specific files only.
- Never amend a commit, never force-push to main.
