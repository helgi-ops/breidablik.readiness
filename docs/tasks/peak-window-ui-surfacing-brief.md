# Claude Code brief — surface the CTR peak windows (HSR + Accel/Decel/CoD) in the UI

## Context — what is ALREADY done (do not redo)

The CTR peak-window ingestion is finished, lint- and type-clean, migration applied:

- `src/lib/micropulse/load/parseCatapultCtr.ts`
  - `CtrPeriodRow` now carries `imaAccelHigh`, `imaDecelHigh`, `imaCodHigh` (CoD = Left High + Right High), read from the per-period columns `IMA Accel High`, `IMA Decel High`, `IMA CoD Left/Right High`.
  - New pure fn **`peakFixedWindows(rows): CtrFixedPeak[]`** — one peak per `(metric, windowMin)` from the coach's fixed-time interval rows (bins named by a trailing `N-M` minute range, bare `"0-5"` OR half-prefixed `"Fyrri halfleikur - 3-6"`; window = M−N). Metrics: `hsr` (V5+V6 metres, gated to the Ju threshold — null off it), `accel` / `decel` / `cod` (high-intensity effort COUNTS). Fixed-bin peaks approximate the true rolling max.
- `src/app/api/coach/load/peak-window/upload/route.ts`
  - Emits `player_peak_window` rows with `window_label` = `Peak {N}min HSR|Accel|Decel|CoD`, `window_min` = N, and the value in `hsr_m` / `ima_accel` / `ima_decel` / `ima_cod`.
- Migration `supabase/migrations/20260917120000_player_peak_window_ima_cod.sql` — added `player_peak_window.ima_cod numeric` (already applied to the DB).

Verified on a real Breiðablik CTR (15 Sep 2026): the file carries 1-min (883 rows), 3-min (298), 5-min (165) bins; peaks compute correctly (e.g. Óli Valur peak HSR 88.2 / 111.9 / 132.8 m for 1/3/5-min).

## The problem this brief fixes

The **Power Curve card** (`src/components/coach/PeakPeriodCurveCard.tsx`) reads **`player_load_peak_period`** (long format, via `/api/coach/load/peak-period` → `src/lib/micropulse/load/peakPeriod.ts`). The new peaks land in a DIFFERENT table (`player_peak_window`), so nothing new appears in the UI yet. Two pieces of work:

---

## Workstream 1 — Peak HSR on the Power Curve

Goal: the HSR fixed-bin peaks show up as an `hsr` tab on the existing Power Curve card (its `METRIC_LABEL` already has `hsr` → "High-speed running / Háhraðahlaup").

Do it by **also writing the HSR fixed-bin peaks into `player_load_peak_period`** (the long table the curve reads), matching the MII convention:

- Table shape (existing): `player_id, team_id, date, source, window_min, metric, value, unit`. Upsert onConflict `player_id,date,source,window_min,metric`.
- The curve/`peakPeriod.ts`/`curveShape.ts` expect **per-minute intensity** that DECREASES with window length (see the MII note in `src/lib/integrations/catapult/miiPeakPeriod.ts`: cumulative ÷ windowMin). So write **`value = hsrM ÷ windowMin`, `unit = "m/min"`, `metric = "hsr"`**.
- Source: reuse `peakFixedWindows(rows)` (filter `metric === "hsr"`). This lives naturally in the CTR upload route — after the `player_peak_window` upserts, build a second batch into `player_load_peak_period` for the HSR peaks (one row per window length). Keep it best-effort / non-blocking like the sync's `storePeakPeriodRows` (a failure here must never fail the CTR import).
- Confirm `peakPeriod.ts` `seasonBest` aggregation includes `metric = "hsr"` (it should — the speculative MII HSR path already targets it). If not, add it.
- Gating unchanged: only emit HSR when `peakFixedWindows` returned it (i.e. band-5 edge = the Ju threshold); otherwise write nothing (do NOT fabricate).

Acceptance: upload the real CTR → the Power Curve card shows an "High-speed running" tab whose 1/3/5-min curve decreases with window; the "Show the curve numbers" table lists 1m/3m/5m HSR m/min.

---

## Workstream 2 — Accel / Decel / CoD peaks on the IMA / decel surface (NOT the running curve)

These are high-intensity effort COUNTS, not sustainable intensity — they must NOT go on the running Power Curve (its durability/retention/MAS narrative is running-specific and would mislabel counts). Surface them on the IMA / deceleration intelligence surface instead:

- Candidate homes (pick the one already showing per-match IMA/decel for a player): `src/app/coach/ima-intelligence/page.tsx`, `src/app/coach/decel-intelligence/page.tsx`, or a small new card near the McBurnie decel-coupling read.
- Data: read `player_peak_window` rows for the player where `window_label LIKE 'Peak %min Accel'` / `Decel` / `CoD` (or `raw->>'metric' in ('accel','decel','cod')`), columns `window_min`, `ima_accel`, `ima_decel`, `ima_cod`. Add a read path — either extend `/api/coach/load/peak-period` with a second payload, or a new `GET /api/coach/load/peak-window?player=…` route (auth like the existing peak routes).
- Presentation (explainability-first, layered): one-line verdict — e.g. *"His most intense minute: 5 high-intensity accels · 4 decels · 3 CoD"* — then the 1/3/5-min breakdown behind "Show details". Label clearly as **high-intensity efforts (High band), CoD = left+right**, per-match, fixed-bin peak. Bilingual EN/IS.
- Cite: deceleration burden = McBurnie 2022 (matches the existing decel-coupling engine). Descriptive only — **never** feeds the readiness colour or the daily decision (manifesto).
- Caveat line: fixed-bin peaks approximate the true rolling max; a true rolling-max MII interval for these metrics isn't in OpenField's export yet.

Acceptance: upload the real CTR → the IMA/decel surface shows peak 1/3/5-min high-intensity accel, decel and CoD for the player, labelled and cited, behind the standard verdict → details read.

---

## Cross-cutting

- **Explainability-first**: verdict → 2–3 plain facts → raw table behind "Show details"; plain language, jargon behind tooltips; never the colour. (`docs/explainability-first.md`.)
- **Bilingual** EN default, IS toggle — no sport-science jargon in either.
- **Definitions to surface honestly**: HSR = V5+V6, only when the account band-5 edge is the Ju threshold (19.8 km/h); Accel/Decel/CoD = High-band counts, CoD = Left+Right; all are per-match fixed-bin peaks.
- **Verify**: `npx eslint <files>`; `npx tsc --noEmit`; run the vitest suite (esp. `parseCatapultCtr.test.ts`); then a manual upload of a real CTR and screenshot both surfaces. Don't introduce new lint errors. Any new migration saved under `supabase/migrations/` with a timestamp prefix.
- **Do NOT** re-run the ingestion changes above — they are committed to the working tree already; this brief is UI + read-path only.
