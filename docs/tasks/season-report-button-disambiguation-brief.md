# Claude Code brief — **Disambiguate the "Season report (PDF)" button** on Team Match Insights

## Problem (why this brief exists)

On the live **Team Match Insights** page (`/coach/match-insights`) there is a global
**"Season report (PDF)"** button at the top-right, sitting **above content that is the
Movement (GPS/IMA) read** (the current "IMA movement" view: "19 graded matches", sprint
distance, total distance, first-half vs second-half fade). A coach reading that Movement
content sees a top-of-page "Season report" button and reasonably reads it as *"export
what I'm looking at."* But the Season report is a **different thing** — the StatsBomb
tactical read (xG, OBV, clear shots, strengths / weaknesses vs league). Two season-wide
reads on one page, one ambiguous export button → coaches will conflate *how we move* with
*how we play*.

This is a focused UX/scoping fix. The full feature is specified separately in
`docs/tasks/season-report-brief.md`; **this brief covers only making the button/tab
unambiguous** and can be picked up independently.

## Current state (from the running app)

Team Match Insights already has:
- a **DATA** toggle: **StatsBomb** / **Wyscout**;
- an **"Import StatsBomb stats"** panel;
- an **"IMA movement"** view with an auto-generated **"The read"** block (GPS/IMA:
  sprint/total distance, second-half fade) badged **"AUTO-GENERATED FROM YOUR DATA"**;
- a **first-half vs second-half** movement panel;
- a top-right **"Season report (PDF)"** button.

The Movement read is season-wide too, so the word "season" alone does not distinguish the
two. That is the core of the collision.

## The fix

### 1. Move the export out of the global header and into a dedicated tab
- Introduce (or use the existing) tab structure on Team Match Insights. At minimum two
  named views:
  - **Movement (GPS/IMA)** — the existing "IMA movement" read (*how we move*).
  - **Team season report (StatsBomb)** — the tactical strengths/weaknesses read
    (*how we play*).
- The **PDF button lives inside the "Team season report" tab**, never in the page-level
  header. **Remove the global top-right "Season report (PDF)" button** so it cannot be
  pressed while the Movement view is on screen. Export must always equal on-screen content.

### 2. Name both reads by the question they answer
- Tab labels, headings, PDF **title**, and PDF **filename** use the distinct names:
  - Movement view → e.g. `Movement (GPS/IMA)` / IS `Hreyfing (GPS/IMA)`.
  - Season report → `Team season report (StatsBomb)` / IS `Tímabilsskýrsla liðs (StatsBomb)`.
- Never label either simply "Season report" — both cover the season.

### 3. Bind the season report to the StatsBomb source + show provenance
- The Season report tab is available **only under the StatsBomb DATA toggle** (it needs
  the StatsBomb **Team Stats** season profile — season aggregate + `League Average` row —
  which Wyscout does not provide). Under the Wyscout toggle the tab is hidden or shown
  disabled with a one-line reason.
- Reuse the existing **"AUTO-GENERATED FROM YOUR DATA"** provenance badge, plus a source
  line: **"StatsBomb Team Stats · vs League Average"**.

### 4. Gate the button — never fall back to the wrong export
- If the StatsBomb **Team Stats** season profile is not present for the team/season,
  **disable** the tab's PDF button with a hint:
  *"Upload your StatsBomb Team Stats export to generate this."* / IS
  *"Hladdu upp StatsBomb Team Stats skránni til að búa til þessa skýrslu."*
- It must **never** silently export the Movement/IMA view, an empty PDF, or a Wyscout
  fallback. No profile → no export, with a clear reason.

### 5. Keep the two PDFs separate
- If a Movement/GPS PDF export exists (or is added later), it is a **separate export**
  with its own title/filename. One button = one report. Do not route both through a
  shared "Season report (PDF)" control.

## Explainability & house rules (unchanged)
- Descriptive only — nothing here touches the readiness colour, load, or the daily
  decision (`v_coach_readiness_today_v8` untouched).
- Bilingual EN/IS via the existing `T`-map; English default, IS toggle. Design tokens
  from `globals.css` (cobalt `#2740e6`, bone `#f4f2ec`, green/amber/red traffic-light).
- Any AI phrasing stays labelled "AI" and cites its signals; the report content itself is
  rule-computed.

## Acceptance criteria
1. No page-level "Season report (PDF)" button remains; the export is reachable **only**
   from inside the "Team season report" tab, and clicking it exports that tab's content.
2. The two views are labelled **Movement (GPS/IMA)** and **Team season report
   (StatsBomb)** in UI, PDF title, and filename — in EN and IS.
3. The Season report tab appears only under the StatsBomb source, carries the provenance
   badge + "StatsBomb Team Stats · vs League Average" source line.
4. With no StatsBomb Team Stats profile, the PDF button is disabled with the bilingual
   hint; it never exports the Movement view, an empty PDF, or a Wyscout fallback.
5. `npx eslint` clean on changed files; typecheck passes. A UI/unit test asserts the
   button is absent from the page header, present in the tab, and disabled-with-hint when
   the profile is missing.

## Dependencies / relationship
- Full feature + report computation: `docs/tasks/season-report-brief.md` (this brief is
  the UX-scoping slice of that; land whichever first, but the naming/gating here is the
  contract the feature must honour).
- Export routing reference: `docs/samples/statsbomb/EXPORTS-README.md` — the Team Stats
  vs Match Stats grain distinction the source-binding relies on.
