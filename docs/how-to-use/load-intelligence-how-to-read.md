# How to read the Load Intelligence page

Source-of-truth content for the Load Intelligence page — grounded in the live code
(`lib/micropulse/externalLoad/signals.ts`, `components/coach/GpsLoadIntelligence.tsx`). This is the
detailed, column-by-column "how to read it", written so the *same* content feeds both the in-app
"How to read this page" drawer and any exported PDF/deck. Bilingual EN / IS.

**The differentiator — read this first.** Every load app on the market shows you *what* the numbers are.
Load Intelligence is built to answer *why* it flagged a player, *what to do*, and *how much to trust it*.
So this guide is deliberately not a data dictionary. For every column it gives four layers:

1. **What it is** — plain language, no jargon.
2. **How to read the badge** — the exact bands and cut-offs the page uses.
3. **The explainability read** — the "why", the counterfactual ("if X had been Y → clear"), and the
   confidence (is there enough data to trust this?).
4. **The evidence** — the paper the signal is built on.

Keep the layered discipline: glance (verdict) → the plain "why" → the column detail. Don't jump a coach
straight into the raw table.

---

## The page in one glance (the ~5-second read)

At the top the page states the squad's load in one sentence and names who's in the high band, e.g.
*"GPS load is in a normal range across the squad today."* or *"3 at high GPS load today, 2 elevated —
Name, Name, Name."* That headline is the verdict; everything below it is the drill-down.

- **IS:** „GPS-álag er í eðlilegu bili hjá öllum í dag." / „3 í háu GPS-álagi í dag, 2 yfir viðmiði — …".

Under the headline sit the **cohort alerts** (the plain "why" — clustered issues like high decel burden,
HID% fatigue, eccentric-dominant + decel, accumulated 3-day decel), then the **six KPI tiles**
(High load / Elevated load / Decel burden↑ / Eccentric dom. / HID% fatigue / Residual decel), and only
then the **per-player signal table**. That order *is* the layered read — verdict → why → detail.

Everything is computed **from the player's own 28-day Catapult baseline** — the squad is never compared to
a generic norm, only each player to himself. And a blank cell is **"—" (no data), never 0** — if a player
didn't wear the pod, or is on a Catapult tier that doesn't expose decel bands, the signal is withheld,
not scored as zero.

---

## Column 1 — Load (overall load state)

**What it is.** The day's overall external-load verdict for the player, versus his own 28-day baseline.
It's a weighted blend of five GPS signals: high-intensity running (weight 0.34), deceleration (0.26),
density/stress (0.20), max-velocity exposure (0.14) and sprint/band-6 exposure (0.06).
*IS: Heildarálagsmat dagsins miðað við eigin 28-daga baseline, vegið úr fimm GPS-merkjum.*

**How to read the badge.**

| Badge | Meaning |
|---|---|
| `NORMAL` (green) | At or below the player's usual load |
| `ELEVATED` (amber) | Above his usual band |
| `HIGH` (red) | Well above his usual band |
| `—` | No pod data today → no verdict |

**The explainability read.** The badge is never the whole story — open the player to see *which* of the
five signals pushed him up (e.g. "decel + density elevated, running normal"). Counterfactual: a player
reads `ELEVATED` because two sub-signals crossed their threshold; if either had stayed within his norm
he'd read `NORMAL`. Confidence depends on a mature baseline — a player with only a few days of Catapult
history has a thin baseline, so treat an early-season `HIGH` with caution.

**Evidence.** Acute-vs-chronic external-load monitoring (Gabbett 2016; Bowen 2017). The recovery decay
applied to yesterday's spikes (D+1 = 0.55, D+2 = 0.30, D+3 = 0.15 of the original spike) reflects the
known neuromuscular-fatigue time-course.

---

## Column 2 — Decel Burden

**What it is.** How much *braking* load landed on the player's muscles. Built to weight the damaging
high-intensity decelerations heaviest: 65% high-intensity decel efforts (Catapult Band 2–3, < −3 m/s²)
+ 35% total decel efforts, each versus the 28-day baseline.
*IS: Hversu mikið hemlunar-álag lendir á vöðvum — 65% há-ákefðar decelerations + 35% heildar, vs baseline.*

