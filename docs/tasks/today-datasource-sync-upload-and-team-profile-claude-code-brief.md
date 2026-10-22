# Claude Code brief — Today-page Sync/Upload card + one correct per-team data-source profile

Goal: on the **Today** page, give every team a single entry point to get its data in — **Sync now** for
API teams (like Breiðablik's Catapult sync, which already exists there) and an inline **Upload** for
file teams (so they don't trek to `/coach/integrations/...`). Crucially, this must be driven by **one
authoritative, correct per-team data-source profile** that knows exactly what each team gets — Catapult
**Pro vs Lite**, STATSports, Hudl **WIMU vs Titan**, VALD/WHOOP/Polar/GymAware — and that same profile
must drive data-quality expectations and surface gating. Descriptive/ingestion UX; never the readiness
colour.

## Part A — the per-team data-source profile (do this first; it's the foundation)

**The hard lesson already in the repo:** `dataQuality.ts` documents that Catapult tier had FOUR competing
sources of truth (`plan_tier`, `catapult_plan_type`, `catapult_data_tier_override`, and an attempted
`catapult_product`). **Do NOT add another.** Catapult tier is resolved by the existing
**`getCatapultDataTier()`** (`src/lib/micropulse/catapultTier/`, honouring
`teams.catapult_data_tier_override`). Extend that pattern; don't compete with it.

New pure resolver `src/lib/micropulse/dataSourceProfile/index.ts` — a **read-only aggregator** over the
configs that already exist (it does not introduce a new tier column):

```ts
export type Provider = "catapult" | "statsports" | "hudl_wimu" | "hudl_titan"
  | "vald" | "whoop" | "polar" | "gymaware" | "generic_csv";
export type SourceMode = "api" | "file";          // Sync vs Upload
export type SourceEnv  = "outdoor" | "indoor";

export interface DataSource {
  provider: Provider;
  variant: string | null;        // catapult: "pro" | "lite"; hudl: "wimu" | "titan"; else null
  mode: SourceMode;              // api → has stored credentials; file → CSV/XLSX upload
  env: SourceEnv;                // Titan/basketball → indoor (GPS expected absent)
  isPrimaryLoad: boolean;        // the load anchor source (one per team)
  entitledMetrics: string[];     // what this source SHOULD deliver (drives data-quality + gating)
  label: Bi;
}
export interface TeamDataProfile { teamId: string; sources: DataSource[]; }

export function resolveTeamDataProfile(args: {
  teamId: string;
  planTier: "FREE"|"PRO"|"ELITE";
  catapultTier: ReturnType<typeof getCatapultDataTier>;   // reuse — do NOT re-derive
  integrations: TeamIntegrationRow[];                     // team_settings / team_integrations / *_integration tables
}): TeamDataProfile;
```

- **Catapult:** `variant` = `"pro"` | `"lite"` straight from `getCatapultDataTier()`. Pro = API, inertial
  (IMA/accel-decel/stride) entitled; Lite = OpenField CSV, GPS-only entitled, **no IMA** (so data-quality
  marks IMA `not_expected`, not `silent`).
- **STATSports:** provider `statsports` (Sonra) — API or file per config.
- **Hudl:** split the current single "Hudl" into **`hudl_wimu`** (elite inertial) and **`hudl_titan`**
  (accessible; **Titan indoor = IMU only**, GPS `not_expected`). The Titan upload already exists
  (`/coach/integrations/titan`, `integrations/titan/*`) → its profile is `provider:"hudl_titan",
  variant:"titan", mode:"file", env:"indoor"`.
- **VALD / WHOOP / Polar / GymAware:** secondary sources (force plate / recovery / VBT) — API, their own
  entitled sets; never the primary load anchor.
- `entitledMetrics` per source is the **single input** to `dataQuality` ("what should arrive") and to
  **surface gating** (which Intelligence pages render). This replaces any ad-hoc per-page tier checks:
  one profile, read everywhere.

**Guardrail:** `resolveTeamDataProfile` only *reads* existing configs + `getCatapultDataTier()`. No new
tier column, no new competing source of truth. Setting a team's sources stays where it is today
(Integrations / admin), just made explicit for the provider+variant combos above.

## Part B — Today Sync/Upload card (reads Part A)

Generalise the existing Catapult sync affordance on Today (`DevCoachDashboardClient`: `catapultSyncing`,
the daily Sync button, backfill date) into a provider-aware **Data card** at the top of Today:

- For each `DataSource` in the team profile, render one row:
  - **`mode:"api"`** → a **"Sync now"** button → the matching existing route (`integrations-live/sync/trigger`,
    or `vald/sync`, `whoop/sync`, `polar/sync`, `gymaware/sync`). Show last-sync + freshness.
  - **`mode:"file"`** → an inline **drop zone / "Upload latest"** → posts to the matching upload route
    (`catapult-upload`, `vald`, **`integrations/titan/upload`**) with the right parser. Deep-link to the
    full upload page for options/preview.
- **Freshness chip per source** from `status.ts` (`buildIntegrationStatusSummary`, connection health,
  recent imports) + `dataQuality` status: `healthy` / `degraded` / `silent` / `not_expected`. e.g.
  "Catapult (Pro) · synced 2h ago ✓" / "Titan (indoor) · no file today — upload".
- Collapse to a single line when everything is fresh; expand when something needs action (exception-gated,
  like the coach-signals chips).

**Security:** the Sync button only *triggers* the server job using **already-stored** credentials — API
keys are entered/managed on the Integrations page, **never** shown or typed on Today. Uploads are files
only. No secrets on Today.

## Reuse (verified — don't rebuild)

- `catapultTier/getCatapultDataTier()` (Pro/Lite + override) — the one Catapult tier source.
- `integrations/providers.ts` + `registry.ts` + `status.ts` (`buildIntegrationStatusSummary`) +
  `playerMapping.ts`; the per-provider sync routes and upload routes listed above; `integrations/titan/*`.
- `dataQuality.ts` statuses (`healthy|degraded|silent|not_expected`) — now fed by `entitledMetrics`.
- Today's existing Catapult sync button + backfill (generalise, don't duplicate); `plan_tier`.

## Guardrails / tests

- `resolveTeamDataProfile` + the card logic are pure/deterministic where possible; null-safe (no config →
  empty profile, labelled "no data source set"). **No new tier/provider column** — reads existing configs.
- Catapult Lite → IMA entitled = false → data-quality `not_expected` (never a false `silent`); Titan →
  GPS `not_expected`. Pro → IMA entitled. STATSports/WIMU entitled sets correct.
- Today card: api source → Sync route; file source → upload route; freshness per source; secrets never on
  Today; multiple sources list correctly; exception-gated collapse.
- **Boundary:** profile + card are descriptive/ingestion only — never write or influence
  `readiness_entries.color` / `v_coach_readiness_today_v8`.
- Tests: Breiðablik (Catapult Pro, api) → Sync button + IMA entitled; a Lite team → Upload + IMA
  not_expected; Njarðvík W (Hudl Titan, indoor, file) → Upload + GPS not_expected; a STATSports team; a
  team with Catapult + VALD → two rows; profile is the single input to gating (a page hidden for Lite shows
  for Pro off the same profile); boundary test.

`npx eslint <changed files>` + tests; lint-clean. Any migration (e.g. making a Hudl variant explicit) saved
under `supabase/migrations/` — but prefer reusing existing columns over adding a competing one.

## Acceptance
- [ ] One `resolveTeamDataProfile` that correctly reports each team's sources with provider + **variant**
      (Catapult Pro/Lite, Hudl WIMU/Titan), mode (api/file), env (indoor/outdoor), and entitled metrics —
      reusing `getCatapultDataTier()`, adding **no** competing source of truth.
- [ ] Today shows a provider-aware Data card: **Sync now** for API teams, inline **Upload** for file teams
      (incl. Titan), with per-source freshness; secrets never on Today.
- [ ] `dataQuality` + surface gating read the same profile → Lite IMA / Titan GPS correctly `not_expected`.
- [ ] Descriptive-only boundary test passes; reuses existing routes/engines; eslint + tests clean.

## Notes / source of truth
Provider + tier facts confirmed against the repo: `plan_tier` (FREE/PRO/ELITE), `getCatapultDataTier()`
(Pro/Lite + `catapult_data_tier_override`), `dataQuality.ts` (four-competing-sources warning — heed it),
the existing per-provider sync + upload routes, and the already-built Titan upload (`integrations/titan`).
Hudl = WIMU (elite) or Titan (accessible; indoor IMU-only). This brief makes the team data profile explicit
and the single thing Today, data-quality and surface-gating all read.
