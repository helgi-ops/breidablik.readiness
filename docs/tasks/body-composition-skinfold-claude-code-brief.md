# Claude Code brief — body composition (skinfold → Jackson-Pollock → %fat, + circumference)

Goal: let a coach record a player's body-composition measurements — skinfolds (and optionally girths)
— and have MicroPulse compute **body-fat %** (Jackson-Pollock → Siri), **lean mass**, and track them as
an **individual trend over time**. Weight + height already exist; this adds the fat/skinfold layer.

**Descriptive monitoring only** — it must NEVER touch the readiness colour, the load target, the daily
decision, or generate a prescriptive "lose fat" focus (the existing `physicalAssessment/recommend.ts`
already excludes body-comp codes — preserve that).

## READ THIS FIRST — athlete wellbeing (non-negotiable)

Body-fat tracking in athletes carries a real disordered-eating risk. The feature must be built to
inform, never to pressure:

- **Individual trend, not a verdict.** Show the player's own change over time. **No "ideal %", no
  red/amber/green "too fat" judgement, no target-% pressure, no ranking players by fat%.**
- **Always show the estimate's error.** Skinfold %BF is an estimate (±3–5% typical). State it, every time.
- **Consistency is the point.** Same tester, same sites, same equation, similar conditions/hydration —
  otherwise the trend is noise. Surface a note when the method/tester changes between measurements.
- **No prescriptive output.** The card never says "reduce body fat" or prescribes a diet. It reports the
  measurement and its trend; the coach/practitioner decides, with care.
- **Language:** neutral and clinical ("body-composition trend"), never evaluative about the body.
- Coach/staff visibility only (same RLS as `player_body_metrics`); consider whether the player sees it.

## What exists (reuse)

- **`player_body_metrics`** (migration `20260816090000`): `mass_kg`, `height_cm`, `measured_on`,
  `source`, `note`, RLS by team/coach. `bodyMass.ts` resolves weight with provenance.
- **`metricCatalog.ts`** already defines anthropometric codes `body_fat_pct`, `lean_mass_kg`,
  `sum_skinfolds_mm` (importable). This feature makes them **computed in-app** from raw sites.

## Storage — extend `player_body_metrics` (one row per measurement session)

Add columns (new migration under `supabase/migrations/`, keep the file + apply):

```
body_fat_pct   numeric  null check (body_fat_pct >= 2 and body_fat_pct <= 60)
bf_method      text     null   -- 'jp3' | 'jp7' | 'navy' | 'manual'
skinfolds_mm   jsonb    null   -- { chest, abdomen, thigh, triceps, suprailiac, subscapular, midaxillary }
girths_cm      jsonb    null   -- { neck, waist, hip }
sum_skinfolds_mm numeric null
lean_mass_kg   numeric  null
sex            text     null   -- 'M' | 'F' (needed for the equations; store per measurement or read from player)
age_years      numeric  null   -- at measurement (JP equations need age)
```

Weight/height stay where they are; a body-comp session sets the new fields alongside.

## Pure lib — NEW `src/lib/micropulse/load/bodyComposition.ts` (no I/O)

Implement the equations EXACTLY (verified constants). All skinfolds in **mm**, girths in **cm**.

### Jackson-Pollock body density

**3-site**
- Men (chest, abdomen, thigh), S = sum:
  `BD = 1.10938 − 0.0008267·S + 0.0000016·S² − 0.0002574·age`
- Women (triceps, suprailiac, thigh), S = sum:
  `BD = 1.0994921 − 0.0009929·S + 0.0000023·S² − 0.0001392·age`

**7-site** (chest, midaxillary, triceps, subscapular, abdomen, suprailiac, thigh), S = sum:
- Men: `BD = 1.112 − 0.00043499·S + 0.00000055·S² − 0.00028826·age`
- Women: `BD = 1.097 − 0.00046971·S + 0.00000056·S² − 0.00012828·age`

### Body-fat % from density
- **Siri (default):** `%BF = 495/BD − 450`
- Brozek (offer as alt): `%BF = 457/BD − 414.2`

### Optional circumference (US Navy) — for the "ummál" path (no calipers)
Measurements in cm; `log10`:
- Men: `%BF = 495 / (1.0324 − 0.19077·log10(waist − neck) + 0.15456·log10(height)) − 450`
- Women: `%BF = 495 / (1.29579 − 0.35004·log10(waist + hip − neck) + 0.22100·log10(height)) − 450`

### Lean mass
`leanKg = massKg · (1 − %BF/100)`  (and fatKg = massKg − leanKg).

