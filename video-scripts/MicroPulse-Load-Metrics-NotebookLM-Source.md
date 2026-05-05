# MicroPulse Load Metrics — Educational Overview

> **NotebookLM Source Document**
> Designed for use as the primary source in NotebookLM to generate either
> an Audio Overview (podcast) or a Video Overview (animated slide narration).
>
> **Suggested prompt for Video Overview:**
> *"Create a 10-12 minute educational Video Overview that explains the
> five MicroPulse load metrics in order. For each metric, cover: what it
> measures, why it matters, a concrete example with numbers, and how
> MicroPulse uses it. Audience: football coaches, S&C staff, and sports
> medicine practitioners — assume domain knowledge but explain technical
> terms clearly. Tone: confident, evidence-based, practical."*

---

## About this document

MicroPulse is a performance intelligence platform for football clubs. It
tracks how hard each athlete worked, how recovered they are, and what the
training plan should look like tomorrow. This document covers the five
load metrics that drive every MicroPulse recommendation:

1. **Mechanical Load Index (MLI)** — the cost of stop-start work
2. **Metabolic Load Score** — the energy expenditure from variable-pace running
3. **Neuromuscular Burden Score** — the fast-twitch fatigue that lasts longer
4. **Composite Load** — one number for the day, the input to ACWR
5. **Load Intelligence** — a four-signal injury-risk early-warning layer

**Audience:** football head coaches, strength and conditioning coaches,
team doctors, physiotherapists, and performance analysts.

**Intended runtime if narrated end-to-end:** 12–15 minutes.

---

# Metric 1 — Mechanical Load Index

## Definition

Mechanical Load Index (MLI) is a composite measure of the explosive,
non-running mechanical work an athlete performed in a session. It
combines three things:

- Accelerations (with intensity weighting)
- Decelerations (with intensity weighting)
- Change-of-direction events

A maximum-effort sprint start counts more than a jog-to-walk transition.
A hard 90-degree cut counts more than a soft arc.

## Formula

```
MLI = Σ (Accelerations + Decelerations + CoD events) × intensity weight
```

## Why it matters

A player can run six kilometres in a session and walk off feeling fresh.
Another player runs the same six kilometres and is wrecked the next
morning. Total distance does not explain that difference. Mechanical Load
Index does.

Sports-science research consistently shows that **eccentric** mechanical
work — the braking, the cutting, the landing — is the strongest predictor
of soft-tissue and joint injury. Quads, patellar tendon, ACL, calves,
ankles — and hamstrings on the *sprint* side, not the braking side. Not
how far you ran. How hard you stopped.

A coach who only sees total distance will undercook recovery for the
press-heavy midfielder and overcook it for the centre-back doing steady
positioning runs. MLI fixes that.

## Concrete example

| Player              | Distance | Mechanical Load           | Outcome              |
|---------------------|---------:|---------------------------|----------------------|
| Steady runner       | 6,200 m  | low                       | fresh tomorrow       |
| Press-and-cut mid   | 6,200 m  | 1.4 SD above his baseline | wrecked next morning |

## How MicroPulse uses it

MicroPulse builds a personal MLI baseline for each athlete from their last
28 days of data. So a midfielder's normal might be 1,200. A goalkeeper's
normal might be 300. League averages are not used — every comparison is
the athlete versus themselves.

When today's MLI drifts more than one standard deviation above the
player's personal baseline, the player flags **yellow**. More than two
standard deviations: **red**. The coach sees this before planning the
next session.

## Takeaway

MLI turns "the player feels tired" into "the player did 1.4 standard
deviations more eccentric work than usual — and here's what to change
tomorrow."

---

# Metric 2 — Metabolic Load Score

## Definition

Metabolic Load Score measures how much energy an athlete actually spent
in a session — based on how often, and how sharply, their speed changed.
Originally formulated by Italian sports scientist Pietro di Prampero, the
model treats running with acceleration as equivalent to running uphill.
The harder you accelerate, the steeper the imaginary slope.

It is expressed in watts per kilogram of body weight — the same unit
used in cycling.

## Formula

