# Top speed: methods and plans

Coach-only reference: what training has been shown to raise **maximum sprint speed**, and three plans built
from those doses. Nothing here is sent to a player, and nothing touches the readiness colour, load targets or
daily decisions.

- Data: `src/lib/micropulse/speedMethods/index.ts` (pure, tested in `__tests__/speedMethods.test.ts`)
- Page: Programme Library → **Top speed** (`/coach/programme-library?tab=speed`, also `/coach/speed-methods`),
  in both the football and the PT tab sets
- PDF: `src/components/coach/SpeedPlanPdf.tsx`, one per plan, from the same data
- Entry point: the HSR Intelligence help footer links here (that page is where "Top speed due" points)

## The read

1. **Verdict:** sprint at full speed and build strength; together they have the best evidence for top speed.
   A sled helps the start, not top speed.
2. **Three facts:** team training alone does not raise top speed (Nicholson 2022); expect small gains
   (about 1.5–3.5% over 6–9 weeks); full speed needs full rest (4+ min) and stopping when speed drops
   (Haugen 2019).
3. **Details:** method cards grouped by evidence for top speed, each with a one-line dose; numbers, sources
   and "full paper read / abstract only" behind "Show details".

## Methods and evidence

| Method | Evidence for top speed | Key finding | Source (read from) |
|---|---|---|---|
| Flying sprints | Some (was Best, see below) | 10–30 m at >98%, 20–40 m build-up, 4–15 min rest (1–2 min per second flat out), 50–150 m a session, 48–72 h apart; sprint training alone not clearly better than normal training at 30 m, nothing beat it at 40 m | Haugen 2019 (full); Wang 2026 (full); Gómez-Piqueras 2024 (full) |
| Heavy strength + sprints in one session | Best | 30 m 4.34 → 4.19 s (−3.5%) vs lifting alone 4.33 → 4.31 s, 9 weeks, 17-year-olds | Kotzamanidis 2005 (full, OCR); Delecluse 1997 (full) |
| Strength and power training | Best | Only training type with a significant within-group top-speed gain in football (0.45); best for 5 / 20 m and the only one clearly better than normal training at 30 m (−0.13 s); youth: moderate over 10 m, small over 15–40 m | Nicholson 2022 (full); Wang 2026 (full); Oliver 2024 (full); Rønnestad 2011; Weyand 2000; Seitz 2014 (re-analysed 2022) |
| Jumps and bounds | Some | <10 weeks, 15+ sessions, 80+ jumps; loaded jumps add nothing; forward jumps for forward outcomes; youth 15–40 m small but consistent (0.42) — pick short-contact, forward jumps | Sáez de Villarreal 2012; Moran 2021; Oliver 2024 (full) |
| Light jump squats | Some | Carried over to 5–30 m in U-20 players | Loturco 2016 |
| Uphill + downhill (3°) | Some | +0.29 m/s (3.5%) top speed; within-group 0.54 in a 2024 review | Paradisis 2006; Myrvang 2024 (full) |
| Short sprints from standing | Start only | 5 m −3.4%, 20 m −2.6%; top speed +1.5% | Mendiguchia 2020 (full); Haugen 2019 |
| Sled sprints | Start only | Start 0.61, top speed 0.27 (n.s.); beats sprinting only over 10 m | Alcaraz 2018; Myrvang 2024 (full) |
| Hip thrust | Start only | Mostly under-18s (0.50); alone 0.22; low certainty | Lin 2026 |
| Nordic | None | 10 m −0.05 s; top speed unchanged | Ishøi 2018; Mendiguchia 2020 (full) |
| Assisted (towed) | None | No difference vs normal sprinting; injury risk | Myrvang 2024 (full); Haugen 2019 |
| Sprint sets at 90% once a week | None | No gain in 7 weeks | Haugen 2015 |
| Team training only | None | No top-speed gain (but at 40 m no method clearly beat it either) | Nicholson 2022 (full); Wang 2026 (full) |

"Full" = MicroPulse read the paper; everything else is from the abstract or a published summary
(`verifiedFrom` on each reference).

### Added 2026-11-13 (second batch, all read in full)

- **Wang 2026** (J Sports Sci Med, network meta-analysis, 31 RCTs in footballers). Heavy strength best for
  5 m and 20 m and the only method clearly better than normal training at 30 m; sprint training ranked first
  at 30 m but its interval crossed zero; nothing beat normal training at 40 m. Caveats: sparse 30/40 m
  networks; "speed training" pools sled, towed and plain sprinting; the PDF shows careless editing.
