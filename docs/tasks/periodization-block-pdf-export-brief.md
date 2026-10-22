# Brief — Periodization block PDF export (make it look like the demo)

**Goal:** the **"Export this block (PDF)"** button on the Periodization Hub should produce a PDF that
looks and reads like the approved demo:
`MicroPulse-Periodization-Manudur1-Demo.pdf` (in the repo root / shared with the coach). That demo is
the **canonical visual + structural spec** for this export. This brief says exactly what to change to
hit it — and, importantly, the **microcycle scheduling rules** the export must encode (they are not just
cosmetic; the current builder stacks too many sessions in a row).

Open the demo side-by-side while building. Page 1 = the plan overview (match unit + progressive-overload
table + microcycle template). Page 2–3 = session-by-session for the whole block.

## Where it plugs in (existing code — reuse, don't rebuild)

- Button + handler: `src/app/coach/periodization-hub/page.tsx` → `exportBlock()` → `downloadPeriodizationBlockPdf(...)`
  (line ~148). Keep the button, the payload shape (`PeriodizationBlockPayload`), and the EN/IS toggle.
- Renderer: `src/components/coach/PeriodizationBlockPdf.tsx` (`@react-pdf/renderer`). Restyle this to the demo.
- Schedule/microcycle builder: `src/lib/micropulse/periodization/index.ts` — `MdDayType`, the day-type
  order builder (`order = [...]` ~line 343), `MesoPlan` / `MesoPlanWeek`, and the overload/deload ramp.
  **The scheduling-rule changes below live here**, so both the on-page view and the PDF inherit them
  (one source — the manifesto rule).

Keep using `@react-pdf/renderer` + Helvetica (the demo is Helvetica; no font install needed). Do **not**
switch to html2canvas/print — we want crisp vector tables and reliable page breaks.

## Part A — the scheduling rules the export must encode (the important part)

The current normal-week order is `["restart","mech","loco","mixed","tech2","tech1","match","topup"]` — that
is **6 training days back-to-back before the match**, no rest days, and a fixed match slot. The demo fixes
this. Encode these rules in the week builder so every surface (page + PDF) is consistent:

1. **Never more than 3 sessions in a row — often 2.** Insert rest days so the longest run of consecutive
   on-days (any session incl. top-up and match) is **3**. Verify with a simple scan across week boundaries,
   not just within a week (the demo's build script proves it: max run = 3).
2. **Post-match: MD+1 top-up, MD+2 off** (Buchheit). The day after a match is a **light top-up**
   (compensatory for <60′ players; recovery for starters); the second day after is a **full day off**.
3. **HSR and mechanical never stacked.** Locomotive (HSR) day and Mechanical (accel/decel) day sit on
   separate days — already the intent of the day-types; keep it.
4. **Match alternates Saturday / Sunday** across the block. This makes the turnaround alternate long
   (~8-day, roomy → 3 quality days) and short (~6-day, tight → 2 quality days), i.e. an **undulating**
   week-to-week load that still trends up — do not force an identical 7-day template every week. The demo's
   exact 6-week pattern (validated, max-3-in-a-row) is a good default:

   | Week | Match | Structure (Mon→Sun) | Rest days |
   |---|---|---|---|
   | 1 Introduce | Sat | MECH·LOCO·MIX·OFF·ACT·MATCH·TOP | 1 |
   | 2 Progress | Sun | OFF·MECH·LOCO·MIX·OFF·ACT·MATCH | 2 |
   | 3 Progress | Sat | TOP·OFF·LOCO·MIX·OFF·MATCH·TOP | 2 |
   | 4 Overload | Sun | OFF·MECH·LOCO·MIX·OFF·ACT·MATCH | 2 |
   | 5 Overload·peak | Sat | TOP·OFF·LOCO·MIX·OFF·MATCH·TOP | 2 |
   | 6 Deload | Sun | OFF·LOCO·OFF·MIX·OFF·ACT·MATCH | 3 |

   The coach can still move the match day; the builder just needs to (a) place TOP/OFF after each match and
   (b) keep the ≤3 rule when it re-solves. Where the match falls on the last day and a top-up would follow
   in the next block, that top-up belongs to the next block.
5. **Progressive overload comes from the week multiplier, not from cramming sessions.** Ramp the
   load-bearing targets ×1.00 → ~×1.30 to a peak week, then a **deload** (~×0.60) with an extra rest day.
   Session *count* may vary (tight weeks have fewer quality days); that is correct and intended.
6. **MD labels count down correctly** to that week's match (MD-5 → MD-4 → MD-3 → MD-2 → MD-1 → MD-0), and
   MD+1 / MD+2 after it. Rest days keep their MD label (e.g. `MD-2` on a mid-week rest). See the demo — no
   out-of-order MD numbers.

Tier handling stays as in the hub: Vector Core (GPS) hides IMU-only metric columns; RPE-only shows sRPE
targets. The layout is identical; only the metric columns differ.

## Part B — the PDF layout (match the demo exactly)

**Page 1 — the plan overview**

- **Header band:** dark navy (`#14181C`) block, 3 px cobalt (`#2740E6`) top rule. `MICROPULSE` eyebrow,
  title `Periodization Plan — <N>-Week Block`, subtitle `Pre-season · match-anchored · individualised to
  <scope name> (<position>)`. Use the payload's `scope` and `matchUnitLabel`.
- **Match-unit callout:** white box, cobalt border, bold lead line "THE MATCH IS THE UNIT — one near-full
  match (median, ≥80 min), the multiple every training week is scaled from." Then 4 stat chips (value in
  colour + small grey label): **Distance**, **HSR (V5+V6)**, **Player Load** (purple), **Acc + Dec** (red),
  with thin dividers. Values from the scope's own match unit.
- **Progressive-overload table:** navy header row; columns `WEEK · INTENT · RUNNING DIST · HSR ·
  MECHANICAL · REST DAYS`. Values are **weekly training total as % of one match** (the training:match
  ratio) per dimension — Running in ink, HSR green (`#1C7A4A`), Mechanical red (`#A83E28`). Zebra rows;
  **deload row highlighted** in warm amber tint (`#FCF2E2`). One row per week.
- **Microcycle template:** cobalt header; rows `MD-0 FRIENDLY (match)` → `MD+1 Top-up` → `MD+2 Off` →
  `MD-4 Locomotive` → `MD-3 Mixed` → `MD-2 Mechanical / Off` → `MD-1 Activation`, each with a one-line
  "what it is" and an MD tag coloured by day-type. Above it, the plain-language paragraph from the demo:
  match alternates Sat/Sun, top-up then off after the match, **never more than three in a row — often
  two**, HSR and mechanical on separate days, deload adds rest days.

**Hard page break** after page 1 (`@react-pdf` `<View break />` or `break` prop on the next section) so
**"Session-by-session — the full 6-week block"** always starts at the top of a fresh page.

**Pages 2+ — session-by-session (one block table per week)**

- Each week = a banner + a 7-row table, wrapped so it **never splits across a page** (`wrap={false}` on
  the week container, like `KeepTogether` in the demo). Banner: navy (amber for deload), left = `Week N —
  <intent>`, right = `match <Sat|Sun> · ×<mult>` (+ `· DELOAD`).
- Table columns: `DAY · MD · DAY-TYPE · FOCUS · DIST · HSR · LOAD`. Each row tinted by day-type
  (Mechanical red-tint, Locomotive green-tint, Mixed cobalt-tint, Activation grey, Top-up purple-tint,
  Match amber-tint, **Rest bone with em-dashes** in all metric cells). MD tag + day-type name in the
  day-type accent colour; DIST/HSR in metres, LOAD in Player Load (AU).
