# MicroPulse — Honest Product Audit (June 2026)

Scope: the whole product, both **Pro** (club/coach, Catapult GPS) and **Lite/PT** (trainer +
athlete, sRPE-driven). Four lenses, as requested: **Business & positioning · Sport-science
credibility · Product & UX · Technical & architecture.** Written to be useful, not flattering.

> **How this was produced.** Every claim below is grounded in the actual codebase (paths cited).
> A few things I *cannot* see from code and have flagged explicitly: real customer/usage numbers,
> live Supabase RLS policies, and which features are actually adopted. Where a recommendation
> depends on those, I say "verify with your data."

---

## 0. Headline verdict

**MicroPulse is impressively deep and unusually principled — and it is over-built for its stage.**
The single biggest risk is **not** a missing feature; it is **surface sprawl and the gap between
the manifesto and the code.** You have 242 API routes, 47 coach pages, 230 components, 555 lib
files and an 8-section coach sidebar — a footprint you'd expect from a 30-person team with
thousands of clubs. The manifesto (explainability-first, one verdict source, cite everything,
show confidence) is genuinely excellent and is your moat. But the places where the code drifts
from it — uncited thresholds, false precision, an untested decision engine — are exactly the
credibility-sensitive ones.

**The work for the next quarter is subtraction and hardening, not addition.** Consolidate the
redundant analytics surfaces, close the science-honesty gaps (cheap, and *on-brand*), and put a
test harness around the decision logic. Do that and MicroPulse goes from "powerful but sprawling"
to "the credible, explainable layer on top of the GPS clubs already own" — which is a category
nobody else owns.

**What you must not lose** (the genuinely strong core):
- The **explainability-first manifesto** and the **single canonical verdict** discipline — verified
  compliant in code (`v_coach_readiness_today_v8.final_color` is the sole verdict source; the
  trajectory/decision tables are correctly never surfaced as the colour).
- The **indoor IMU / FMP** angle — load monitoring that works in a hall is a real differentiator.
- The **sRPE + readiness engine** shared cleanly across Pro and Lite.
- The **breadth of evidence-based S&C programming** (LV profiling, velocity-based training,
  triphasic, plyometric dosing) — most monitoring tools have nothing like it.
- The **Iceland/KSÍ beachhead** — a smart, defensible wedge.

---

## 1. Business & positioning

### What's working
- **Positioning is correct and differentiated.** "Know who's ready — and why … built on the GPS
  data you already own … every verdict explained in plain language and traceable to the data"
  (`src/app/home/page.tsx`). That is the right wedge: Catapult OpenField is data-rich and
  decision-poor; Smartabase/VALD are heavy and generic. *Explainable decisions on top of existing
  hardware* is a gap you can own.
- **Two honest products** under one roof: Pro (club, Catapult) and Lite/PT (trainer, sRPE). The
  shared spine (readiness, ACWR, sRPE, PRs) is consistent across both — good.

### What's risky
- **Four pricing tiers is too many for this stage** (`src/app/pricing/page.tsx`: Free €0 / Lite €129 /
  Pro €349 / Elite €1250, plus a €70 line). The gating logic is intricate and *invisible to the
  user* — e.g. Lite teams simply don't see Decel/IMA/Indoor pages, with no explanation of why or
  what unlocks them (`CoachSidebar.tsx` `LITE_HIDDEN_HREFS` / `FULL_HIDDEN_HREFS`). Collapse to a
  clear story: **two products, ~two paid tiers each**, and make every locked surface say "this needs
  Plan X — here's what it gives you."
- **The build-vs-Catapult boundary is blurred.** A large share of the coach surface (Load
  Intelligence, Decel, HSR, IMA, Indoor Load, Position Comparison, Player Game Report) is
  *re-presenting Catapult's own metrics*. That is undifferentiated work you can lose on. Your
  defensible layer is the **verdict, the explanation, the indoor mode, the RPE engine, the
  week-planning/periodization**. Spend there; stop competing with Catapult on raw dashboards.
- **Over-fit to one club.** Several thresholds are effectively tuned to Breiðablik's cohort (see
  §2). For a product sold to other clubs, "these are our numbers from one team" is a weak answer.
  Make thresholds explicitly **per-team tunable** and say so — it's both more honest and more sellable.
- **The €1250 "Elite" tier needs a narrative.** What is the buyer and the outcome? If it's
  LV-profiling / VBT for serious S&C departments, name that.

### Recommendations
1. Simplify to a **two-product, two-tier** pricing page; make gating self-explanatory.
2. Write a one-page **"why MicroPulse and not just Catapult"** internally, and let it drive what you
   build (the verdict/explanation/indoor/RPE layer) and what you *stop* building (parallel
   analytics dashboards).
3. Add **usage analytics** (see §4) so future cut/keep decisions are data-driven, not guesses.

