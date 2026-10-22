# Code brief — add data export (Excel + per-session pack) to the Player Transfer Report

Add two download options to the existing **Transfer Report** (`/coach/transfer-report`) so a coach can hand a
buying club the raw data, not just the PDF dossier:

1. **Download data (Excel)** — one multi-sheet `.xlsx` (season overview + per-match GPS/IMA + per-match
   minutes & output + weekly load + CMJ history + VBT + fitness tests + IMA movement directions + WCS).
2. **Per-session pack (ZIP)** — one `.xlsx` per training/match session (Session summary sheet + drill-by-drill
   sheet), zipped.

This was prototyped by hand for Ágúst Orri (files: `Agust-Orri-Thorsteinsson-performance-data-2026.xlsx`,
`Agust-Orri-training-sessions-2026.zip`) — the feature makes it a one-click export for any player.

## Reuse — the report already loads all of this

The Transfer Report is already built: `src/app/coach/transfer-report/page.tsx`,
`src/lib/micropulse/transferReport/index.ts` (pure assembler), `src/components/coach/TransferReportPdf.tsx`,
`src/app/api/coach/transfer-report/[playerId]/route.ts` (loads the raw rows), `transferReport/ai.ts`. The
API already pulls, over the 3–4-month window, from tables that exist: identity, per-session `LoadDaily`
(from `player_external_load_daily`, deduped + match-classified), games/minutes/output, VALD CMJ, GymAware VBT,
fitness tests, WCS, IMA clock. **The Excel export must read the SAME normalized rows the API already
produces — do not re-query or re-derive, or the Excel and the PDF will drift.**

Refactor so the route's data-loading returns a single `TransferReportData` object consumed by BOTH the
PDF builder and the new xlsx/zip builders (one source of truth).

## 1. Excel workbook — `transferReportXlsx.ts` (server, Node)

Use **`exceljs`** (Node/streamable — NOT openpyxl). One workbook, sheets mirroring the prototype:
`Overview` (profile + percentiles + WCS + summary), `Matches - GPS`, `Matches - IMA`, `Matches - Output`,
`Weekly - GPS`, `Weekly - IMA`, `Force plates - CMJ`, `Strength & Fitness`, `Movement direction (IMA)`.
- Professional (Arial 10), bold header row + fill, frozen header, sensible widths, ISO `yyyy-mm-dd` dates.
- Average/summary rows as **formulas** (`AVERAGE(...)`, `SUM(...)`) so it recalculates for the recipient.
- Header block on `Overview`: player, position, window (report's exact date range), sessions/matches counts,
  data sources, and a one-line provenance note ("Descriptive performance export … agreed transfer; figures
  do not encode any readiness/availability judgement.").
- Endpoint: `GET /api/coach/transfer-report/[playerId]/xlsx` → streams the workbook,
  `Content-Disposition: attachment; filename="{lastname}-performance-data-{season}.xlsx"`.

## 2. Per-session pack — `transferReportSessionsZip.ts`

- Needs the **drill-level rows** the PDF doesn't use: query `player_drill_load` for the player over the window
  (`session_date, period_name/period_norm, period_order, duration_min, distance_m, player_load,
  player_load_per_min, hir_total, max_velocity, ima_accel, ima_decel, ima_cod_total, metabolic_power_peak,
  jumps`). Add this to the shared loader.
- For each session date in `LoadDaily`, build one `.xlsx`: **Session** sheet (key/value summary of that
  session's load row) + **Drills** sheet (the drill rows for that date; "No drill-level breakdown for this
  session." when none). File `{Player}_{date}.xlsx`.
- Zip with **`archiver`** (or `jszip`). Endpoint: `GET /api/coach/transfer-report/[playerId]/sessions.zip` →
  streams the zip, `filename="{lastname}-training-sessions-{season}.zip"`. (Large-ish: ~70 files — stream,
  don't buffer all in memory if the squad grows.)

## 3. UI

On `transfer-report/page.tsx`, next to the existing PDF download, a small button group:
**Download PDF · Download data (Excel) · Per-session pack (ZIP)**. Same auth/role gate as the report. Show a
spinner while the zip builds. English default + IS toggle (labels only; the data is language-neutral).

## Guardrails (manifesto)

- **Descriptive / advisory only** — same as the report; never reads or writes the readiness colour, load
  target, or daily decision. It's an export of what the player *is*.
- Real player name is correct here (agreed-transfer context) — this is NOT a shareable/anonymised marketing
  output, so the anonymisation rule doesn't apply; but keep it behind the coach/admin auth gate.
- Provenance in the file: window, data sources, generated-at. Confidence/limitations note where the report
  already flags them (e.g. HSR not populated per training session; MII peak windows are distance + player
  load only).
- One source of truth: Excel/ZIP/PDF all read the same loaded rows.

## Verification (ship gate)

1. Excel `Overview` + per-match numbers **match the PDF dossier** for the same player/window (spot-check
   3 matches + the season averages). If they differ, the loader wasn't shared.
2. `recalc`/open check: the workbook's formula rows evaluate (no `#NAME?`), averages equal a manual mean.
3. Session count in the ZIP == number of sessions in the report window; 2 spot-checked session files match
   `player_external_load_daily` / `player_drill_load`.
4. Auth: non-coach cannot hit the xlsx/zip endpoints.
5. Readiness colour + daily decision unchanged (no write path); `npx eslint` clean on new files.

## Reference
- Existing: `src/lib/micropulse/transferReport/*`, `src/app/api/coach/transfer-report/[playerId]/route.ts`,
  `src/components/coach/TransferReportPdf.tsx`, `src/app/coach/transfer-report/page.tsx`.
- Prototype outputs (design target): `Agust-Orri-Thorsteinsson-performance-data-2026.xlsx`,
  `Agust-training-sessions/Agust_*.xlsx`, `Agust-Orri-training-sessions-2026.zip`.
- Data tables: `player_external_load_daily` (per-session), `player_drill_load` (per-drill), plus the
  VALD/VBT/games/fitness sources the report already reads.
