# Ju 2022 tactical variables — derivation mapping (peakPeriodContext)

Can we "find" the Ju Table-1 variables (Run in Behind, Recovery Run, Close Down/Press …)? **They are not a
field in any feed** — in the paper they were **hand-coded from synchronised video** (analyst agreement ~92%,
κ≈0.81). So the system must **derive/approximate** them by fusing, inside each peak window:
- **StatsBomb events** (on-ball actions: carry, pass received, pressure, interception, shot) — feed (1), still to ingest.
- **StatsBomb 360** freeze-frames (teammate/opponent positions) — optional, unlocks the *relational* ones.
- **Catapult peak-window movement** (HSR/sprint, accel/decel, direction, pitch displacement) — feed (2),
  shipped (`player_peak_window` / `parseCatapultCtr`, ad1d641).

Honesty rule (manifesto): label these **"derived (approximation)"**, cite Ju 2022 as the taxonomy, and carry a
**confidence per variable**. They're good for the directional read ("his peak is driven by attacking runs vs
defensive recovery"), not a 1:1 reproduction of hand-coding. Rules decide, AI only explains.

## Derivation per variable (source · rule · confidence · needs-360?)

### In Possession
| Ju variable | Derive from | Rule (heuristic) | Conf | 360? |
|---|---|---|---|---|
| **Run with Ball** | StatsBomb **Carry/Dribble** events | direct event in window | **high** | no |
| **Break into Box** | SB pass-received location + GPS run | receives ball in opp. box / run ends in box while in possession | med-high | no |
| **Move to Receive/Exploit Space** | SB "Ball Receipt" + off-ball GPS move | receives after a move to space; pass received not under pressure | med | no |
| **Run in Behind / Penetrate** | GPS high-speed forward run + SB through-ball | sprint into space behind last line, ball played beyond | med | helps |
| **Push up Pitch** | GPS forward displacement + team-possession phase | forward move to squeeze/hold line while team in possession (no ball) | low-med | helps |
| **Support Play** | GPS move + transition phase | move behind/level during a fast transition (possession just won) | low-med | no |
| **Over / Underlap** | **SB 360** relative positions | runs from behind → ahead of ball carrier (wide) | med | **yes (needs 360)** |

### Out of Possession
| Ju variable | Derive from | Rule | Conf | 360? |
|---|---|---|---|---|
| **Close Down / Press** | StatsBomb **Pressure** event + GPS accel-to-ball | pressure event / accel toward ball carrier out of possession | **high** | no |
| **Interception** | StatsBomb **Interception** event | direct event | **high** | no |
| **Recovery Run** | GPS high-speed run toward **own** goal, out of possession | sprint goal-side to recover position | med-high | no |
| **Covering** | **SB 360** + GPS | move to cover space/opponent while remaining goal-side | med | **yes (needs 360)** |

### Unclassifiable
| **Other** | — | window movement/effort not matched to any rule above | n/a | — |

## What is computable *now* vs later
- **Now (StatsBomb events + Catapult window):** Run with Ball, Close Down/Press, Interception (direct);
  Recovery Run, Break into Box, Run in Behind, Move to Receive, Push up Pitch, Support Play (movement+phase
  heuristics). → enough for the flagship stacked bar with an "Other" bucket + per-bar confidence.
- **Later (StatsBomb 360):** Over/Underlap, Covering (relational). The match page has **"View Match in 360"** →
  360 data exists for these games, so this is ingest, not a data gap. Add as a sharpening pass.

## Engine wiring (peakPeriodContext — already built)
1. Align each event to the peak window: `event_second_from_KO` vs `window_start` (convert Catapult
   `window_start` → seconds-from-kickoff; SB events carry minute+second). This is the remaining feed-(1) task.
2. For each in-window action, run the rules above → a Ju category (+ `derived:true`, confidence, the signal
   used). Aggregate → the stacked bar (Recovery Run / Support Play / Run-in-behind …) like the paper's Fig 2–6.
3. Verdict (plain): "his peak minute is driven by attacking penetration" / "…by defensive recovery runs" →
   details = the per-category breakdown + rule + confidence + Ju citation.

## Guardrails
- **Derived/approximation** labelling on every category; confidence per bar (event-direct = high, heuristic =
  med, 360-needed-but-absent = omitted, not guessed).
- Descriptive/advisory — never touches readiness colour or the daily decision.
- Provenance: which feeds present (events? 360? window), HSR threshold, as-of date.

## Next steps (in order)
1. **Ingest StatsBomb full events** for ≥1 Breiðablik match (the current blocker — see StatsBomb export brief).
2. Convert Catapult `window_start` → seconds-from-kickoff; run alignment.
3. Implement the derivation rules above in `peakPeriodContext`; ship the stacked bar with confidence + "derived".
4. (Sharpen) Ingest StatsBomb 360 → add Over/Underlap + Covering.

Ref: `docs/tasks/peak-period-context-spec.md`, `catapult-ctr-peak-window-ingest.md`,
`football-peak-period-context-vs-research.md` (Ju 2022 = taxonomy + Table-2 benchmark).