---

## 2. Sport-science credibility

This is where the manifesto ("every signal carries a paper citation; show confidence") and the
code most visibly diverge — and it's the cheapest, highest-leverage thing to fix because the fix
*is* the brand.

### The biggest exposure points (ranked)

1. **ACWR presented as settled (0.8–1.3 "sweet spot").**
   `src/lib/client/loadQuadrant.ts`, `imaRunningLoad.ts`. ACWR has been heavily critiqued since
   ~2019 (Impellizzeri, Lolli, Wang). You've reframed copy away from injury-prediction in
   `docs/unfamiliar-load.md`, but the **hard bands remain** and the critique isn't surfaced. A
   knowledgeable S&C coach *will* push on this. Fix: label it "a common workload reference, not an
   injury model," cite the critique, keep the band as a tunable reference.

2. **Heavy-lift cap "25 sets/week ≥80% 1RM" — no real source.**
   `src/lib/trainer/loadIntelligence.ts`. Cited as "Pareja-Blanco 2017 / Schoenfeld 2017 synthesis,"
   but neither pins that number (Pareja-Blanco is intra-session velocity loss; Schoenfeld is
   hypertrophy volume). Either cite the actual basis, call it an internal tunable default, or drop it.

3. **PR forecast "next PR in ~X weeks" — false precision.**
   `src/lib/trainer/loadIntelligence.ts` fits a line to ≥4 noisy e1RM points and reports `eta_weeks`
   to a decimal. e1RM SEE alone is ±2–3 kg. Show **trend slope** ("averaging +0.4 kg/week") or a
   confidence band — not a date.

4. **Velocity-loss match-day caps (MD1 5% / MD2 10% / MD3 15% …) — uncited.**
   `src/lib/micropulse/trainingGraph/schema.ts`. Intuitive taper logic, zero citation. Mark as a
   tunable team policy.

5. **Game-model demand weights — arbitrary.**
   `src/lib/micropulse/trainingRead/catalogue.ts` (`MODEL_DEMAND`). The per-quality citations are on
   the *quality*, not on the demand weights (e.g. high_press → repeated_sprint 1.0). They read like
   a sensible coach's mental model but aren't validated. Present as a configurable starting profile.

6. **Movement-signature z-thresholds (|z| ≥ 1.5 SD).**
   `src/lib/micropulse/movementSignature/`. Defensible but uncited as a threshold; Robertson 2017
   supports the *method* (personal z-scoring), not the cutoff. State it as a tuning parameter.

### What's solid (keep, and lean on it)
- e1RM formulas (Epley/Brzycki/Lombardi, RIR-aware with an RPE≥9 evidence gate) —
  `src/lib/client/oneRepMaxFormulas.ts`. Conservative and sound.
- LV-profile MVT thresholds (González-Badillo 2010; Banyard 2017) — `src/lib/lvProfile/`.
- **Confidence gating** on thin data (`MIN_DAYS` 8–14, "high/moderate/low" coverage) — this is the
  manifesto working as intended. Keep it; just publish *why* the day-floors are what they are.

### The honest framing that turns this into a strength
Your differentiator is **deterministic, rule-based, transparent** logic — not black-box ML. So say
so, everywhere a threshold appears: *"This is a structured rule we apply consistently. It is tunable
and we are transparent about its basis."* Then add a single **"Methodology / science basis" page**
that lists every threshold as SOLID (cited) / LITERATURE-INFORMED (contested) / TUNABLE DEFAULT
(internal). That page is not a disclaimer — it's a sales asset, and it closes the manifesto gap.

---

## 3. Product & UX

### Pro (coach) — the problem is information architecture, not features
- **Sidebar is overloaded:** 8 top-level sections, ~40 visible items; the **Load Monitoring group is
  9 deep** (`CoachSidebar.tsx`). Coaches face "do I open Load Intelligence or Decel or IMA?" These
  largely answer the same question with different models.
- **Redundant load surfaces.** Load Intelligence / Decel / HSR / IMA / Indoor / Position Comparison
  overlap heavily. Consolidate to **three question-driven surfaces**: *Squad load & readiness* (the
  quadrant + status), *Injury risk* (Decel/HSR/IMA unified, tier-rendered), *Session/match review*.
- **Key analytics are buried in dashboard tabs** (`/coach?tab=trend|volatility|vald|strength|rtp|md`).
  Promote RTP and the analytics to real, discoverable pages.
- **No per-page purpose.** Add a one-line "Use this to answer: …" header to every surface.
- **Tier gating is silent.** Locked pages should explain what unlocks them (ties to §1).

> Note: the explore pass flagged `train-like-you-play`, `position-comparison`, `post-match-recovery`
> as "maybe unfinished" — they are **real and built** (verified). Don't cut them; fold the load ones
> into the consolidation above.

