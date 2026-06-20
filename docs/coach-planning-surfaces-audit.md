# Coach planning & analysis surfaces — IA audit

> **TL;DR (IS):** Engin tvö flöt segja nákvæmlega það sama, en það eru tvær
> skörunar-þyrpingar: (1) þrír fletir akkera í *leik-kröfu* á ólíkum tíma
> (Pre-session = í dag, Progressive overload = yfir vikur, Train like you Play =
> afturvirkt audit), og (2) tveir fletir eru „eftir MD-degi" með ólík viðmið
> (MD comparison vs eigin saga; TLYP-vikuskipulag vs leik-krafa). Sterkasti
> sameina/merkja-kandídatinn er **Progressive overload** (tímalengd-útgáfan af
> Pre-session, þrengsti use-case). Audit-only — engar breytingar gerðar.

Scope: the coach **Team Planning** group + the two new analysis pages
(Position Comparison, Train like you Play). Descriptions below are taken from
the code, not assumed.

---

## 1. Surface inventory (what each actually does)

| Surface | Route | Core question | When | Reference / data |
|---|---|---|---|---|
| **Pre-session report** | `/coach/load-plan` | What should today's load be? | Before a session | Per-KPI targets **anchored to match demand** + ACWR + readiness modifier; per-player targets/flags. PDF. |
| **Post-training report** | `/coach/post-training` | Did we hit the plan? | After a session | Pre-session **PLAN diffed vs ACTUAL** session GPS; variance per KPI, team + per player. |
| **Progressive overload** | `/coach/progressive-overload` | Safe multi-week ramp up to match demand | Build phase (pre-season / RTP) | Week-by-week ramp per KPI, **ACWR-capped, ceilinged at match demand**; per-player build summary. |
| **MD comparison** | `/coach?tab=md` | Is this MD-2 session like our usual MD-2s? | During/after a session | Session vs **historical rolling avg of the same MD-day** → Z-score / STEN (1–10) per metric per player. Has a planning mode too. |
| **Train like you Play** | `/coach/train-like-you-play` | Has training reached match demand? (exposure gap) | Retrospective audit | Best training (top-3) **per-90 vs match demand** on FMP/IMA; microcycle by MD-day; position-specific. |
| **Position comparison** | `/coach/position-comparison` | How do positions differ in movement + style? | Descriptive | Per-90 GPS+IMA by position group + rule-based playing-style archetype. |
| **Session builder** | `/coach?tab=drills` | Build a session / drills | Construction | Drill/session assembly. |
| **Week setup** | `/coach/week-setup` | Define the week's matches/MD-days | Setup | Match schedule input (feeds MD-day resolution everywhere). |
| **Match minutes** | `/coach/match-minutes` | Log minutes played | Data entry | Feeds match demand + recovery + TLYP. |

---

## 2. Overlap analysis

Nothing is a literal duplicate. Two clusters share an axis:

### Cluster A — anchored to **match demand** (3 surfaces, different time horizon)
`Pre-session (today)` → `Progressive overload (over weeks)` → `Train like you Play (retrospective audit)`

- This is a coherent **plan → build → audit** triad, **not redundant**.
- **CONFIRMED divergence** (verified in code, 2026-06): the definitions differ.
  | | Pre-session / Progressive overload | Train like you Play |
  |---|---|---|
  | source | `loadTargets.ts` (`match_demand` mode) | `train-like-you-play/route.ts` |
  | min minutes | **≥75** (full-game filter) | **≥20** (any meaningful appearance) |
  | window | **120-day rolling** | **calendar season** |
  | grouping | squad average (template) | **per-player + position group** |
  So the same player can see a different "match demand" on TLYP than the
  pre-session engine uses. TLYP's ≥20-min + per-90 can *overstate* demand for
  cameo-heavy players (a 20-min burst extrapolated to 90). Coverage at ≥75:
  15 players with GPS (vs ~19 at ≥20).
- **Done now (safe, no number change):** TLYP footer now states its
  match-demand basis and notes the engine uses ≥75-min full games, so the
  difference is transparent rather than hidden.
- **Open decision (yours — changes numbers/coverage):** unify on one
  match-demand definition. Aligning TLYP to the engine's ≥75-min full-game basis
  is the most representative, but drops ~4 cameo-only players to the
  position-norm baseline. Not done unilaterally because it shifts the gap
  numbers on a surface you're still reviewing.

### Cluster B — organised **by MD-day** (2 surfaces, different reference) — real confusion risk
- **MD comparison:** today's session vs the team's **own historical norm** for
  that MD-day (Z/STEN). Answers *"is this MD-2 normal for us?"*
- **TLYP microcycle:** average training intensity as **% of match demand** per
  MD-day. Answers *"is MD-3 a high day / is MD-1 a taper?"*
- Both live "by MD-day" with different denominators → a coach could conflate
  them. **Done now (safe):** both relabelled — MD comparison subtitle now says
  "vs your norm — not match demand (see Train like you Play for vs match
  demand)"; the TLYP microcycle is titled "by MD-day (% of match demand)".
  Merging into one MD-day surface with a reference toggle remains an option.

### Clean, keep-as-is
- **Pre-session ↔ Post-training** = plan vs actual. Complementary, not
  redundant. Good pairing.
- **Position comparison ↔ TLYP** = descriptive (who moves how) vs prescriptive
  (training gap). Now linked (TLYP groups by position + position-norm baseline).

---

## 3. Redundancy / remove-or-merge candidates

- **Progressive overload** is the **temporal extension of Pre-session** (both
  target match demand; one for today, one as a multi-week ramp) and has the
  **narrowest use case** (build phase / return-to-play only). It is *not* the
  same tool, but it is the strongest consolidation candidate **if the weekly
  ramp isn't used in practice**. Options: (a) keep but relabel clearly as
  "Pre-season / RTP build", (b) fold the ramp into Week-setup/Pre-session,
  (c) leave as-is. **This is a usage call, not a code call.**
- No surface should be deleted on overlap grounds alone — each answers a
  distinct question.

---

## 4. Improvements (ranked)

1. **Single match-demand source of truth** shared by Pre-session, Progressive
   overload, and TLYP (consistency > anything else here).
2. **Make Pre-session + Progressive overload position-specific** (TLYP already
   is) — a CB and a winger shouldn't get the same per-KPI target.
3. **Disambiguate the two MD-day surfaces** (labels or merge).
4. **Present the planning group as a workflow**, not a flat list:
   `Setup (week) → Plan (pre-session) → Build (overload) → Do → Review
   (post-training) → Audit (TLYP) · Context (MD comparison, position comparison)`.

---

## 5. Bottom line

- **Remove:** nothing purely for overlap.
- **Merge/relabel candidate:** Progressive overload (pending real usage).
- **Highest-value fix:** unify the match-demand definition across the three
  match-anchored surfaces, then make them position-aware and cross-linked.
- **Quickest clarity win:** relabel the two MD-day surfaces.

*Audit only — no code changed.*