- **Oliver 2024** (Sports Med, 34 studies, 1,396 elite youth players). Strength, jump and combined
  (= strength + jumps, not sprints) training: moderate over 0–10 m, only small over 15–40 m. Jumps used were
  mostly vertical/slow-SSC — not matched to top speed.
- **Gómez-Piqueras & Alcaraz 2024** (Sports, narrative review + PSG practice). Used for: ~70% of match sprints
  start on the move; 45 m flying runs (15 + 30); progression straight → curved → unopposed finishing (≤40 m) →
  attack vs defence; extra sprints for non-starters; low braking on a speed day near the match; too little and
  too much are both associated with more injuries. **Not used as targets:** their own numbers (35–40% of
  sprints >85% of top speed, 15–20% >95%, training/match ratio 0.5–1.3) — the authors say not to copy them.

**Correction:** flying sprints moved from "Best" to "Some". Two independent syntheses (Nicholson 2022,
Wang 2026) do not show sprint training alone clearly beating normal training over 30–40 m; the evidence is
strongest when strength goes with it. The verdict (sprints + strength together) is unchanged.

## The plans

No study tested these exact plans. The doses come from the cited studies; the week is MicroPulse's
(`SPEED_PLAN_BASIS`, shown on the page and in every PDF footer).

- **In season (match Saturday), two versions** (`alternatives: true`) matching the two week models in
  Periodization Hub (`DEFAULT_MD_MICROCYCLE`, `TACTICAL_PERIODIZATION_MORPHOCYCLE`):

  | Version | MD+2 | MD-4 | MD-3 | MD-2 |
  |---|---|---|---|---|
  | Standard week | Non-starters only: 3 × 20 m flying | Gym: heavy legs, jump squats, 40–60 jumps | Flying 4 × 20 m at the start of the session | Only players who missed MD-3 or the flag names: 1–2 × 20 m |
  | Tactical Periodization | Non-starters only: 3 × 20 m flying | Gym (tension day) | – | Speed day: 4 × 20 m, long rests, long run-out, no sharp stops |

  Sessions for part of the squad carry `subgroup` and are left out of the 48 h check.
- **Pre-season (6 weeks, Mon + Thu):** two build-up weeks, test at the end of week 2, flying sprints from
  week 3 (peak 4 × 30 m), strength 6 → 4 → 3 reps, jumps 60 → 100, ease off and test in week 6.
- **Individual (8 weeks, sprint Mon/Thu, gym Tue/Fri):** build-up weeks 1–2, test week 3, flying sprints
  lengthen 10 → 15 → 20 → 30 m, ease off week 7, test week 8.

**Gym the day before sprints (standard week):** Haugen 2019 notes heavy lifting can blunt sprint speed for a
day or two. The MD-3 block says: if speed is down after MD-4 gym, move the gym to after the MD-3 session.
(The first version put sprints first on MD-4; changed 2026-11-13 to match the coach's week models.)

### Rules in every plan (`SPEED_SAFETY`)

- More than `LONG_GAP_DAYS` (21) since a run at 90% of top speed → two build-up sessions at 80–90% first
  (same rule as the "Top speed due" flag).
- Sprint fresh, early, and stop when speed drops.
- At least 48 h between top-speed sessions; a match counts as one (tested by `topSpeedGaps`).
- Injury wording is association only: regular near-top-speed running is associated with fewer hamstring
  injuries, a sudden jump after a long gap, or too much, with more (Malone 2017; Buchheit 2023;
  Gómez-Piqueras 2024 — whose title says "prevent"; we don't).
- Non-starters need extra sprints (after the match or MD+1/MD+2); keep braking low on a speed day near the
  match (Gómez-Piqueras 2024, one club's practice).

## Tests (what they guard)

Every method has both languages and a sourced finding; every block's method exists; only "best"/"some"
methods carry a top-speed run; ≤150 m flat out per session; top-speed sessions ≥2 days apart including the
match and the week wrap (each in-season version on its own, subgroups excluded); flying sprints labelled
"some"; no "prevent / predict / cause" wording.

## Not done (follow-ups)

- Plans are read-and-print only: not wired into the week planner, PT plan builder or player app.
- Possible: show in HSR Intelligence what share of a player's sprints are above 85% and 95% of their own top
  speed — as a description, not a target.
- The flying-sprint advice is still written separately in `trainingPrescriptions.ts`, `developmentLevers.ts`,
  `physicalAssessment/recommend.ts` and `robustness/catalog.ts` with different numbers.