### Lite (client "Today") — mobile overload
The athlete home stacks **~16–19 cards** under full conditions (`PlayerClient.tsx` / client Today):
greeting, nudges, vacation banner, readiness card, momentum, AI coach, programme overview, move-
session, reports, check-in link, the workout card (with season/match/taper/readiness sub-banners),
Foster alert, heavy-lift exposure, PR forecast, bodyweight, progression link. On a 375px screen the
user scrolls past ~15 lines before seeing today's workout.

Fix (mobile budget: ≤7 cards above the workout):
- **Merge** the readiness card + the readiness-adapted session banner into one "Readiness &
  adjustments" card.
- **Collapse by default** the motivational cards (Momentum, AI Coach) into an expandable "Insights" chip.
- **Move PR-forecast off Today** — it already lives on Progression.
- **Hide** the programme-overview behind "View full schedule →".

### Lite (trainer) — the client-detail view is a dumping ground
The per-client drilldown stacks goals, games, breaks, auto-progression, readiness, load quadrant,
volume, PRs, attention, remove, plan-visibility, PDF — all on one scroll. **Sub-tab it**:
Overview / Goals / Readiness / Load / Adjustments.

### What's good in UX (keep)
- The workout card's per-exercise detail (sets×reps, target kg, %1RM, velocity, auto-prog arrow,
  info popover with bilingual description + video) is genuinely strong.
- Progression page is well-composed — it's the right home for the analytical cards moved off Today.
- The PlanBuilder + ProgramAudit (movement-balance, weekly-volume, spike detection) is a standout.

---

## 4. Technical & architecture

### Good news (verified)
- **Canonical verdict compliance: PASS.** `readiness_entries.color` / `v_coach_readiness_today_v8`
  is the sole verdict source; `athlete_decision_history.athlete_state` and
  `stage4_decisions.system_decision` are read only for history/action context, never as the colour.
- **Service-role key is not client-exposed** (not `NEXT_PUBLIC_`); `NEXT_PUBLIC_*` vars are all
  legitimately public (anon key, Firebase, VAPID).
- **Migration hygiene is decent:** 159 timestamped migrations, consistent
  `YYYYMMDDHHMM00_name.sql` naming, a template file present.

### The real risks (ranked)
1. **No automated test runner — highest technical risk.** 16 `*.test.ts` files exist but
   `package.json` has only `dev/build/start/lint` — **no `test` script, no CI**. For a product that
   computes readiness/load/heavy-lift verdicts, the decision engine is effectively untested in the
   pipeline. This is the #1 thing to fix.
2. **Auth boilerplate duplicated (~83 routes) with a silent anon fallback.**
   `getSupabase()` is re-implemented inline and falls back to the anon key if the service-role key is
   missing (`… ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""`). One careless copy-paste = an
   auth hole. Centralise into one `lib/api-auth.ts`; **remove the silent fallback** (fail loudly).
3. **RLS is bypassed at the application layer.** 242 routes filter by `team_id`/`player_id` in code
   using the service client. If that key ever leaks, row-level security is gone. Verify Supabase RLS
   policies exist as defence-in-depth; treat app-level filtering as the *second* line, not the only one.
4. **183 `console.*` calls**, many on production paths — can leak player IDs / load / injury data to
   logs. Strip them; add a real logger (server-only).
5. **God components.** `DevCoachDashboardClient.tsx` is **11,115 lines** and prod-gated
   (`notFound()` in production) — i.e. 11k lines of **dead weight**: cut it. `PlayerClient.tsx` is
   **5,535** and `custom-templates/page.tsx` **3,600** — split before adding more.
6. **Partial duplication** of per-90 normalisation and ACWR across routes despite shared libs
   existing — consolidate to one implementation each (correctness *and* maintenance).
7. **Stubs in the tree:** `automation-center`, `org-reporting`, `session-workflow` look unfinished —
   finish or delete.
8. **Type-safety debt:** ~169 `any`, ~67 `eslint-disable`/`@ts-ignore` (mostly integration glue;
   acceptable but worth trimming).

---

## 5. CUT / FIX / ADD (consolidated)

> **⚠️ Verification update (2026-06-30).** The CUT items below were checked against
> the code before acting. Several did not survive: the labels in the table are the
> auditor's *original* claim — read the status column first.

