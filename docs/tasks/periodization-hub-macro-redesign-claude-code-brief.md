# Periodization Hub — Macro Cycle tab redesign (Claude Code brief)

**File:** `src/app/coach/periodization-hub/page.tsx` — the `tab === "season"` block only (≈ lines 893–1386; the "How the cycle is built" section, the "Macro — the season map" section and the "Strength goal for this phase" section).
**Design reference:** Design canvas "Periodization Hub" → artboard *Makró-lota — endurhönnun* (https://claude.ai/code/artifact/6ee25e16-be87-4ca6-bd19-305a6d1f03db). It uses sample data; wire everything to the real `plan` / `mesoBlocks` data that already exists.

**This is a layout/presentation change. Do NOT change any engine logic, memos, state, API calls or persistence.** Every control and data point that exists today must still exist after the change (see "Must keep" below).

---

## Problems being fixed

1. **Controls are buried.** "Set these first" (pre-season start, season end, off-season, deload cadence, Apply/Save) lives in the *second* card, below the explainer. It must be the first thing on the tab.
2. **Phase bar is drawn twice** (once small in "How the cycle is built", again in "Macro — the season map") and phases use the same hues as block goals (`#7a5cc4` = pre-season AND Transmutation, `#2740e6` = competitive AND Accumulation).
3. **Lanes don't line up.** Blocks/strength/testing lanes use `flexGrow: b.weeks`; the in-season lane is one flex cell per Monday; scheduled-test markers use a raw *date* fraction `(date - spanStart)/(spanEnd - spanStart)`; the LoadCurve is a separate SVG with its own axis. Reading vertically does not land on the same week.
4. **Too small / too dense.** 8–9px text throughout, a long verdict paragraph, emoji (🧪) as a marker.

---

## New tab order (top → bottom)

### 1. Season frame card ("Season frame {seasonYear}" / "Tímabilsrammi {seasonYear}")
One card, controls in a wrapping row, each with a visible label above the input:
- Pre-season start (`preStart`), Season ends (`seasonEnd`), Off-season starts (`offStart`, optional), Off-season to / next pre-season (`nextPreStart`)
- Block length segmented control 4 / 5 / 6 weeks (`cadence`, `changeCadence`) + helper "`{cadence-1}` build weeks + 1 deload"
- Right-aligned: **Save** (secondary, `savePlan`, keeps "✓ Saved" state) and **Apply** (primary, `load(preStart, seasonEnd)`)
- Keep the resolved off-season / break range text (the `Frí … · Off-season …` line) under the inputs.
- Keep the "No pre-season window found" dashed notice directly under this card when applicable.
- Inputs/buttons min-height 40px.

### 2. Verdict + status tiles
- **Level 0 (CLAUDE.md layered read): keep ONE bold sentence** — shorten the current `verdict` to one line, e.g. "You're in week 29 of the competitive season — next up: Realization." Full text moves to the details toggle in section 5.
- Below it, a responsive grid (`repeat(auto-fit, minmax(220px,1fr))`) of 4 tiles, each: small label / big value / one-line sub:
  1. **Phase** — `curPhase.label` · "Week {weekInPhase} of {curPhase.weeks}"
  2. **Active block** — colour swatch + goal label (effective goal) · "Week n of {block.weeks} · {start}–{end}"
  3. **Next deload** — date of the next deload week (`deloadWeekStart` of the current/next block, ≥ today) · "in N days" / "this week"; mark if `deloadNow` (pulled forward)
  4. **Next** — the next phase and its start date (e.g. Off-season from …)
- The data-tier strip (`plan.tier`) stays, but as a compact pill in the page header area rather than a full-width bar (keep `unlock` text in its tooltip or a small line).

### 3. Season map — ONE shared week grid
A single card. Every lane is a row: `grid-template-columns: 132px minmax(0,1fr)` — left column = lane label (12px bold) + one-line sub-label (11px slate-500); right column = the track.

**Every track is a CSS grid with `repeat(totalWeeks, minmax(0,1fr))` and the same `gap`.** Week index `i` = Monday `mondayOf(blocks[0].start) + 7·i`. Build one helper `weekIndexOf(iso)` and use it for EVERYTHING (blocks, fixtures, tests, load, months, today). Delete `weekFracForDate` and the date-fraction maths for scheduled tests.

Lanes, in order:
| Lane | Content | Source |
|---|---|---|
| (axis) | Month labels at month starts; year tag on first month of each year (keep current logic) | blocks span |
| Phase | One cell per phase, `gridColumn: span ph.weeks`, **neutral** fill (`#F1F5F9`, border `#E2E8F0`, dark text) + dates. This replaces both old phase bars. | `plan.phases` |
| Blocks | One cell per block, `span b.weeks`, goal colour `GC[b.goalKey]`, white label; deload week = amber `#DE9328` cell-width stripe at its position (keep the hatched variant for `deloadNow`); keep current tooltip | `mesoBlocks` |
| Strength | Same blocks, **tinted** background (≈12% of goal colour) with dark goal-coloured text = `strengthForBlockGoal(...).quality` | existing strength lane logic |
| Fixture density | One cell per week, competitive weeks only; use a **separate teal ramp** so it never reads as a block goal: re_strength `#A5D8E0`, sharpen `#3E9FAF`, maintain_potentiate `#0E5E6E`, taper `#F2C78A`; non-competitive weeks `#F1F5F9` | `classifyInSeasonSubPhase` |
| Matches *(new, cheap)* | Dots per week from `plan.fixtures` counted by week; 2+ in a week = red dots (congested) | `plan.fixtures` |
| Testing | Diamond marker (rotated square, no emoji): outlined = recommended at block start (`testsForBlock`), filled = scheduled (`scheduledTests`), by week index. Keep tooltips listing dates/protocols. Link "Schedule →" → `setTab("testing")`. | existing |
| Weekly load | Bars per week in the same grid (replaces the separate `LoadCurve` SVG on this tab). Keep the team/position `<select>` (`loadCurveKey`) in the lane's label column. Weeks with no data render empty — do NOT invent future/planned values unless a real target already exists in the data. | `plan.loadCurve` / `loadCurveByPos` |

Overlay (absolute, `pointer-events:none`, spans all lanes): faint month gridlines + a single **Today** line (`#B42318`, 2px) with a "Today · {date}" label at the top. Position: `left: calc(144px + (100% - 144px) * frac)` where frac = week index (with day fraction) / totalWeeks. Remove the per-lane "now" outline.

Wrap the grid in `overflow-x:auto` with `min-width: ~1040px` so it scrolls on phones rather than squashing.

Below the grid: **one legend row** (goal colours, deload stripe, the 4 density colours, recommended/scheduled test, load) and the existing congested-weeks amber note (`plan.congested`), shortened.

Keep the `thin` data warning.

### 4. Decisions — two cards side by side (`flex-wrap`, each `flex: 1 1 480px`)
**Left — "Active block goal"**
- Sub-line: "Block {start}–{end}. Drives Meso, Micro and the PDF — the coach's call."
- 3 large selectable cards (Accumulation / Transmutation / Realization) in a 3-col grid, min-height ~72px, role="radio"; each shows label + role ("build the base" …); recommended one gets a "Recommended" pill instead of ★. Same handlers: `setBlockGoal`, `goalRec`, `effectiveGoal`.
- "Coach override" pill (existing condition) + "Use recommended" button (existing).
- The three Level-1 plain-fact bullets (Accum → Transmute → Realize; in-season cycling; deload is the last week of a block) move here, under the selector.

**Right — "Strength this week"**
- Two stacked sub-cards:
  1. This week's fixture-density sub-phase (`nowSub`): label, rationale, dose — tinted to match its density colour.
  2. This block's strength scheme (`curScheme`): quality, `pct1rm`, `scheme`, method chips (`STRENGTH_METHODS`), cite.
- Then the content of the old "Strength goal for this phase" section: `cfg.verdict`, `cfg.intensity`, pre-season `block`/weeks-to-opener line, `cfg.flags`, and (competitive only) the Microdose / Traditional segmented control (`inSeasonMode`, `changeInSeasonMode`) + Cuthbert 2021 note. Merge — do not show the same idea twice.

### 5. Phases + model
- Phase list as a responsive grid of small cards: name, dates · weeks, `rationale` (from `plan.phases`).
- `<details>` "How the cycle is built — the model & citations": the full verdict text, the model paragraph and the citation line (Issurin 2010 · Martín-García 2018 · Owen 2017 · Teixeira 2021 · Oliveira 2019/2021 · "Descriptive — never the readiness colour").

---

## Visual rules
- Min font size **11px** (labels/legends), body 12–13px, card titles 15px (Archivo via the existing heading font var). No 8–9px text anywhere on this tab.
- Colours: block goals `accum #2740E6`, `transmute #7A5CC4`, `realize #1C7A4A`, deload `#DE9328`. Phases neutral. Density = teal ramp. Today = `#B42318`. Nothing else competes.
- No emoji; use the diamond / inline SVG.
- Cards: white, `border-slate-200`, `rounded-xl`, `p-4 sm:p-5`, `gap-4` between cards.
- Touch targets ≥ 40px for inputs/segmented buttons.
- Text contrast ≥ 4.5:1 (no `text-slate-400` for meaningful text on white — use `slate-500`+).

## Language
Every string bilingual via the existing `is ? … : …` pattern. English is default (CLAUDE.md). Reuse existing IS strings where the meaning is unchanged.

## Must keep (regression checklist)
- [ ] preStart / seasonEnd / offStart / nextPreStart inputs, Apply, Save (+ "✓ Saved")
- [ ] Cadence 4/5/6 re-flows blocks (Meso/Micro unchanged)
- [ ] Block goal selection, recommended goal, "Use recommended", coach-override badge, persistence to `blockGoals`
- [ ] Deload stripe incl. `deloadNow` hatched variant + tooltips
- [ ] Strength lane, in-season sub-phase lane + "This week" card, testing lane + scheduled markers + "Schedule →"
- [ ] Load curve with team/position select
- [ ] Congested-weeks note, thin-data warning, no-pre-season notice, data-tier info
- [ ] Strength-goal content incl. flags and in-season Microdose/Traditional toggle
- [ ] Citations still reachable (details toggle)
- [ ] Other tabs untouched

## Acceptance
1. Pick any week: the block, strength, density, matches, testing and load cells for it sit in the same column (check a scheduled test date and a congested week).
2. Only one phase bar on the tab.
3. Controls visible without scrolling on a 1440×900 screen.
4. Phone width (390px): cards stack, the map scrolls horizontally, nothing overflows the page.
5. `npx tsc --noEmit`, `npm run lint`, `npm run test:engine` pass.

## Out of scope
Meso / Micro / Testing / Demands / Players tabs, PDF export, any change in `src/lib/micropulse/periodization/*`.

Suggested commit: `feat(periodization-hub): Macro tab redesign — controls first, one shared week grid, status tiles`
