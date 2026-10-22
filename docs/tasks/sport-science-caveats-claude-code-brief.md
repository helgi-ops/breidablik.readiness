# Claude Code task — sport-science caveats in the app (P0)

Paste this to Claude Code (or `@docs/tasks/sport-science-caveats-claude-code-brief.md`).
Pairs with the new `/methodology` page: this makes the in-app claims match the honesty stated there.
Source: `docs/micropulse-product-audit-2026-06.md` §2.

## Goal

Three credibility fixes, all small, all on-brand ("rules decide, AI explains"):

1. **Kill the PR-forecast false precision** — lead with the trend rate, frame the ETA as conditional.
2. **Add an ACWR caveat** everywhere the 0.8–1.3 band / "sweet spot" is shown — it is a workload
   reference, not an injury predictor (debated since 2019).
3. **Add a reusable "Why this number? →" link to `/methodology`** next to the debated/tunable
   thresholds (ACWR, Foster monotony, heavy-lift cap), so any number is one tap from its basis.

No DB change, no migration. Keep it DRY: build **one** shared component and reuse it.
Run `npx tsc --noEmit` and `npx eslint <changed files>` — zero new errors.

---

## Step 1 — Reusable component: `MethodologyLink`

Create `src/components/common/MethodologyLink.tsx`. Bilingual via the existing `useLang` hook
(see `src/app/coach/train-like-you-play/page.tsx`). Optional `caveat` prop renders a short inline
note before the link.

```tsx
"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang";

/**
 * "Why this number? →" — links a threshold to its basis on /methodology.
 * Optional caveat renders a one-line honesty note (e.g. the ACWR debate).
 * Keeps the manifesto promise: every threshold is one tap from its source.
 */
export default function MethodologyLink({ caveat }: { caveat?: { EN: string; IS: string } }) {
  const [lang] = useLang();
  const IS = lang === "IS";
  return (
    <span className="mt-1 block text-[11px] leading-snug text-slate-400">
      {caveat ? <span className="text-amber-700">{IS ? caveat.IS : caveat.EN} </span> : null}
      <Link href="/methodology" className="underline decoration-dotted hover:text-slate-600">
        {IS ? "Af hverju þessi tala? →" : "Why this number? →"}
      </Link>
    </span>
  );
}
```

A ready-made ACWR caveat constant to pass in (put it next to the component or in a small
`src/lib/methodologyCaveats.ts`):

```ts
export const ACWR_CAVEAT = {
  EN: "A workload reference, not an injury predictor — debated since 2019 (Impellizzeri 2020).",
  IS: "Álags-viðmið, ekki meiðsla-spá — umdeilt frá 2019 (Impellizzeri 2020).",
};
```

---

## Step 2 — Fix the PR-forecast false precision

**File: `src/lib/trainer/loadIntelligence.ts`**, function `forecastPR` (~line 229). The reason
string currently leads with a confident ETA:

```ts
// CURRENT
reason = `On track to hit ${target} kg in ~${etaWeeks} weeks at +${weeklyRate.toFixed(1)} kg/wk.`;
```

Replace with rate-first, conditional language (keep the fields `eta_days`/`eta_weeks` unchanged so
nothing else breaks — only the human-readable framing changes):

```ts
// NEW — lead with the measured rate; ETA is an extrapolation, not a promise
reason = `Trending +${weeklyRate.toFixed(1)} kg/wk. If this holds, about ${target} kg in ~${etaWeeks} weeks.`;
```

Then find every UI that renders the forecast (grep for `eta_weeks`, `weekly_rate`, `forecastPR`,
and the consumers `src/app/api/client/today/route.ts` and
`src/app/api/coach/player/[id]/trend-forecast/route.ts`, then the components that show their output
— likely on the client Progression page and any PR/hero card):

- Make the **weekly rate the headline** ("averaging +X kg/week"), and the ETA the secondary,
  clearly-conditional line. If a component builds its own sentence instead of using `reason`, apply
  the same rate-first framing there.
- If the forecast is shown as a hard date or single number anywhere, soften it to "on this trend".

> Rationale: e1RM SEE alone is ±2–3 kg; a line through ≥4 noisy points can't promise a date. The
> rate is measured; the ETA is an extrapolation. Say which is which.

---

## Step 3 — ACWR caveat + methodology link

Wherever the ACWR value or its 0.8–1.3 / "sweet spot" band is shown to a user, drop in
`<MethodologyLink caveat={ACWR_CAVEAT} />` once per card (not per row). Primary places to update
(confirm by opening each; add only where ACWR is actually displayed):

- `src/components/coach/PlayerLoadAcwrCard.tsx`
- `src/components/coach/InternalAcwrCard.tsx`
- `src/components/coach/QuadrantChart.tsx`
- `src/components/coach/GpsLoadIntelligence.tsx`
- `src/components/coach/LoadMetricsCard.tsx`
- the client-side load quadrant / AthleteHero card on `/client/progression` (search for `acwr`)

Do **not** change the numbers or the colour logic — only add the caveat/link. (Note: prior work
already softened ACWR injury-risk wording; this step adds the *debate* caveat + the basis link,
which were still missing.)

---

## Step 4 — Tunable-threshold links (lighter touch)

Add `<MethodologyLink />` (no caveat needed) next to these so coaches can see they're tunable:

- The **Foster monotony / strain** alert (search `monotony` in components — likely
  `TrainingLoadCard` / the client Today Foster alert).
- The **heavy-lift exposure** card (search `≥80%` or `heavy_sets`).

Skip game-model/velocity-loss for now — the `/methodology` page already documents them.

---

## Acceptance criteria
- `MethodologyLink` exists and is reused (no copy-pasted caveat strings).
- PR forecast now leads with the rate; no surface presents a PR ETA as a hard promise.
- Every ACWR display shows the caveat + a working link to `/methodology`.
- Foster + heavy-lift cards link to `/methodology`.
- EN/IS both correct; `npx tsc --noEmit` and `npx eslint` on changed files are clean.
- No numbers or colour thresholds changed; no DB migration.