### CUT — verified
| Item | Original claim | Verified status |
|---|---|---|
| `automation-center`, `org-reporting`, `session-workflow` **route pages** | Unfinished stubs | ✅ **CUT (done)** — pages were orphaned, ran on `localStorage` demo data. Deleted the 3 pages + page-only components (~1.7k lines). **Kept the logic libs** (`micropulse/automation→realtime`, `orgIntelligence→reporting-center`, `sessionWorkflow→SessionBuilder`) — they are load-bearing for live features. `automation-center` was also wrongly reachable from the coach Admin sidebar; that entry was removed. |
| `dev-coach-dashboard` (11,115 lines) | Dead weight; never ships | ❌ **DO NOT CUT** — only the `/dev-coach-dashboard` *route* is prod-gated. `DevCoachDashboardClient` (the 11k-line client) **is the live coach dashboard**, rendered by `/coach/page.tsx`. Misleadingly named; rename is the real cleanup, not deletion. |
| Merge Starter Templates + Templates → one **Programme Library** | Same underlying data, two UXs | ❌ **DO NOT MERGE** — different tables and product modes. `templates` (team side) = `workout_templates` authoring library; `starter-templates` (PT side) = assign `pt_explosive_programmes` to a client. The PT/team split is deliberate (documented in `CoachSidebar.tsx`). |
| Slim client **Today** (16–19 stacked cards) | Mobile overload | ⚠️ **LARGELY STALE** — the player view is already a tabbed interface (`PlayerTabbedClient`: today/rpe/chat/dashboard/…), tier-gated, with portal-mounted cards. Re-measure on a real device before assuming overload. |
| Merge Load Intelligence / Decel / HSR / IMA / Indoor / Position → **3 surfaces** | Redundant | 🔶 **UNVERIFIED / high-risk** — must respect the Lite-vs-Pro capability split (efforts vs IMA are tier-complementary) or it regresses. Do not attempt as a blind merge. |
| Explosive-12w / isometric protocols *(verify adoption first)* | Possibly near-zero use | 🔶 Needs usage data — your data decides. |

### FIX
| Item | Why |
|---|---|
| Sport-science honesty (ACWR caveat, label tunables, drop eta-weeks, cite or cut the 25-set cap) | Closes the manifesto gap; on-brand |
| Coach IA: collapse Load Monitoring, promote tab-buried analytics, per-page purpose line | Decision clarity |
| Tier-gating UX: "what unlocks this" on locked pages | Conversion + honesty |
| Client Today overload: merge/collapse, ≤7 cards above the workout | Mobile usability |
| Trainer client-detail: sub-tabs | Stop the dumping ground |
| Auth: one shared helper, **kill the silent anon fallback** | Security |
| Strip `console.*`; add server logger | Data hygiene |
| Break up the 11k/5.5k/3.6k-line files | Maintainability |

### ADD
| Item | Why |
|---|---|
| **Test runner + CI, covering the decision engine first** | #1 technical gap; protects every verdict |
| **"Methodology / science basis" page** | Turns the audit into a sales asset; closes credibility gap |
| **MD+1/MD+2 cohort split** (Recovery vs Top-up — see `docs/train-like-you-play-mdday-cohorts.md`) | Makes the periodization view honest |
| **Usage analytics** | So cut/keep decisions are data-driven, not guesses |
| **Per-team tunable thresholds** (surfaced in settings) | De-risks the "over-fit to one club" problem |

---

## 6. Suggested 90-day sequence

**P0 — credibility & safety (do first):**
- Wire a test runner (vitest) + CI; cover readiness, ACWR/quadrant, Foster, 1RM, trainingRead.
- Sport-science pass: ACWR caveat, label every uncited threshold as a tunable default, replace
  PR `eta_weeks` with slope, ship the Methodology page.
- Auth: shared helper, remove anon fallback; strip `console.*`.

**P1 — focus (subtract):** *(2026-06-30: mostly did not survive code verification — see §5 CUT table)*
- ✅ Deleted the 3 orphaned prototype **pages** (kept their load-bearing libs).
- ❌ `dev-coach-dashboard` is the live coach dashboard, not dead weight — do not delete.
- ❌ The two programme "libraries" are different data/modes — do not merge.
- ⚠️ Client Today is already tabbed — re-measure before slimming.
- 🔶 Load Monitoring → 3 surfaces remains the one open item, but it's high-risk (Lite/Pro capability) and should be driven by usage analytics, not guesswork.

**P2 — clarity:**
- Per-page "use this to answer …"; tier-gating UX; trainer client-detail sub-tabs.
- Ship the MD+1/+2 cohort split.

**P3 — strategy:**
- Simplify pricing to a two-product, two-tier story; add usage analytics; write the
  build-vs-Catapult boundary and let it govern the roadmap.

---

## Appendix — what I could not verify (be skeptical here)
- **Adoption/usage** of any surface (no analytics in code) — every "verify adoption" above needs your data.
- **Live RLS policies** in Supabase (only the app-layer pattern is visible in code).
- **Customer/club counts and revenue** — the "over-built for stage" judgement assumes an early
  user base; if you already have many clubs, some sprawl is justified and the priority shifts toward
  hardening over subtraction.
