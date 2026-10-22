# Brief — Periodization full-plan PDF: v2 follow-ups (player selection + remaining fixes)

The full-plan export (`Breiðablik-periodization-2026-2.pdf`) is now close: weekday calendar with rest days,
IMA per session, realistic TMr (~2–5×), deload as the block's final week, block label/dates matching the
meso map, consistent day-type vocab, GK handling, and a **per-player individualised block**. This brief
covers the remaining items: (1) let the coach include **more/all players**, and (2) the leftover bugs from
the v2 review. Descriptive planning — never the readiness colour. Rules recommend; the coach decides.

Files: `src/app/coach/periodization-hub/page.tsx` (`exportAll`, `selId`, `playerBlock`),
`src/components/coach/PeriodizationHubPdf.tsx` (`playerBlock` → `playerBlocks`),
`src/lib/micropulse/periodization/index.ts` (match placement, direction tilt).

## Part 1 — include more / all players (the main ask)

**Today:** the PDF includes exactly one individualised block — the *selected* player (`selId`), which
**defaults to the first player alphabetically** (`players[0]` → Ágúst Orri). That's why "Ágúst comes into
the document": it's the default selection, not a deliberate pick. Change it so the coach chooses the set.

- **Payload:** change `PeriodizationHubPayload.playerBlock: HubPlayerBlock | null` →
  **`playerBlocks: HubPlayerBlock[]`** (array). Render each as its own individualised-block section
  (page-break before each so one player = one clean page, like Ágúst's today).
- **Selection UI (next to "Export PDF (all data)"):** a small multi-select / checklist of players with:
  - **All players** (whole roster with a match unit),
  - **Selected only** (current `selId` — the existing behaviour, kept as an option),
  - **A custom subset** (tick the players to include).
  Default to **Selected only** so a quick export stays light; "All players" is the deliberate full pack.
- **Build each block** with the existing per-player logic (`playerBlock` memo: own match unit, VALD ceiling,
  minutes trim, Total-Player-Analysis steer) — just map it over the chosen players instead of one. Reuse
  `buildCalendarBlock` per player (it already does this on the Players tab, so it's "computed from the Meso
  Cycle" for every player).
- **Skip / label players without a match unit:** those with no near-full matches (the "–" rows) can't scale
  a block — omit them from the individualised section (they still appear in the summary table) with a note,
  and handle **GKs** with their separate model as already flagged.
- **Order:** keep roster/alphabetical, or offer by position — a coach scanning "all forwards" is common.
  Position grouping is a nice-to-have; alphabetical is fine to ship.

Watch the size: "All players" for a 25-man squad ≈ 25 extra pages. That's acceptable for a deliberate full
export; keep the default to the selected player so nobody prints 25 pages by accident.

## Part 2 — remaining fixes from the v2 review

1. **Two matches on consecutive days (Sat + Sun) in one week.** Week 1 (team and Ágúst) shows **both** Sat
   MD-0 and Sun MD-0 — a 1-day turnaround; Week 3 shows matches Mon **and** Sat. The Sat/Sun *alternation*
   must mean week-to-week (Wk1 Sat, Wk2 Sun…), **not** two matches in the same week. Fix the match placement
   so the auto-fill doesn't double-place; where a week genuinely has 2 fixtures (a real congested week from
   `match_schedule`), label it **"congested"** and compress the microcycle around both games (the builder
   already has the tight-turnaround path) rather than rendering two independent full MD-0 blocks back-to-back.

2. **"VALD cap ×1.40" is mislabeled.** `maxMult` is the load **ceiling the VALD status allows**, not a cap
   that amplifies. For a green/100% player it's ×1.40 (no restriction) — but "VALD cap ×1.40" reads like a
   40% boost. Relabel: green → "no VALD restriction (ceiling ×1.40)"; yellow/red → "VALD-capped to ×1.15 /
   maintenance". Make the direction of the adjustment unambiguous.

3. **Per-player match-unit confidence.** Ágúst's match unit (11.4 km / 1,238 m HSR) is ~2× the squad median
   (7.9 km / 617 m) — plausible for a high-output RW, but show **n (near-full matches) + confidence** next to
   the unit so an outlier from 1–2 games reads as a hint, not a hard target (the `MatchUnit.confidence` field
   already exists — surface it, and fall back to the squad unit below `MIN_SAMPLE` with the note that's
   already there).

4. **Direction is static.** Every day shows the same "dir lat 55/61%". Either **tilt it by day-type/position**
   (the intended behaviour — Mechanical/defensive days more backward-lateral, Locomotive/attacking more
   forward) or, if that's not ready, **label it as the season signature** so it's clearly a per-player
   constant, not a per-day target.

5. **Rendering polish.** The stray `'` on the `dir` field and the "`'` stride at match ceiling" marker are
   sitting oddly — attach the ceiling marker to the stride value it refers to, not the direction field, and
   make the footnote legend line up.

## Acceptance

- The export offers **Selected / All / custom** players; "All" renders one clean individualised block per
  eligible player (page-break each), players without a match unit omitted-with-note, GKs handled. Default is
  the selected player.
- No week shows two independent full matches on consecutive days from the auto-fill; genuine 2-fixture weeks
  are labelled congested and compressed.
- The VALD line states the adjustment direction unambiguously; the per-player match unit shows n + confidence;
  direction is either day-tilted or labelled as the season signature; the stride-ceiling marker renders on the
  stride value.
- EN/IS. Never the readiness colour. Lint + typecheck clean; manifesto five-question check passes.

Ref: `src/app/coach/periodization-hub/page.tsx` (`exportAll` ~426, `playerBlock` ~305, `selId` default ~135),
`src/components/coach/PeriodizationHubPdf.tsx` (`playerBlock` → `playerBlocks`),
`src/lib/micropulse/periodization/index.ts` (`buildCalendarBlock` match placement + direction),
the reviewed `Breiðablik-periodization-2026-2.pdf`, and `periodization-full-plan-pdf-fixes-brief.md` (v1 fixes,
now largely done).