### Signatures
```ts
export type Sex = "M" | "F";
export type Skinfolds = Partial<Record<"chest"|"abdomen"|"thigh"|"triceps"|"suprailiac"|"subscapular"|"midaxillary", number>>;
export interface BodyCompResult { bodyFatPct: number; method: "jp3"|"jp7"|"navy"; bodyDensity: number|null; sumSkinfoldsMm: number|null; leanKg: number|null; fatKg: number|null; conversion: "siri"|"brozek"; caveat: Bi; }

export function jacksonPollock3(o: { sex: Sex; ageYears: number; sites: Skinfolds; conversion?: "siri"|"brozek" }): BodyCompResult | null; // needs chest/abdomen/thigh (M) or triceps/suprailiac/thigh (F)
export function jacksonPollock7(o: { sex: Sex; ageYears: number; sites: Skinfolds; conversion?: "siri"|"brozek" }): BodyCompResult | null; // needs all 7
export function navyCircumference(o: { sex: Sex; heightCm: number; neckCm: number; waistCm: number; hipCm?: number }): BodyCompResult | null; // hip required for F
export function withLeanMass(r: BodyCompResult, massKg: number|null): BodyCompResult;
```

Return `null` (never a fabricated number) when required sites/inputs are missing, age/sex absent, or a
site is out of a plausible range (skinfold 1–60 mm; girth guards). `caveat` (Bi) states: estimate ±3–5%,
population equation, individual-trend read, descriptive-only.

## Route — extend `/api/coach/player/[id]/body-mass` (or add `/body-composition`)

- `POST { massKg?, heightCm?, sex, ageYears, method, skinfolds?, girths?, conversion?, measuredOn?, note? }`
  → compute via `bodyComposition.ts` → store the row (mass + body-comp fields). Coach role RLS as today.
- `GET` → resolved latest + **history** (for the trend), with method/tester flags for consistency.

## Surface — extend `BodyMassWidget` → a "Body composition" section (or `BodyCompositionCard`)

- Entry: pick method (JP-3 / JP-7 / Navy), enter the sites for that method, sex + age (default from
  player DOB if present), weight. Show the computed **%BF ± band**, **lean/fat kg**, and **sum of
  skinfolds**.
- Read (explainability layered): (0) "Body-composition trend — down 1.4% over 3 months (JP-7, same
  tester)"; (1) latest %BF ± error, lean mass, method + date; (2) the site table + equation + citation
  behind "Show details". A small sparkline of %BF and lean mass over time.
- Honest labels: the ± band, "estimate not a lab measure", method-change/tester-change warnings, and the
  neutral-language rule above. No target line, no squad ranking.

## Guardrails

- Pure lib: no I/O in `bodyComposition.ts`; deterministic; exact constants above.
- Never fabricate: missing/invalid inputs → `null` + honest empty state.
- **Boundary test:** body-comp output must not reach any readiness/decision/prescription path (mirror
  the `bodyMass` descriptive rule and the existing body-comp exclusion in `recommend.ts`).

## Tests — `src/lib/micropulse/load/__tests__/bodyComposition.test.ts`

1. JP-3 men, chest/abdomen/thigh = 10/15/12, age 25 → BD then Siri %BF (assert to 1 dp against a hand
   calc); lean mass with mass 80 kg.
2. JP-3 women (triceps/suprailiac/thigh) → correct female constants used.
3. JP-7 men, all 7 sites → matches the 7-site constants.
4. Navy men: height 180, neck 38, waist 85 → plausible %BF; women needs hip (null without it).
5. Missing a required site → `null`. Out-of-range skinfold (0 or 90) → `null`.
6. Boundary test: no readiness/decision/prescription import.

`npx eslint <changed files>` + the new test; keep new code lint-clean (CLAUDE.md). Migration saved under
`supabase/migrations/`.

## Acceptance checklist

- [ ] `bodyComposition.ts` pure, exact JP-3/JP-7/Siri(+Brozek)/Navy + lean mass; null on bad input.
- [ ] `player_body_metrics` extended (migration saved + applied); RLS unchanged.
- [ ] Route computes + stores + returns history; coach RLS.
- [ ] Widget: entry per method, %BF ± band, lean/fat, trend sparkline; **no target, no ranking, neutral
      language, consistency/tester warnings**.
- [ ] Descriptive-only boundary test passes; body-comp still excluded from prescriptions.
- [ ] Tests + eslint clean.

## Citations

Jackson & Pollock 1978 (men, 3/7-site); Jackson, Pollock & Ward 1980 (women); Siri 1961 & Brožek 1963
(density→%fat); US Navy circumference method (Hodgdon & Beckett 1984). Reference calculator the founder
linked: linear-software.com (implements JP + others).

## Sources (formula verification)
- Jackson-Pollock 3/4/7-site density equations — https://www.topendsports.com/testing/density-jackson-pollock.htm
- Jackson & Pollock 7-site — https://www.anthrometrix.com/pages/jackson-and-pollock-7-site-formula-for-calculating-body-fat-percentage
