# Claude Code brief — evidence-based, sex-specific post-match recovery timeline ("capacity-back" curve)

Goal: give the coach an **expected recovery curve** after a match — "how much of his capacity should be
back at MD+1 / MD+2 / MD+3" — that is **calibrated to the research**, **sex-specific**, and
**individualised by the match dose and the player's own markers**. The existing post-match board already
shows the **observed** rebound (canonical colour + process reads). This adds the **expected** line to
compare against, so "still flagged at MD+2" reads as *lagging behind his expected curve* — or, for a
women's squad, as *exactly on the expected (later) curve*. **Descriptive/coach-owned; never the readiness
colour or the daily decision.**

## What already exists (DO NOT rebuild — extend it)

- **`/coach/post-match-recovery`** (page + `/api/coach/post-match-recovery`) already shows every player who
  played, minutes, and the **canonical readiness colour** (`readiness_entries.color` =
  `v_coach_readiness_today_v8.final_color`) across **MD+1…MD+5**, plus a per-player IMA "dose", and cites
  **Nédélec 2012** (rebound by MD+2/MD+3) and **McBurnie 2022** (decel → muscle damage). This is the
  **observed** rebound board.
- **`src/lib/recovery/processReads.ts`** `computeProcessReads` → per-process status
  (`neuromuscular | autonomic | perceptual | sleep`, `recovered | lagging | no_data`) from CMJ, HRV,
  resting HR, soreness, sleep **vs baseline**. These are the observed signals at each timepoint.
- **`src/lib/recovery/nightMatch.ts`** `isNightMatch` (late kickoff shifts the sleep/autonomic timeline).
- The board's IMA "dose" (`LOAD_W`: decel 1.0, accel 0.6, cod 0.4, jumps 0.3) is the **match load** input
  the expected curve should scale to.

So this feature is a **new pure lib that produces the expected curve**, plus an **overlay** on the existing
board (observed vs expected). No new board, no new data pipeline.

## The one honest thing about "sex-specific"

There is **no per-player `sex` column**. Sex lives at **team level**: `teams.gender` = `'M' | 'F' | 'mixed'`
(+ `players.date_of_birth` exists for age). So:

