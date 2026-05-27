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