- **Match row shows the full match unit (100%)** as the reference; training rows show `fraction × week-mult
  × match-unit`, rounded (dist to 10 m, HSR to 5 m).
- Footer on every page: thin rule, `MicroPulse — Periodization Plan (demo/plan)` left, `Page N` right.

Colours = the design tokens already in `PeriodizationBlockPdf.tsx` (COBALT/AMBER/PURPLE + green `#1C7A4A`,
red `#A83E28`, bone `#F4F2EC`, line `#DCD9CF`). The demo tints: mech `#F6E7E1`, loco `#E4F1EA`, mixed
`#E7EAFB`, tech/act `#EFEFEF`, top-up `#F0EAF7`, match `#FBEFDD`.

## Part C — data / scaling (grounded, not invented)

Per-session numbers = **day-type fraction of the match × week multiplier × the scope's match unit**. The
day-type fractions (dist, hsr, mech) encode the evidence base (`docs/research/football-periodization-
evidence.md`): **mechanical accumulates over the match while HSR sits under it per session** (Figueiredo),
so Mechanical-day mech fraction > 1.0 and HSR fractions < 1.0. The demo's calibrated fractions:

| Day-type | dist | hsr | mech |
|---|---|---|---|
| Locomotive | 0.55 | 0.70 | 0.55 |
| Mixed | 0.70 | 0.55 | 0.85 |
| Mechanical | 0.45 | 0.30 | 1.10 |
| Activation | 0.30 | 0.22 | 0.40 |
| Top-up | 0.40 | 0.35 | 0.40 |

Match unit itself comes from the scope's own near-full matches (≥80 min, position-aware, rolling ~10 weeks;
typical = median, per `periodization-hub-brief.md`). For a team block use the team baseline; for a player
block use that player's unit — the payload already carries `scope`.

## House rules (manifesto)

- **Descriptive planning only** — this export never sets or references the readiness colour
  (`v_coach_readiness_today_v8.final_color`). Same footer disclaimer as the other periodization PDFs.
- **Recommends; the coach decides.** Targets are a data-anchored starting point, not a norm to obey
  (Little & Buchheit) — keep the existing "Recommended from the team's own data — the coach decides and
  overrides" tag.
- **EN default + IS toggle** — translate every heading, day-type label, intent, and note (the payload
  already threads `Lang`; `MdDayType` labels are already bilingual `Bi`).
- English default UI; no sport-science jargon in the primary view — the metric names in the table are fine;
  keep "HSR (V5+V6)" tooltip-style expansion in the callout as the demo does.

## Acceptance

- Clicking **Export this block (PDF)** for a 6-week block produces a PDF matching the demo: page 1 overview,
  a clean page break, then session-by-session weeks that never split across a page.
- The schedule shows **max 3 sessions in a row** (assert in a unit test on the week builder), a top-up on
  MD+1 and a day off on MD+2 after every match, the match **alternating Sat/Sun**, and a **deload final
  week** with an extra rest day and lighter loads.
- MD labels descend correctly to each week's match; rest rows render as em-dashes; the match row shows the
  100% reference unit; day-type row tints match the demo.
- Works for a **team** block and a **single-player** block (numbers scale from the respective match unit),
  and for **Vector Core** (GPS columns only) — no IMU columns leak in.
- EN/IS toggle switches all copy. Lint + typecheck clean (`npx eslint` on the touched files). The manifesto
  five-question check passes (provenance, glance verdict, why-as-well-as-what, coach override, AI labelled —
  here there is no AI, so N/A).

Ref: the approved demo PDF (visual spec), `src/components/coach/PeriodizationBlockPdf.tsx`,
`src/lib/micropulse/periodization/index.ts` (week builder + day-types),
`docs/tasks/periodization-hub-brief.md` (data model + match unit),
`docs/research/football-periodization-evidence.md` (the fractions + the ≤3 / HSR-vs-mechanical rationale).