```
Metabolic Load Score = energy expenditure derived from velocity changes,
                       integrated over time, expressed in W/kg
```

## Typical values

- Recovery / warm-up: 6–8 W/kg
- Standard training: 8–12 W/kg
- High-intensity match: 25+ W/kg

## Why it matters

A constant jog burns calories. A constant jog with eight sudden bursts
burns three times more — yet the stopwatch reads the same total time.
Average heart rate is also a poor measure of intensity in team sport
because heart rate lags effort by 30 seconds or more. Metabolic Load
Score doesn't lag. It captures every spike, every variable-pace nuance —
exactly the way football is actually played.

## Concrete example

Two 30-minute sessions for the same player:

| Session              | Avg speed | Distance | Metabolic Power |
|----------------------|----------:|---------:|----------------:|
| Steady jog           | 12 km/h   | 6.0 km   | 8.5 W/kg        |
| Variable-pace game   | 12 km/h   | 6.0 km   | 14.2 W/kg       |

Same average speed. Same total distance. Roughly 70% more energy spent in
the second session.

## How MicroPulse uses it

Per-athlete 28-day rolling baseline. A striker's normal is not compared
to a defender's normal — it's compared to their own normal. Drift above
one standard deviation flags yellow on the coach view.

This metric also feeds the **decoupling** computation: when an athlete's
metabolic cost rises while external load (distance, player load) stays
flat, that's an early warning of fatigue or sub-clinical illness, even
before the player feels off.

## Takeaway

Distance tells you how far. Metabolic Load Score tells you how
*expensive* it was. For variable-intensity sports, that's what determines
the recovery the next 24 hours need to deliver.

---

# Metric 3 — Neuromuscular Burden Score

## Definition

Neuromuscular Burden Score isolates the high-velocity, high-force actions
that fatigue the **nervous system** — not just the muscle fibres
themselves, but the brain's ability to recruit them. It combines:

- Maximum-effort sprints
- Peak accelerations
- Peak decelerations

Anything that demands the highest neural drive: explosive,
short-duration, all-out efforts.

## Scale

The score is normalised against the athlete's own personal peak history:

- 1.0 = a typical day for this athlete
- 2.0 = twice the neuromuscular demand of a typical day
- 3.0 = three times the demand — match-day intensity

## Why it matters

After a hard match, an athlete's heart rate variability normalises in
24–36 hours. Their subjective wellness scores normalise. They feel ready.
But their fast-twitch system — the part that fires the sprint, the cut,
the jump — can take 72 hours to fully recover.

If you do another high-intensity session before that recovery completes,
you don't just get suboptimal performance. You get an athlete sprinting
on tired neural circuits. **That's the moment hamstrings tear.**

Neuromuscular Burden Score is the metric that prevents that compounding
error.

## Concrete example — the recovery trap

| Day   | Activity                | Aerobic recovery | Neuromuscular recovery |
|-------|-------------------------|------------------|------------------------|
| Day 1 | Hard match              | 0%               | 0%                     |
| Day 2 | Light training, feels fine | 90%          | 40%                    |
| Day 3 | Plans high-intensity     | 100%             | 60% — **injury window** |

## How MicroPulse uses it

MicroPulse tracks Neuromuscular Burden across rolling 72-hour windows.
Even when today's training was light, the burden score keeps reading from
previous days. When it's still elevated, the coach sees a warning to
scale back high-intensity drills — even if the player feels fine.

## Takeaway

Neuromuscular Burden Score answers one question every elite coach asks:
"Can this player handle high-speed work today?" Distance and heart rate
can't answer that. The neuromuscular system can. Listen to it.

---

# Metric 4 — Composite Load

## Definition

Composite Load is the unifying number — a single index that combines the
three load systems above into one daily value.

## Formula

```
Composite Load = MLI × 0.35 + Metabolic Load × 0.35 + Neuromuscular × 0.30
```

The weighting reflects what sports-science research tells us about injury
risk and performance decrement. Mechanical and metabolic each contribute
35%; neuromuscular 30%.

## Scale

The result is scaled so that:

- 1.0 = a typical training day for this athlete
- 2.0 = a competitive match
- 0.5 = a recovery day

## Why it matters — ACWR

Composite Load isn't just a daily summary. It powers the most important
number in modern athlete monitoring: the **Acute-to-Chronic Workload
Ratio (ACWR)**.

The research, led by Tim Gabbett and replicated dozens of times since,
shows that **injury risk roughly doubles when an athlete's recent 7-day
load exceeds their preceding 4-week load by more than 50%.**

You can't compute that ratio meaningfully from raw distance — different
sessions have different intensities. You need a single,
intensity-weighted number. That's Composite Load.

## ACWR interpretation

| ACWR        | Status         | Meaning                                  |
|-------------|----------------|------------------------------------------|
| < 0.8       | Detraining     | Doing less than the body is prepared for |
| 0.8 – 1.3   | Sweet spot     | Building fitness safely                  |
| 1.3 – 1.5   | Caution        | Acute load running ahead of chronic      |
| > 1.5       | Danger         | Injury risk roughly doubles              |

## How MicroPulse uses it

Every player's Composite Load is computed nightly. Every player's 7-day
to 28-day ratio is tracked. When the ratio drifts into the danger zone,
that player's row turns red on the coach dashboard with a recommended
training modification (e.g. *"Reduce session volume by 30% · move sprint
work to Thursday"*).

The coach plans the week in five minutes. Not five hours.

## Takeaway

Composite Load is the answer to "how hard was today, really?" — and the
input to "what should tomorrow look like?" One number, three load
systems, every athlete, every day.

---

# Metric 5 — Load Intelligence (4 sub-metrics)

## Definition

Load Intelligence is a set of four advanced metrics derived from Catapult
GPS data. They are not raw counts. They are computed signals that tell
you **why** an athlete's body is loaded the way it is.

The four sub-metrics:

1. Decel Burden
2. Accel-to-Decel Ratio
3. High-Intensity Distance percentage trend (HID% trend)
4. Residual Decel

Each one answers a different question. Together they tell you whether an
athlete's load is the kind that builds fitness — or the kind that breaks
tissue.

## 5.1 — Decel Burden

**What it measures:** how many high-intensity deceleration events an
athlete performed — specifically, decelerations beyond 2 m/s².

**Why it matters:** deceleration is eccentric muscle action — the muscle
is lengthening while contracting. The most damaging contraction type for
soft tissue. Critically — and contrary to a common assumption — the
primary injury risk in decel is *not* the hamstring. McBurnie 2022 showed
quadriceps activation reaches 161% of MVC during the mid-eccentric foot
strike of a decel, while hamstring activation is *reduced* (−87% of peak
quad activation). That quad-dominant + hamstring-deficient pattern,
combined with sub-optimal trunk posture, increases anterior tibial
translation — the mechanism behind ACL, quadriceps, and patellar tendon
injury. Decel burden is more predictive of these knee-extensor and ACL
injuries than total distance, sprint count, or total deceleration count.

**Coach signal:** a sudden week-on-week spike is the single clearest
mechanical injury warning available from GPS data.

## 5.2 — Accel-to-Decel Ratio

**What it measures:** the ratio of acceleration count to deceleration
count over a session.

**Healthy range:** approximately 1.0 — for every burst forward, there's
a brake to follow.

**Warning sign:** when the ratio drops below 0.8, the athlete is
decelerating more than they're accelerating — usually because they're
being chased, scrambling defensively, or reacting to lost possession.
Reactive decelerations are far less controlled, and far more
injury-prone, than planned ones.

## 5.3 — HID% Trend

**What it measures:** the percentage of an athlete's total distance
covered above their high-speed threshold (typically 19.8 km/h), tracked
as a trend over four weeks.

**Why it matters:** a rising HID% with stable total distance means the
same hours of training are loading the body differently. The athlete is
doing more "explosive" work, which loads tendons and connective tissue
differently than steady running — and demands more recovery.

**Coach signal:** silent intensity creep. Volume looks safe; intensity
isn't.

## 5.4 — Residual Decel

**What it measures:** the gap between how much an athlete decelerated and
how much we'd predict them to decelerate based on their accelerations and
total distance.

**Formula:**

```
Residual Decel = Actual Decel − Predicted Decel (from Accel + Distance)
```

**Why it matters:** if a player's actual deceleration count is much
higher than predicted, the difference is "residual" — extra eccentric
work the model can't explain by normal running mechanics. In MicroPulse
data, residual decel has been the strongest single-session correlate of
next-day soft-tissue complaints.

## How MicroPulse uses Load Intelligence

The four metrics are computed nightly from Catapult exports. They appear
on each player card as small badges:

| Metric          | Andri (Apr 22) | Flag    |
|-----------------|---------------:|---------|
| Decel burden    | +0.4 SD        | Green   |
| Accel:Decel     | 0.78           | Yellow  |
| HID% trend      | +1.1 SD        | Yellow  |
| Residual decel  | +1.8 SD        | Red     |

The dominant signal — the most concerning of the four — is highlighted
with a plain-language explanation:

> *"Residual decel +1.8 SD — eccentric overload — consider eccentric
> strength reduction tomorrow."*

Coach gets a sentence, not a spreadsheet.

## Takeaway

Together, these four metrics give the coach what raw GPS data never
could: the **meaning** behind the numbers. Not "how many decelerations"
but "how concerning are they given everything else this player did
today?" That's Load Intelligence.

---

# Glossary of terms

- **ACWR** — Acute-to-Chronic Workload Ratio. The ratio of a 7-day load
  average to a 28-day load average. The single best-validated single
  number for injury-risk monitoring in team sport.
- **Eccentric contraction** — a muscle contraction in which the muscle
  is actively producing force *while lengthening*. Braking, decelerating,
  and the lowering phase of any squat or jump are eccentric. Most
  damaging contraction type for soft tissue.
- **GPS / GNSS** — global positioning systems used in athlete-monitoring
  pods (Catapult, WIMU, STATSports, Polar Team Pro). Modern GPS sample
  rates of 10–25 Hz allow detection of accelerations, decelerations, and
  speed changes with sub-second precision.
- **HID — High-Intensity Distance** — distance covered above a defined
  high-speed threshold (typically 19.8 km/h in football). A core marker
  of physical-performance intensity.
- **HSR — High-Speed Running** — synonymous with HID in most providers.
- **Personal baseline** — a per-athlete rolling 28-day average and standard
  deviation used to define what's "normal" for that specific athlete.
  MicroPulse uses these instead of league averages or population norms.
- **PlayerLoad** — a Catapult-proprietary metric capturing total
  acceleration in three axes; widely used as a single-number total load
  proxy.
- **RPE — Rating of Perceived Exertion** — the player's self-reported
  effort, scored 1–10. Multiplied by session duration to compute "session
  load" (Foster's sRPE method).
- **SD-band** — Standard-deviation band around an athlete's personal
  baseline. ±1 SD = yellow zone; ±2 SD = red zone, per Robertson 2017.
- **Soft-tissue injury** — muscle, tendon, or ligament injury (as
  distinct from impact / contact injuries). Most preventable injury
  category in team sport via load management.

---

# Reference list (for NotebookLM grounding)

- Gabbett TJ. 2016. *The training–injury prevention paradox: should
  athletes be training smarter and harder?* British Journal of Sports
  Medicine.
- Hewit J, Cronin J, Hume P. 2011. *Asymmetry in multi-directional
  jumping tasks.* Physical Therapy in Sport.
- Robertson S, Bartlett JD, Gastin PB. 2017. *Red, amber, or green?
  Athlete monitoring in team sport: the need for decision-support
  systems.* IJSPP.
- Vanrenterghem J et al. 2017. *Training load monitoring in team sports:
  a novel framework separating physiological and biomechanical
  load–adaptation pathways.* Sports Medicine.
- di Prampero PE et al. 2005. *Sprint running: a new energetic approach.*
  Journal of Experimental Biology.
- Halson SL. 2014. *Monitoring training load to understand fatigue in
  athletes.* Sports Medicine.

---

*MicroPulse — performance intelligence for football clubs.*