- **Calibrate the curve by `teams.gender`.** A women's squad → the female template; men's → the male
  template; `mixed`/unknown → the pooled team-sport template, **labelled** ("general template — squad sex
  not set").
- Optionally read a per-player `sex` override **if** a nullable `players.sex` column is later added (a
  `mixed` squad is the case that wants it) — the lib takes `sex` as an input either way, so adding the
  column later is a one-line wiring change, not a lib change. **Do not fabricate** a player's sex; fall
  back to the team template and say so.

## The science the curve encodes (this is also the coach explanation, below)

Post-match fatigue is not one thing that fades linearly — different systems recover on **different clocks**,
and the **female clock differs from the male one**. The curve is a per-timepoint **% of capacity back**,
lowest at the trough, climbing to ~100%:

- **Neuromuscular (jump / sprint power).** Male literature: trough at/near **MD+1**, largely back by
  **MD+2–MD+3** (Nédélec 2012; Brownstein/Thomas 2017 show both *central*, voluntary-activation, and
  *peripheral*, contractile, components, resolving over ~48–72h). **Female literature (Goulart 2022): the
  CMJ dip is DELAYED** — negligible immediately (ES ≈ −0.04) but present at **12h (ES ≈ −0.38) and 24h
  (ES ≈ −0.42)**, with **sprint** down at **48h (ES ≈ −0.75)**. So the women's neuromuscular trough sits
  **later** than the men's, and a flag at 12–24h is *on-curve*, not alarming.
- **Biochemical / muscle damage (CK, LDH).** Rises acutely, **peaks ~24h**, and in women **persists to 72h**
  (Goulart: CK ES ≈ 3.79, LDH ES ≈ 7.46 still elevated at 72h; Doeven 2018 shows CK elevated 24–72h in team
  ball sports). This is the **long tail** — the reason a heavy decel load (McBurnie 2022) means a slower
  return even when the colour looks fine by MD+2.
- **Perceptual (fatigue, soreness, vigor).** Fatigue up / vigor down at **12h**, soreness up **immediately
  and at 24h** (Goulart) — the earliest and most visible to the player, usually resolving by MD+2.
- **Autonomic (HRV / resting HR).** Depressed post-match, back over ~24–48h; a **night match** pushes the
  autonomic/sleep timeline later (reuse `isNightMatch`).

The **match dose** scales the depth of the trough and the length of the tail: more high-intensity decel/accel
+ minutes (the board's IMA dose) → deeper trough, longer tail. The **player's own markers** (CMJ/HRV vs
baseline, minutes, soreness) then **pull the expected line toward what he's actually showing** and set
confidence.

## New pure lib `src/lib/recovery/expectedRecoveryCurve.ts`

```ts
import type { Bi } from "@/lib/recovery/processReads";

export type Sex = "male" | "female" | "unknown";
export type ProcessKey = "neuromuscular" | "biochemical" | "perceptual" | "autonomic";

/** One expected point on one process's recovery clock. */
export interface ExpectedPoint {
  hoursPost: number;              // 0 (immediate), 12, 24, 48, 72
  mdOffset: number | null;        // MD+1 / MD+2 / MD+3 mapped from hoursPost + kickoff
  pctCapacityBack: number;        // 0–100 — modelled "% of capacity back" at this point
}
export interface ProcessCurve {
  process: ProcessKey;
  points: ExpectedPoint[];
  troughHours: number;            // where the low point sits (male ~24 NM, female later)
  fullByHours: number | null;     // modelled return-to-~100% (null = still recovering at 72h, e.g. CK female)
  why: Bi;                        // plain-language, sex-aware ("women's CMJ trough sits at 12–24h…")
}
export interface RecoveryCurve {
  sex: Sex;
  templateLabel: Bi;              // "female template (Goulart 2022)" / "general team-sport template"
  dose: "low" | "moderate" | "high";  // from the match IMA dose + minutes
  curves: ProcessCurve[];
  confidence: "high" | "moderate" | "low";  // baseline maturity + signal coverage
  caveat: Bi;                     // "expected model, not a measurement — compare to observed"
}

export function buildExpectedRecoveryCurve(opts: {
  sex: Sex;                       // from teams.gender (or player override if present)
  matchImaDose: number | null;    // the board's weighted IMA "dose" for this player's match
  minutes: number | null;
  kickoffTime?: string | null;    // for MD-offset mapping + night-match shift (reuse isNightMatch)
  baselineMaturityDays?: number | null;  // how established his personal norms are → confidence
}): RecoveryCurve;

/** Observed-vs-expected read for ONE timepoint (drives the overlay). */
export type Tracking = "ahead" | "on_track" | "behind" | "no_data";
export interface CurveComparison {
  process: ProcessKey;
  hoursPost: number;
  expectedPct: number;
  observedStatus: "recovered" | "lagging" | "no_data";  // from computeProcessReads
  tracking: Tracking;             // observed vs the sex-specific expected point
  note: Bi;                       // "on his expected curve — women's NM trough is at 12–24h"
}
export function compareToExpected(
  curve: RecoveryCurve,
  observed: Array<{ process: ProcessKey; hoursPost: number; status: "recovered" | "lagging" | "no_data" }>,
): CurveComparison[];
```

- **Templates are the calibration**, keyed by `sex`: the female template places the neuromuscular trough at
  12–24h and gives the biochemical curve a **72h tail** (`fullByHours: null` for CK at high dose); the male
  template puts the NM trough at ~MD+1 with return by MD+2–3; `unknown` → pooled. Encode the templates as
  named constants with a **citation comment per curve** — no magic numbers.
- **Dose scales the template** (deeper trough + longer tail at high IMA dose/minutes); markers + baseline
  maturity set **confidence** (thin baseline → `low`, wider expected band).
- `compareToExpected` turns the existing `computeProcessReads` statuses into `ahead | on_track | behind`
  **against the sex-specific expected point** — the whole value: "lagging" at 24h is `behind` on a male
  curve but `on_track` on the female curve.
- Pure, deterministic, null-safe. No I/O, no Supabase, no colour.

## Surface (overlay on the existing board — no new page)

- On `/coach/post-match-recovery`, per player add the **expected curve** behind the observed MD+1…MD+N
  cells: a small **capacity-back sparkline** (0→100%) with the **trough marked**, and each observed
  timepoint tagged **on-track / behind / ahead** vs expected. The **layered read** (per CLAUDE.md):
  - **(0) verdict:** one line — e.g. "On his expected recovery curve" / "Behind expected at MD+2".
  - **(1) the why, 2–3 plain facts, no click:** "Women's neuromuscular trough is 12–24h, so a MD+1 flag is
    expected"; "high decel dose → longer tail"; the template + confidence chip.
  - **(2) behind 'Show details':** the per-process expected %s, hours, ES-based template values, citations.
- A **confidence chip** (template + baseline maturity + signal coverage) and an **AI-free** label — this is a
  **rules/lookup model**, not AI; it cites papers, not a model guess.
- Keep the board's existing observed colour exactly as is. The expected curve is a **second, labelled line**,
  never recoloured into the verdict.

---

## How it works — to explain to coaches (plain language)

*(Both languages, coach-readable, no jargon — hand this to a head coach.)*

**EN.** "After a match, a player doesn't recover all at once — different parts of him come back on different
timelines, and the timeline is different for women and men. We drew the *expected* recovery curve from the
research, for your squad's sex, and scaled it to how hard *this* match was for *this* player. Then we lay his
*actual* readings on top. Green-on-track means he's recovering exactly as the science says he should. 'Behind
expected' means his body is taking longer than the match should have cost him — worth a look. The key point
for a women's team: the jump-power dip comes **later** (around 12–24 hours, not right after the match) and the
muscle-damage markers hang on **longer** (up to 72 hours). So a woman flagged the morning after is usually
**on her normal curve, not in trouble** — using a men's timeline would make you panic early and push too soon.
Heavier matches (more hard decelerations, more minutes) dig a **deeper dip and a longer tail**. This is a
*description* to help you read recovery — it never changes the player's traffic-light colour or the day's
training decision. Those stay yours."

**IS.** "Eftir leik nær leikmaður sér ekki allur í einu — ólíkir hlutar koma til baka á ólíkum tíma, og
tímalínan er ólík hjá konum og körlum. Við teiknum *væntanlegu* endurheimtar-kúrfuna út frá rannsóknum, fyrir
kyn liðsins, og skölum hana eftir því hversu erfiður *þessi* leikur var fyrir *þennan* leikmann. Svo leggjum
við *raunverulegu* mælingarnar hans ofan á. 'Á áætlun' þýðir að hann er að ná sér nákvæmlega eins og
vísindin segja. 'Á eftir áætlun' þýðir að líkaminn er lengur en leikurinn hefði átt að kosta — þess virði að
skoða. Lykilatriðið fyrir kvennalið: stökkkrafts-dýfan kemur **seinna** (um 12–24 klst, ekki strax eftir
leik) og vöðvaskemmda-mælarnir hanga **lengur** (allt að 72 klst). Þannig að kona sem flaggast morguninn
eftir er yfirleitt **á sinni eðlilegu kúrfu, ekki í vandræðum** — að nota karla-tímalínu myndi láta þig
örvænta of snemma og ýta of fast. Erfiðari leikir (fleiri harðar hemlanir, fleiri mínútur) grafa **dýpri
dýfu og lengri hala**. Þetta er *lýsing* til að hjálpa þér að lesa endurheimt — hún breytir aldrei
umferðarljósa-litnum eða þjálfunarákvörðun dagsins. Þær eru áfram þínar."

**One sentence to remember it by:** *"Expected curve = what the research says recovery should look like for
her sex and this match; observed = what she's actually showing; the gap is the signal — and women recover on
a later, longer clock."*

---

## Guardrails / tests

- Pure `expectedRecoveryCurve.ts`; deterministic; null-safe (no dose → template's moderate curve, labelled;
  no markers → expected line only, `low` confidence). **Never fabricate** a sex — `unknown` → pooled
  template, labelled.
- **This is a lookup/rules model, not AI** — every template value carries a paper citation comment; the UI
  labels it as research-based, not AI-generated.
- Reuse `computeProcessReads`, `isNightMatch`, the board's IMA dose — **no new recovery engine, no new data
  fetch**.
- **Boundary test (mandatory):** the expected curve and the observed-vs-expected tracking **never** write or
  influence `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`, `athlete_decision_history`,
  or `stage4_decisions`. It is display-only.
- Tests: female template puts the NM trough at 12–24h and male at ~MD+1 (24h); female biochemical curve has a
  72h tail (`fullByHours` null at high dose); higher IMA dose → deeper trough + longer tail; `compareToExpected`
  returns `on_track` for a 24h female NM flag but `behind` for the same flag on a male curve; `unknown` →
  pooled + labelled; confidence drops with thin baseline; **boundary test** (no colour write).

`npx eslint <changed files>` + tests; lint-clean. No migration required (uses `teams.gender` +
`players.date_of_birth` which exist); if a per-player `players.sex` override is added later, save that
migration under `supabase/migrations/`.

## Acceptance

- [ ] `buildExpectedRecoveryCurve` returns a sex-specific, dose-scaled per-process capacity-back curve
      (neuromuscular / biochemical / perceptual / autonomic) with trough + tail + plain "why" + confidence.
- [ ] Sex comes from `teams.gender` (player override optional), never fabricated; `mixed`/unknown → pooled
      template, labelled.
- [ ] Overlaid on the existing `/coach/post-match-recovery` board as a second, labelled line
      (observed-vs-expected: on-track / behind / ahead), layered read (verdict → why → details).
- [ ] Female curve correctly places the later NM trough (12–24h) and the longer biochemical tail (72h); a
      MD+1 flag on a women's squad reads `on_track`, not `behind`.
- [ ] Research-based (cited per template value), labelled NOT-AI; reuses existing engines; descriptive-only
      **boundary test passes**; eslint + tests clean.

## Citations

Goulart et al. 2022, *Sports Med Open* 8:72 — female-soccer fatigue/recovery meta (CMJ trough 12–24h;
sprint 48h; CK/LDH persist to 72h; perceptual at 12h). Doeven et al. 2018, *BMJ Open SEM* — post-match
recovery of physical performance + biochemical markers in team ball sports (CK 24–72h). Brownstein/Thomas
et al. 2017, *Front Physiol* 8:831 — etiology & recovery of neuromuscular fatigue after soccer (central +
peripheral, ~48–72h). Nédélec et al. 2012 — recovery kinetics / rebound by MD+2–MD+3 (already cited on the
board). McBurnie et al. 2022 — high-intensity decelerations → muscle damage (the dose; already on the board).
