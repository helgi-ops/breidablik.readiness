# Claude Code task — align ALL public pricing surfaces to the signed contract (P0)

Paste to Claude Code (or `@docs/tasks/pricing-page-align-to-contract-claude-code-brief.md`).
Fixes a real inconsistency: the public site and the signed pilot contract disagree on the top-tier
price. **The contract is the source of truth.**

## Key fact: there is ONE canonical plan file
`src/lib/micropulse/product/plans.ts` (`PLAN_DEFINITIONS`) is the single source for plan names +
prices. It is consumed by the **homepage** (`src/app/home/page.tsx`), the **pricing page**
(`src/app/pricing/page.tsx`), and **coach settings** (`src/app/coach/settings/page.tsx`). So most of
this change happens in one file and all surfaces update together.

Current state in `plans.ts`: `FREE €0 / LITE €129 / PRO €349 / ELITE "From €1250"`.
The signed contract prices in ISK: **Pro 49.990 kr** (≈ €349), **ELITE 149.990 kr** (≈ €1,050),
founder ELITE 104.993 kr, extra team 25.000 kr. → The page's **"From €1250" ≠ 149.990 kr (~€1,050)**.

## Scope: two levels — do LEVEL 1 now, leave LEVEL 2 as a separate task

### LEVEL 1 — labels + prices (safe, do now)
Edit **only** the display fields in `plans.ts` (`displayName`, `monthlyPriceLabel`, `summary`,
`targetAudience`). **Do NOT rename the internal keys** `FREE/LITE/PRO/ELITE` — they are wired into
the gating engine (`planResolution`, `hasFeature`, `usePlan`, `features.ts`) and the DB
`teams.product_plan`. Renaming keys is Level 2.

1. **ELITE:** `monthlyPriceLabel` "From €1250 / month" → **"From €1.050 / month · 149.990 kr / mán."**
   (align to the contract; note founder rate 104.993 kr in `summary` if useful).
2. **PRO:** keep €349; add ISK: **"€349 / month · 49.990 kr / mán."**
3. **LITE:** keep €129; add ISK: **"€129 / month · 18.900 kr / mán."**
4. **FREE:** relabel as trial-oriented if desired (a 30-day trial, not a permanent free tier) — or
   leave FREE but ensure the homepage/pricing copy says "30-day trial".
5. **Delete the €70 indoor-discount note** on `src/app/pricing/page.tsx` (line ~32) — it is not in the
   contract and is an orphan.
6. Show **ISK to Icelandic visitors, EUR to international** (both pages already have `useLang`; key
   currency off language: IS → ISK primary, EN → EUR primary). Never show a diverging EUR-only Elite figure.

### LEVEL 2 — two-product rename (separate task, do NOT do now)
Renaming the public tiers to **Coach / Club / Team / Academy** and splitting into two products
(Coach/Club = Lite/PT; Team/Academy = club-on-Catapult) is a bigger refactor: it touches
`planResolution`, `hasFeature`, `usePlan`, `signup`, and the DB `product_plan` values. Scope it on its
own. For now, a display-name **mapping** is enough if you want the marketing words: show
"Pro (Team)" / "Elite (Academy)" without changing the keys.

## Also update (surface-specific)
- **`src/app/pricing/page.tsx`**: uses `type PlanKey = "free" | "pro" | "elite"` and hardcodes some
  copy (€349 / 49.990 kr / €70 note). Reconcile to `plans.ts`; remove the €70 note; ensure ISK+EUR.
- **`src/app/home/page.tsx`**: reads `ORDERED_PLAN_DEFINITIONS`; no hardcoded prices, so it updates
  automatically once `plans.ts` is fixed. Keep the "Know who's ready — and why" positioning.
- **`src/app/signup/create-team/page.tsx`**: "14-day Pro trial" copy + `product_plan: "PRO"` — fine to
  keep; just make sure the trial length/label matches the pricing page.

## Marketing sport-science copy (light pass, aligns with the Methodology page + contract v5)
Soften any public **injury-risk / injury-prediction** marketing language to "readiness / workload
monitoring", consistent with `/methodology` and the softened contract (v5):
- `src/app/blog/page.tsx` (~line 86): "meiðslaforvarnir" subtitle — reframe to
  "álagsstjórnun og readiness" or keep but avoid implying injury prediction.
- Grep the public pages for `injury`, `meiðsl`, `injury-risk`, `spá` and ensure none *promise*
  injury prediction. (`src/app/exec/page.tsx` is already careful — it says injuries show availability,
  not type/severity — leave it.)

## Conventions
- Client components + `useLang`; Tailwind core only; no new deps.
- `npx tsc --noEmit` clean; `npx eslint` clean on every file you touch.
- No DB migration (Level 1 is display-only).

## Acceptance criteria
- No public price contradicts the contract: **no "From €1250", no €70 orphan**; ISK and EUR consistent
  (Pro 49.990 kr / €349, Elite 149.990 kr / ~€1,050).
- Homepage, pricing page and settings all reflect the same numbers (they share `plans.ts`).
- No public page promises injury prediction; language matches `/methodology`.
- Internal plan keys unchanged (gating + `product_plan` untouched).
