# Brief — Periodization "full plan" PDF: prioritised fix-list

Review of a real system export (`Breiðablik-periodization-2026-1.pdf`, the whole-hub `PeriodizationHubPdf`).
It's already rich and mostly workshop-ready — season map, squad demands **with IMA** (Acc/Dec B2–3, Stride,
IMA dir), the three-axes read (HSR under- / mechanical over-shoots), the meso-block sequence, week-by-week,
and a players table. This brief lists what to fix, **in priority order** — the first five are real
bugs/inconsistencies an S&C audience will catch; the rest are the missing pieces from the earlier briefs.
Descriptive planning — never the readiness colour.

File: `src/components/coach/PeriodizationHubPdf.tsx` (+ `PeriodizationBlockPdf.tsx` where shared), logic in
`src/lib/micropulse/periodization/index.ts`.

## Fix first — bugs / inconsistencies (workshop-blocking)

1. **Rest days + the "≤3 sessions in a row" are invisible.** The week lists only MD tags (MD+1, MD-5 … MD-1,
   MD, Top-up) with **no OFF days, no weekday, no MD+2 off**. The whole scheduling spine we built — top-up
   MD+1 → **off MD+2** → never more than 3 sessions in a row (often 2) → match alternates Sat/Sun — must be
   visible in the PDF. Render the block as a **weekday calendar (Mon–Sun)** with rest days shown as dashes,
   like the approved demo (`MicroPulse-Periodization-Manudur1-Demo.pdf`). This is the single most important
   fix — it's what makes the plan defensible.

2. **Deload is in the wrong place.** The block ramps Week1 100% → … → **Week4 Deload** → Week5 120% →
   **Week6 125% (peak)** — i.e. it *ends on the highest week with no unload*. Per the agreed model, **each
   block ends with a deload week** (the unload is a week, not a mid-block dip). Move the deload to the final
   week of the block; ramp the build weeks up to it. (See `periodization-hub-restructure-brief.md` Part 1a.)

3. **TMr values are implausible.** The meso table shows "TMr 50.81×", "54.59×", "38.62×". Training:match
   ratio should be ~**2–5×** (the weekly line correctly shows "1908 PL · 2.5×"). 38–54× means a week = ~50
   matches — a units bug (likely summing per-player or per-session without dividing, or PL-vs-match-PL scale
   mismatch). Fix the TMr computation so it reads ~2–5× and matches the weekly "×" already shown.

4. **Meso-map vs detailed-block mismatch.** The detailed block is titled **"Accumulation"** but its dates
   (10 Aug–14 Sept) fall inside a **Realization** block per the season map (where Accumulation is 1 Dec–12
   Jan). The detailed block's goal + dates must match the block it actually is in the map. Align the label,
   dates, and goal to the selected block.

5. **Inconsistent day-type vocabulary.** The week shows **MD+1 "Restart"** *and* a separate **"Top-up"**
   row, and **MD-1 "Technical"** — while the demo/teaching materials use **MD+1 Top-up**, **MD-1
   Activation**. Pick one vocabulary and use it everywhere (PDF, on-page plan, teaching deck). Recommend:
   MD+1 **Top-up** (drop "Restart"), MD-2/MD-1 **Technical/Activation** consistently. One "Top-up" concept,
   one place.

## Then — missing pieces (from the earlier briefs)

6. **IMA per session.** The match unit carries the IMA variables, but the **week-by-week sessions don't** —
   they show only PL/Accel/Decel/HSR/Distance/Sprint. Add the per-session **Acc/Dec Band 2–3, Stride/Free-
   running, and direction** (tier-gated) so the mechanical/IMA axis appears in the plan, not just the
   header. (See `periodization-ima-variables-in-plan-and-pdf-brief.md`.)

7. **Per-player individualised block.** "Players" is a **table** (match unit / VALD cap / gaps), not a plan.
   Add each player's **week-by-week block** scaled from his own match unit with the VALD cap + minutes trim
   applied (at least for the selected player, or as an appendix per player). (See
   `periodization-players-individualised-plan-brief.md`.)

8. **Weekday calendar in the block** (folded into #1): show Mon–Sun with the match on its actual day
   (alternating Sat/Sun across weeks), not just MD tags.

## Smaller

- **Goalkeepers** get outfield periodization in the players table — flag/handle GKs separately (their load
  model differs), or label them clearly.
- **Empty cells:** many players show "–" for MAS / match unit / VALD. The GAPS column is honest, but
  consider a short "why blank" note (no near-full matches yet / no VALD test) so it doesn't read as broken.
- **Congested weeks** are listed in the macro but not reflected in the block plan — note how a 2-match week
  compresses (fewer quality days), tying to the tight-turnaround logic already in the builder.

## Acceptance

- The block renders as a **Mon–Sun calendar with rest days**, honouring MD+1 top-up / MD+2 off / ≤3-in-a-row
  / match alternating Sat/Sun (matches the demo).
- The **deload is the final week** of the block; the block no longer ends on its peak.
- **TMr reads ~2–5×** and agrees with the weekly "×"; the detailed block's **label/dates/goal match the
  season map**; day-type vocabulary is consistent (one Top-up, MD-1 Activation).
- IMA variables appear **per session** (tier-gated); the players section includes a **per-player block**, not
  just a table. GKs handled; blanks explained.
- EN/IS. Never the readiness colour. Lint + typecheck clean; manifesto five-question check passes.

Ref: the exported `Breiðablik-periodization-2026-1.pdf` (the artefact reviewed) + the approved
`MicroPulse-Periodization-Manudur1-Demo.pdf` (target look for the calendar/rest-days),
`src/components/coach/PeriodizationHubPdf.tsx` + `PeriodizationBlockPdf.tsx`,
`src/lib/micropulse/periodization/index.ts` (block builder, TMr, deload placement),
`periodization-hub-restructure-brief.md`, `periodization-ima-variables-in-plan-and-pdf-brief.md`,
`periodization-players-individualised-plan-brief.md`.