**How to read the badge** (score is 0–1):

| Badge | Score |
|---|---|
| `low` (green) | < 0.20 |
| `moderate` (grey) | 0.20 – 0.45 |
| `elevated` (amber) | 0.45 – 0.70 |
| `high` (red) | ≥ 0.70 |

**The explainability read.** Deceleration is the eccentric, tissue-damaging side of load — it's why this
is a *burden* column, not just a count. If a player is `high`, the cohort alert says plainly: *"avoid
COD-heavy drills"*. Counterfactual: `high` (≥0.70) drops to `elevated` if his high-intensity braking
comes back toward his norm — recomputed live, not a fixed number. Confidence: needs the Band 2–3 decel
feed, which lower-tier Catapult plans don't expose — no feed → "—", never 0.

**Evidence.** Deceleration as the dominant eccentric braking load; high-intensity decel efforts carry the
most tissue cost (Harper & Kiely 2018; McBurnie 2022).

---

## Column 3 — Acc:Dec (acceleration : deceleration ratio, ECC / BAL / CON)

**What it is.** The balance between high-intensity accelerations and decelerations (Band 2–3 efforts,
> 3 m/s² accel vs < −3 m/s² decel). It tells you *what kind* of load the session was, and therefore
*which tissues* are most exposed.
*IS: Jafnvægi há-ákefðar hröðunar vs hemlunar — segir hvaða vefir eru mest undir álagi.*

**How to read the badge.**

| Badge | Ratio | What it flags |
|---|---|---|
| `ECC` eccentric-dominant (orange) | < 0.7 | Heavy braking → **ACL, quadriceps, patellar tendon** risk |
| `BAL` balanced (grey) | 0.7 – 1.3 | Even acceleration/deceleration mix |
| `CON` concentric-dominant (blue) | > 1.3 | Heavy acceleration → **hamstring, glute** risk |

**The explainability read.** This is the clearest example of *why > what*: the same "high load" means a
different injury conversation depending on direction. `ECC` matters because peak quadriceps activation
reaches **161% of MVC during deceleration** — the knee-extensor/patellar-tendon/ACL load lives in
braking. `CON` matters because the hamstring works hardest in the late-swing phase of sprinting. The
counterfactual is directional, not just a number: an `ECC` player would read `BAL` if his braking and
accelerating efforts were more even. Confidence: needs both Band 2–3 accel and decel feeds; if one side
is zero the code floors the denominator (0.5) to avoid a divide-by-zero, so read very low counts as
directional-hint, not gospel.

**Evidence.** McBurnie et al. 2022 (deceleration mechanics, 161% MVC quad activation); hamstring
late-swing sprint mechanics.

---

## Column 4 — HID% (high-intensity distance %, with a fatigue trend arrow)

**What it is.** The share of the player's running that was high-speed: (Band 5 + Band 6 distance) ÷ total
distance. Band 5 ≈ 19.8–25.2 km/h, Band 6 > 25.2 km/h. The little arrow next to it is a *fatigue trend*,
not just today's value.
*IS: Hlutfall háhraða-vegalengdar af heildar — örin sýnir þreytutrend, ekki bara daginn í dag.*

