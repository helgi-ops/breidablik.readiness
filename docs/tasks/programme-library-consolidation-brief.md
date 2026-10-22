# Consolidate the 6 programme/library pages → one Programme library hub

Part of the coach-surface consolidation (`coach-pages-audit-background-vs-destination.md`, step 1).
Goal: collapse six sidebar entries into **one "Programme library" hub with tabs**, without
rewriting the bespoke page bodies. Follows the proven rehab-hub pattern (`/coach/rehab-protocols`)
but these pages are tab-able (several already wrap reusable components), so the target is real tabs,
reached in two safe phases.

## The six pages (grounded)

Two natures:

**Browse / assign (reference libraries):**
- `/coach/templates` — "Programme library": pre-built S&C/recovery programmes + assign; uses
  `TemplateBlockBuilder`, `AssignRehabModal`, shadcn/ui. (Football-coach side.)
- `/coach/isometric-protocols` — wraps `IsometricProtocolLibrary` (the same component the PT
  dashboard tabs). Reference only. (Football-coach side.)
- `/coach/recovery-protocols` — wraps `RecoveryProtocolList`. Reference only. (Football-coach side.)
- `/coach/starter-templates` — browse + assign system-seeded starter programmes;
  POST `/api/trainer/starter-templates`. (PT-mode only.)

**Build / CRUD (create own):**
- `/coach/custom-templates` — "My training programmes": build custom cluster/contrast structures
  (`templateAutoGenerate`, `structureHowTo`). `force-dynamic`. (Listed in BOTH football + PT sidebars.)
- `/coach/my-exercises` — trainer's own exercises CRUD; feeds the Plan builder browse. (PT-mode only.)

## Critical constraint — two sidebars, mode-gated
These pages are split across two arrays in `src/app/coach/CoachSidebar.tsx`:
- `strengthPlanningLinks` (football coach, ~line 214): `templates`, `custom-templates`,
  `isometric-protocols`, `recovery-protocols` (+ others like `strength`, `lv-profile`).
- `ptStrengthLinks` (PT mode, ~line 191): `starter-templates`, `custom-templates`, `my-exercises`.
- `custom-templates` appears in **both**.

So the hub's visible tab set MUST depend on mode (football coach vs PT). Do NOT show PT-only tabs
(`starter-templates`, `my-exercises`) to a football coach, or football-only tabs (`isometric`,
`recovery`, `templates`) to a PT. Reuse the existing mode branch that already picks which array to
render (football renders `strengthPlanningLinks` ~line 745; PT renders `ptStrengthLinks` ~line 561).

## Target: `/coach/programme-library` (tabbed hub)

One route, a tab bar, each tab lazy-mounts the relevant existing surface. Tab set resolved by mode:

| Tab | Source | Shown to |
|---|---|---|
| Programmes | `templates` body | football coach |
| Custom programmes | `custom-templates` body | both |
| Isometric protocols | `IsometricProtocolLibrary` | football coach |
| Recovery protocols | `RecoveryProtocolList` | football coach |
| Starter templates | `starter-templates` body | PT |
| Exercise library | `my-exercises` body | PT |

Deep-linkable: `/coach/programme-library?tab=custom` etc. Default tab = first available for the mode.

### Phase 1 — launcher (safe, ships first; mirrors the rehab hub)
A selector page: cards for each mode-appropriate page linking to the existing routes. Zero risk to
the bespoke bodies. Collapses the sidebar immediately. Use this if time-boxed.

### Phase 2 — real inline tabs (the target)
Promote each page's body to a mountable component and render inside the hub's tab panel:
- **Trivial (already a component):** `isometric-protocols` → `<IsometricProtocolLibrary/>`,
  `recovery-protocols` → `<RecoveryProtocolList/>`. Drop straight into a tab.
- **Extract body → component:** `templates`, `custom-templates`, `starter-templates`,
  `my-exercises` — move the page's JSX/state into `Xxx View` component; the old `page.tsx` renders
  `<XxxView/>` (so the standalone route still works) and the hub renders the same component in a tab.
  `force-dynamic` pages: keep `export const dynamic = "force-dynamic"` on the hub route.
- Render tabs post-mount only (no `display:none` during SSR/stream for `force-dynamic` bodies);
  lazy-mount the active tab so six heavy bodies don't all boot at once.

## Sidebar changes (`CoachSidebar.tsx`)
- `strengthPlanningLinks`: replace `templates`, `custom-templates`, `isometric-protocols`,
  `recovery-protocols` with ONE `{ href: "/coach/programme-library", label: { EN: "Programme
  library", IS: "Prógrammasafn" } }`. Keep `strength`, `lv-profile` etc. as-is.
- `ptStrengthLinks`: replace `starter-templates`, `custom-templates`, `my-exercises` with the same
  single hub link. (The hub shows the PT tab set in PT mode.)
- Fixes the `custom-templates` double-listing automatically (one hub entry per mode).
- Update the section comment (~line 167) to describe the hub.

## Old routes
Keep all six `page.tsx` routes working (they render the extracted `XxxView` components), so existing
deep links / bookmarks don't break. Optionally redirect each to `/coach/programme-library?tab=…`
later; not required for phase 1.

## Gotchas (learned building the rehab hub)
- **Language default:** `useLang()` returns a TUPLE. Use `const [lang] = useLang();` and
  `const isEN = lang !== "IS";` — English is the default (CLAUDE.md), Icelandic is the toggle. Do
  NOT `const { lang } = useLang()` (object destructure → `undefined` → wrong-language render).
- Match the existing Tailwind conventions (slate/violet, `shadcn/ui` where the source pages use it).
- Preserve any per-page `export const dynamic = "force-dynamic"` on the hub if a mounted tab needs it.
- Bilingual: labels + shell copy IS/EN; clinical/exercise detail can stay English (as today).

## Guardrails
- Descriptive/config surfaces only — no readiness-colour interaction (none of these touch it).
- Preserve mode/tier gating exactly (PT vs football) — no leaking PT-only tabs to coaches.
- No new lint errors (`npx eslint` the touched files; the sidebar already has a pre-existing
  `set-state-in-effect` warning at ~line 306 — don't add to it).

## Verification
- `npx eslint` the hub + sidebar (clean).
- Manually (dev server): football coach sees Programmes / Custom / Isometric / Recovery tabs; PT
  sees Custom / Starter / Exercise library; `?tab=` deep link selects the right tab; each tab renders
  the same content as the old standalone page; English by default, IS on toggle.
- Confirm the six old routes still render standalone.

## Rollout
1. Phase 1 launcher + sidebar collapse (ship — biggest visible win, lowest risk).
2. Phase 2 inline the two trivial component tabs (isometric, recovery).
3. Phase 2 extract the four body components; wire as tabs; optional redirects.

Ref: `coach-pages-audit-background-vs-destination.md`, `/coach/rehab-protocols` (the pattern),
`CoachSidebar.tsx` (`strengthPlanningLinks`, `ptStrengthLinks`, mode branch).
