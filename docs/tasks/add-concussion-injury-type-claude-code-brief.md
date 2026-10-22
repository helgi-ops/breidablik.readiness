# Claude Code task — add "Concussion" (head-injury) to the injury-type list

Paste to Claude Code (or `@docs/tasks/add-concussion-injury-type-claude-code-brief.md`).

## Why
The injury-logging dropdown has no head-injury option — the list is musculoskeletal only
(Sprain, Strain, Ligament tear, Fracture, Contusion, Inflammation, Overuse, Other). When a coach
logged Höskuldur's concussion they had to pick "Sprain" / "Other", which is wrong and made the
two injury tables disagree (`injury_events` = concussion, `player_injuries` = Sprain/Other). The
data has since been corrected by hand; this task fixes the root cause so it can't recur.

## Where
`src/app/coach/dev-coach-dashboard/RtpTab.tsx` — the `COPY` object holds two `injuryTypes` arrays:
- IS (~line 54): `["Tognanir (sprain)", "Tognanir (strain)", "Rifnar líffærataugar", "Brot",
  "Særindi (contusion)", "Bólga", "Yfirburðarslit", "Annað"]`
- EN (~line 102): `["Sprain", "Strain", "Ligament tear", "Fracture", "Contusion",
  "Inflammation", "Overuse", "Other"]`
The `<select>` stores the chosen label directly as `player_injuries.injury_type` (free text, no DB
constraint — verified).

## Change
Add a head-injury option to BOTH arrays, before "Other"/"Annað":
- EN: add `"Concussion"` (optionally also `"Whiplash / neck"`).
- IS: add `"Heilahristingur"` (optionally also `"Hálshnykkur"`).
Keep ordering sensible (group the head-injury entries together). No DB migration needed.

## Please also flag / fix (pre-existing consistency bug — small but real)
The two language arrays store DIFFERENT strings for the same injury (`"Sprain"` vs
`"Tognanir (sprain)"`), so `player_injuries.injury_type` depends on the coach's UI language —
which breaks any grouping/reporting on injury type (and is exactly why reconciliation was needed).
Recommended (confirm with owner before doing the broader change): store a **stable canonical code**
as the value and use the localized string only as the display label, e.g.
`{ code: "concussion", en: "Concussion", is: "Heilahristingur" }`, write `code` to the DB, and
render `lang === "is" ? is : en`. If that's too broad for this pass, at minimum add Concussion to
both arrays now and note the canonical-code refactor as a follow-up. Also consider aligning these
values with the `injury_events.injury_type` enum (which already has `concussion`) so the two
tables use one vocabulary.

## Acceptance criteria
- The injury-type dropdown offers a head-injury option (Concussion / Heilahristingur) in both EN
  and IS, and logging it writes a head-injury `injury_type` to `player_injuries` (no more
  "Sprain"/"Other" workaround for concussions).
- `npx tsc --noEmit` + `npx eslint` clean on the touched file; stage specific files (no
  `git add -A`).