**How to read the arrow** (today vs the player's 7-day rolling HID% average):

| Arrow | Change | Read |
|---|---|---|
| ↑ (green) | HID% up ≥10% | Reaching high speeds more than usual |
| → (grey) | within ±10% | Stable |
| ↓ (amber) | down ≥10% | Watch |
| ↓↓ (red) | down ≥20% | Fatigue flag |

**The explainability read.** The insight is in the *combination*, and the page states it: a **fatigue
flag fires only when HID% drops ≥20% AND total distance is stable** — i.e. he's covering the same ground
but can't reach top speeds, the signature of neuromuscular fatigue. A HID% drop on a light day is not a
flag (distance fell too), which is exactly why the arrow is contextual, not absolute. Counterfactual: the
flag clears if he either reaches his usual high-speed share again, or the low HID% is explained by a
genuinely lighter session. Confidence: needs ≥ a usable 7-day baseline (the code ignores it when the
7-day average HID% is < 0.05, i.e. too little high-speed history to compare).

**Evidence.** Harper et al. 2019 (declining high-intensity output as a neuromuscular-fatigue marker).

---

## Column 5 — Res. Decel (residual / 3-day accumulated deceleration)

**What it is.** Not today alone — the *accumulation* of braking load over three days, weighted toward the
most recent: today ×1.0, yesterday ×0.6, two days ago ×0.3, scaled to a 0–100+ index. It answers "is he
getting enough recovery *between* sessions?".
*IS: Uppsafnað hemlunar-álag síðustu 3 daga (í dag mest vegið) — fær hann nægan bata á milli æfinga?*

**How to read the badge.**

| Badge | Index |
|---|---|
| `NORMAL` (green) | < 60 |
| `ELEVATED` (grey) | 60 – 100 |
| `CAUTION` (amber) | 100 – 135 |
| `HIGH` (red) | ≥ 135 |

**The explainability read.** A player can look fine *today* and still be in `CAUTION` because braking
load stacked up across the microcycle — this column is what catches the "third hard day in a row" that a
single-day view misses. The cohort alert names it plainly: *"accumulated decel load (3 days) — recovery
priority"*. Counterfactual: `CAUTION` eases to `ELEVATED`/`NORMAL` after a genuinely low-braking day.
Confidence: needs decel data across the three days; missing days reduce the weighted inputs, so a partial
window is a weaker signal (and no data → "—", not 0).

**Evidence.** Residual-load / recovery-monitoring pattern (mirrors the residual MLI method); eccentric
braking load needs inter-session recovery (Harper & Kiely 2018).

---

## Column 6 — PL Spike (PlayerLoad spike)

**What it is.** Today's total PlayerLoad divided by the player's 28-day average — a single "how big was
today vs his normal" multiplier for overall mechanical volume.
*IS: Player Load dagsins deilt með 28-daga meðaltali — hversu stór var dagurinn miðað við venjulegt.*

**How to read the value.**

| Colour | Value | Meaning |
|---|---|---|
| grey | < 1.15× | Normal volume |
| amber | 1.15 – 1.5× | Elevated |
| red | ≥ 1.5× | High spike |

**The explainability read.** This is the blunt "total volume" check that sits behind the more specific
decel/HID columns — a red PL Spike says the *whole* session was big; the other columns say *what kind* of
big. Read them together: PL Spike `1.6×` + `ECC` + `high` decel burden is a very different day from
`1.6×` with balanced, low-decel work. Counterfactual: a 1.5× day would read elevated (amber) rather than
high if volume came in nearer his 28-day norm. Confidence: needs a mature 28-day PlayerLoad baseline;
early-season the denominator is unstable, so treat spikes as provisional.

**Evidence.** Acute:chronic PlayerLoad spike monitoring (Gabbett 2016; the 28-day chronic reference).

---

## The KPI tiles and cohort alerts (the plain "why" layer)

The six tiles count how many players sit in each risk cluster (High load, Elevated load, Decel burden↑,
Eccentric dom., HID% fatigue, Residual decel⚠). The cohort alerts turn those counts into plain-language
actions with named players:

- **High decel burden** → *avoid COD-heavy drills*.
- **HID% fatigue trend** → *lower high-speed work despite stable distance*.
- **Eccentric-dominant + elevated decel** → *ACL / quadriceps / patellar tendon risk*.
- **Accumulated decel (3 days)** → *recovery priority*.

This is the layer a head coach should live in — it's the "why" and the "what to do" without opening the
raw table. The table is the S&C drill-down.

---

## What to remember

- Everything is **the player vs his own 28-day self**, never a generic norm.
- **"—" means no data, never zero** — a missing pod or a lower Catapult tier withholds the signal.
- The **direction** matters as much as the size: `ECC` vs `CON` changes the injury conversation; a HID%
  drop only flags *with stable distance*; residual decel catches accumulation a single day hides.
- Read top-down: **verdict headline → cohort alerts → tiles → table.** Don't start in the table.
- Every flag has a **paper behind it** (McBurnie 2022, Harper 2019, Harper & Kiely 2018, Gabbett 2016) —
  that provenance is the point.
