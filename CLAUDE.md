# Project conventions

Guidance for anyone — human or AI — writing code in this repo.

## Core philosophy: Explainability First

All coach-facing features must satisfy [`docs/explainability-first.md`](docs/explainability-first.md).

In short:
- The layered read: (0) one-sentence verdict at the top, first and boldest [the ~5s glance]; (1) 2–3 plain supporting facts visible without a click [the ~10–15s read — the "why", named exceptions, key number]; (2) raw tables/KPI grids/jargon behind a "Show details" toggle. Never jump 0 → 2 (don't hide the plain "why" behind the same toggle as the raw data).
- Plain language by default; sport-science jargon (composite, ACWR, HIR, IMA, FMP, neural load) lives behind tooltips and "Show details" toggles, never in the primary view.
- Every flagged player gets a counterfactual ("if X had been Y → GREEN").
- Every verdict shows its confidence (signal coverage + baseline maturity).
- AI labels itself as AI and cites the underlying signals. Rules decide; AI explains. Never the other way around.
- Coach overrides are logged with a reason (audit trail).
- Every signal carries a paper citation (Gabbett 2017, Buchheit 2024, McBurnie 2022, Robertson 2017, di Prampero 2015, etc.).
- The default surface is the head-coach surface; the drill-down is the S&C surface.

Before shipping any new feature, run the five-question check in the manifesto:

1. Does this carry its own provenance?
2. Can a non-S&C coach get the verdict at a glance — and the plain "why" (2–3 facts) without opening a drill-down?
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

## Session delivery (what the player sees on Today)

The Today session ("Æfing dagsins") is resolved in one place (`fetchStage4Plan` in
`PlayerClient.tsx`) with a documented precedence: coach-sent override (`player_today_strength_override`)
wins over the periodised team microdose (which Custom Programmes customise), which wins over the
fallbacks. Five coach entry points write the override table — each tags itself with an `origin`. Before
adding any new coach→player send, read [`docs/session-delivery-model.md`](docs/session-delivery-model.md):
set an `origin`, preview collisions via `today-conflicts` / `summarizeDeliveryConflicts`, and never add a
sixth un-namespaced writer. `player_training_programmes` (Æfingavika) is a separate weekly planner, not a
Today source.

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

## Design system (source of truth for the redesign)

The target look comes from the Claude Design mockup `Coach Dashboard Hugmyndir.dc.html`. Reference
screenshots of each screen live in [`docs/design/`](docs/design/) — when styling a screen, open the
matching screenshot and match it (build → screenshot the running app → compare → iterate). Screens:
`22a` player Today (corrected order), `21a–c` training on Today, `14a` player nav, `4a/10a/11a/19a`
coach Today/drawer/behind-the-numbers.

**These are the canonical design tokens. Put them in `globals.css` as CSS variables (Lota A) so every
component inherits them — do not hardcode colours in components.**

Colours (exact hex):

| Token | Hex | Use |
|---|---|---|
| `--surface` / bone white | `#f4f2ec` | page background (NOT pure white) |
| `--ink` | `#14181c` | primary text |
| `--primary` / cobalt | `#2740e6` | buttons, active tabs, focus rings, links, active nav |
| green | `#1c7a4a` | traffic-light GREEN / ready |
| amber | `#de9328` | traffic-light YELLOW / modified / caution |
| red | `#a83e28` | traffic-light RED / recovery |
| rtp purple | `#7a5cc4` | return-to-training surfaces only |

Type: **Archivo** for headings + numbers/stats; **Geist** for body text. (`--font-*` tokens +
`@font-face`/`next/font`.)

Radius / cards / shadows / spacing: match the mockup (`Fasi 1 §kort`) — confirm exact values against
the screenshots in `docs/design/` when doing Lota A; don't invent them.

Note: `globals.css` currently only has the cobalt primary as an oklch approximation (~`#3a41e0`), set
during a partial "Phase 1". Lota A should replace it with the exact `#2740e6` and add the full palette
+ fonts above. English is the default UI language (see Languages); explainability rules still apply to
every restyled surface — a re-skin must not hide the verdict → confidence → "behind the numbers" read.
