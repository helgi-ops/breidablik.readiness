# Coach surfaces audit — destination vs background vs consolidate

**Problem:** the coach area has grown to **73 pages** (`src/app/coach/*`), most of them
standalone analytical engines that each got their own route. A coach can't and shouldn't
navigate 73 pages to know what needs attention. Many of these do **not** need to be places you
*go* — they should compute in the background and **surface as a signal** where the coach already
looks (the Today page, `/coach`), with the full page kept only as an optional drill-down.

This audit classifies every coach page into a four-tier model and says, for each, how it should
surface. Grounded in the real routes + `src/app/coach/CoachSidebar.tsx` (the nav config).

## The four tiers

1. **Destination** — a place the coach actively goes; stays in the sidebar. Keep small (~12–15).
2. **Drill-down** — the page stays, but leaves the sidebar. Reached only by clicking a chip/row
   on a destination. Visitable, not navigable.
3. **Background-only** — no page needed. A computed signal (verdict + why + confidence) that
   appears as a chip/alert on the briefing or player card. Exception-based: silent unless it has
   something to say.
4. **Consolidate** — merge into a hub as a tab; retire the standalone route.

The guiding rule (your own manifesto): **head-coach surface first, S&C drill-down on click.**
The default view is one screen of signals; depth is one click away, never a required visit.

## How a background engine surfaces (the mechanism — mostly already in place)

The audit found that **almost every analytical page already reads a precomputed result live from
Supabase** (rpc functions, JSONB written on insert). So the heavy compute is not the gap. Two
small pieces turn a page into a background signal:

1. **A signals cache + nightly writer.** Extend the existing `daily-sync` (or a Supabase
   scheduled edge function) to write each player's per-engine verdict into one small table —
   `coach_signals(engine, player_id, level, why[], confidence, counterfactual, as_of)`. Every
   surface then reads this table instantly; no page visit triggers the compute.
2. **The briefing aggregator + exception gate.** The Today page (`/coach` — `TodayCommandCenter`
   + `DecisionSummaryCard` + attention list) and the
   **Notifications** stream (already an event-of-what-changed surface) read `coach_signals` and
   render chips **only when level ≠ steady**. This is the existing delta-badge / sprint-drop chip
   pattern, generalised. The `morning` brief can aggregate the same table into one daily read.

Every background signal still obeys the manifesto: a plain one-line verdict, 2–3 "why" facts,
confidence, a counterfactual, and it **never becomes the readiness colour** — it sits beside it.

---

## Recommended destinations (the small set that stays in the sidebar)

Daily Briefing `/coach` · Availability board · Players (roster) · Injuries · Match hub
(match-analysis + match-insights merged) · Player hub (see below) · Week setup · Load plan ·
Fixtures · Conversations / Messages · Integrations · Settings · Reporting center · Display (TV).

Everything else becomes a drill-down, a background signal, or a tab.

---

## Per-page recommendation

### A. Load / Movement "Intelligence" (8 pages) → Background signals + one Player-hub tab
All eight are per-player, descriptive, personal-norm, and by design never touch the readiness
colour. They are the clearest over-proliferation: eight sidebar entries for what is really one
"how is his load/movement trending" question at different lenses.

| Route | Recommendation | Surfacing |
|---|---|---|
| `/coach/decel-intelligence` | **Background** | Injury-risk chip on briefing/player card; deep page = drill-down |
| `/coach/hsr-intelligence` | **Background** (already the Lite-tier twin of decel) | same chip, tier-swapped |
| `/coach/load-intelligence` | **Background** + drill-down | Load-coupling flag; page as drill-down |
| `/coach/quadrant` | **Drill-down** | Team load 2×2 — reached from Load plan |
| `/coach/heart-rate-intelligence` | **Background** | HR-vs-sRPE mismatch flag; else silent |
| `/coach/indoor-load` | **Background** | Indoor-load flag (no-GPS clubs); drill-down |
| `/coach/power-curve-intelligence` | **Consolidate** → Player hub tab | peak-capacity chip |
| `/coach/ima-intelligence` | **Consolidate** → Player hub tab | "session delivered" chip |

### A2. Movement Analysis (4 pages) → Player/Match hub tabs
| `/coach/match-movement` | **Consolidate** → Player hub tab | — |
| `/coach/player-game-report` | **Consolidate** → Player hub tab (keep PDF export) | — |
| `/coach/position-comparison` | **Drill-down** (team/positions) | reached from Match hub |
| `/coach/train-like-you-play` | **Background** | preparedness flag ("training ≠ match demand") |

### B. Readiness / injury early-warning (7) → mostly Background (this is the core of the idea)
These already produce a verdict/chip, not a page-worth of exploration.

| `/coach/readiness-signals` (robustness watch #5 + signal pack) | **Background** | THE chip beside the readiness colour; page = drill-down |
| `/coach/form-vs-state` | **Background** | per-player "output holds under fatigue?" chip |
| `/coach/game-plan-fit` | **Background** | matchday "ready for role vs this opponent" chip |
| `/coach/post-match-recovery` | **Background** | MD+1…MD+N recovery chips; drill-down for the grid |
| `/coach/notifications` | **Destination (the aggregator)** | this IS the signals inbox — point the cache at it |
| `/coach/availability-board` | **Destination** | the "who can I pick" team state — keep |
| `/coach/injuries` | **Destination** (has the log-new form) | keep; feeds injury-recency into signals |

### C. Match / season analysis (8) → one Match hub + Player hub
| `/coach/match-analysis` | **Destination** → merge into **Match hub** | — |
| `/coach/match-insights` | **Destination** → merge into **Match hub** (tab) | — |
| `/coach/win-factors` | **Drill-down** (basketball-only) | from Match hub |
| `/coach/opponent-scouting` | **Drill-down** | from Match hub / fixtures |
| `/coach/player-analysis` | **Destination** → the **Player hub** base | — |
| `/coach/total-player-analysis` | **Consolidate** → Player hub (the athlete tab) | — |
| `/coach/transfer-report` | **Drill-down** | from Player hub (export action) |
| `/coach/match-minutes` | **Background/interactive** | MD+1 entry — surface as a "confirm minutes" task, not a nav item |

### D. Rehab / clinical (5 protocols + 3 clinical) → one module + drill-downs
The 5 rehab pages are literally sibling instances of `components/rehab/tendonLoading.tsx`.

| `hamstring-rehab` · `jumpers-knee` · `achilles-tendinopathy` · `adductor-groin` · `ankle-sprain` | **Consolidate** → one "Rehab protocols" page with an injury-type selector | one sidebar entry |
| `/coach/return-to-training` (+`/[playerId]`) | **Drill-down** | from Injuries / player card |
| `/coach/rtp` (+`/[playerId]`) | **Drill-down** | force-plate assessment from player card |
| `/coach/clinical-reports` | **Drill-down** | from Injuries (PHI, keep access-gated) |

### E. Planning / load (7) → keep the interactive planners, background the reports
| `/coach/week-setup` | **Destination** | the weekly planner |
| `/coach/load-plan` | **Destination** | pre-session report |
| `/coach/fixtures` | **Destination** | calendar (upstream of match days) |
| `/coach/post-training` | **Background** | "actual vs planned" flag; drill-down for detail |
| `/coach/progressive-overload` | **Drill-down** | from player card (interactive builder) |
| `/coach/conditioning` | **Drill-down** | energy-system profile + test entry, per-player |
| `/coach/assessment-profile` | **Drill-down** | from Player hub |

### F. Strength planning (10) → one "Programme library" hub + per-player output
| `/coach/strength` | **Destination** | daily readiness-adapted S&C output |
| `/coach/templates` · `custom-templates` · `starter-templates` · `isometric-protocols` · `recovery-protocols` · `my-exercises` | **Consolidate** → one "Programme library" hub with tabs | one sidebar entry |
| `/coach/lv-profile` | **Drill-down** | per-player LV entry (shared with PT) |
| `/coach/plan-builder` · `/coach/pt-explosive` | **Drill-down** (PT/super-admin) | already off the football sidebar |

### G. Ingestion / admin (11) → fold uploads into Integrations
| `catapult-upload` · `vald-upload` · `assessment-upload` · `integrations/wimu` | **Consolidate** → tabs under **Integrations** | one entry |
| `/coach/integrations` | **Destination** | the connection hub |
| `/coach/players` · `/coach/settings` · `/coach/reporting-center` | **Destination** | admin |
| `/coach/ksi-report` | **Drill-down** | export, from Reporting center |
| `/coach/leads` · `/coach/usage-analytics` | **Drill-down** (super-admin) | off the coach sidebar |

### H. Other / comms / display
| `/coach` | **Destination** — the hub; absorbs the background chips | — |
| `/coach/conversations` · `/coach/messages` | **Destination** | comms |
| `/coach/display` (+`/recovery`) | **Destination** (external TV) | keep |
| `/coach/dev-coach-dashboard` | dev-only — leave | — |
| `/coach/player-stats` | **Retire** — already a redirect to player-analysis | delete route |

---

## What this collapses to
- **~13–15 destinations** in the sidebar (from ~60), grouped: Briefing · Availability · Players ·
  Injuries · Match hub · Player hub · Planning (week-setup / load-plan / fixtures / strength) ·
  Programme library · Rehab protocols · Integrations · Settings · Reporting · Comms · Display.
- **~12 background signals** feeding the briefing chips + Notifications inbox (readiness-signals,
  form-vs-state, game-plan-fit, decel/hsr, load-intelligence, heart-rate, indoor-load,
  post-match-recovery, post-training, train-like-you-play, match-minutes-task).
- **~5 consolidation hubs** absorbing ~25 pages (Intelligence → Player hub tabs; 5 rehab → 1;
  6 libraries → 1; 4 uploads → Integrations; match-analysis + match-insights → Match hub).
- Pages retired: `player-stats`.

## Guardrails
- A page becoming a background signal must still carry the layered read (verdict → 2–3 why →
  confidence) as a chip, with the drill-down page one click away. Don't hide the "why" — only the
  raw tables move behind the click.
- **One readiness colour.** Background signals sit *beside* `v_coach_readiness_today_v8.final_color`,
  never replace or tint it (principle #1).
- Exception-gating must be conservative (the yellow-oversensitivity lesson): a chip appears only
  when the signal is genuinely actionable, else the briefing fills with noise.
- Tier/sport gating already lives in `CoachSidebar.tsx` (`LITE_HIDDEN_HREFS`, `NO_GPS_HIDDEN_HREFS`,
  `BASKETBALL_*`) — reuse it so chips respect the same visibility.

## Suggested rollout (low-risk order)
1. **Retire + consolidate the obvious** (no logic change): delete `player-stats`; fold the 5 rehab
   pages behind an injury-type selector; fold the 4 upload wizards + 6 libraries into their hubs.
   Pure nav/IA simplification. Biggest visible win, lowest risk.
2. **Stand up `coach_signals` cache + the nightly writer**, starting with the 3–4 engines that are
   already verdict-shaped (readiness-signals/robustness, form-vs-state, game-plan-fit,
   post-match-recovery). Point the briefing chips + Notifications at it.
3. **Demote the Intelligence pages to Player-hub tabs / drill-downs**; keep each reachable, remove
   from the sidebar.
4. Validate the exception-gate flag-rate (same discipline as the readiness oversensitivity work)
   before turning chips on for the whole squad.

---

## EXACT target sidebar (every one of the 71 routes placed)

### In the sidebar (destinations)

**DASHBOARD**
- Today — `/coach` (renders `DevCoachDashboardClient`; this IS the existing Today page and does
  not change structurally). It already hosts `TodayCommandCenter`, `DecisionSummaryCard`, the
  Daily Briefing attention list (`buildAttentionList`), and the Today cards (`PlayerSummaryCard`,
  `TeamIndoorBriefing`, `LoadVerdictCard`, `UnfamiliarLoadCard`, `OverrideHistoryCard`,
  `VerdictAccuracyCard`, `InternalAcwrCard`, …). The background signals attach here as chips
  **inside these existing surfaces** — they are not a new page.

**MONITORING** — the daily "who and in what state" look
- Availability board — `/coach/availability-board`
- Notifications — `/coach/notifications` (the signals inbox; the `coach_signals` cache feeds it)
- Injuries — `/coach/injuries`

**MATCH**
- Match hub — `/coach/match-analysis` (with **Season** = `match-insights` as a tab)

**PLANNING**
- Week setup — `/coach/week-setup`
- Load plan — `/coach/load-plan`
- Fixtures — `/coach/fixtures`
- Strength — `/coach/strength`

**LIBRARIES** (reference)
- Programme library — `/coach/templates` (tabs: `custom-templates`, `starter-templates`,
  `isometric-protocols`, `recovery-protocols`, `my-exercises`)
- Rehab protocols — one page with an injury-type selector (folds `hamstring-rehab`,
  `jumpers-knee`, `achilles-tendinopathy`, `adductor-groin`, `ankle-sprain`)

**COMMUNICATION**
- Conversations — `/coach/conversations`
- Messages — `/coach/messages`

**ADMIN**
- Players (roster) — `/coach/players`
- Integrations — `/coach/integrations` (tabs: `catapult-upload`, `vald-upload`,
  `assessment-upload`, `integrations/wimu`)
- Reporting center — `/coach/reporting-center`
- Settings — `/coach/settings`

**EXTERNAL**
- Display / TV — `/coach/display` (+ `display/recovery`)

**SUPER-ADMIN ONLY** (gated, as today)
- Leads — `/coach/leads`
- Usage analytics — `/coach/usage-analytics`
- Dev dashboard — `/coach/dev-coach-dashboard`

→ **~19 sidebar entries** (of which 3 are super-admin-gated), from ~60 today.

### NOT in the sidebar — Background signals (chip on the briefing; the page becomes the drill-down the chip opens)
`readiness-signals` (robustness #5) · `form-vs-state` · `game-plan-fit` · `decel-intelligence` ·
`hsr-intelligence` · `load-intelligence` · `heart-rate-intelligence` · `indoor-load` ·
`post-match-recovery` · `post-training` · `train-like-you-play` · `match-minutes` (as a
"confirm MD+1 minutes" task chip).

### NOT in the sidebar — Drill-downs (reached by clicking a player / a link)

**Player hub** — opened by clicking a player (from Players, Availability, or briefing).
Base = `player-analysis`; tabs fold in: `total-player-analysis`, `power-curve-intelligence`,
`ima-intelligence`, `match-movement`, `player-game-report`. Player-scoped actions/pages reached
from the hub: `transfer-report`, `assessment-profile`, `conditioning`, `progressive-overload`,
`lv-profile`, `rtp` (+`/[playerId]`), `return-to-training` (+`/[playerId]`), `clinical-reports`.

**From Match hub:** `opponent-scouting`, `win-factors` (basketball), `position-comparison`.
**From Load plan:** `quadrant` (team load 2×2).
**From Reporting center:** `ksi-report`.
**PT / super-admin (already off the football sidebar):** `plan-builder`, `pt-explosive`.

### Retired
`player-stats` (already a redirect to `player-analysis`) → delete the route.

### Every route accounted for
19 sidebar destinations · 12 background signals · ~22 drill-downs (incl. the Player-hub tab
folds) · 1 retired. Consolidations remove ~24 standalone sidebar entries (8 Intelligence, 5 rehab,
6 libraries, 4 uploads, match-insights) without deleting the underlying pages — they become tabs
or chip-drill-downs.

Ref: `fusion-layer-strategy.md`, `robustness-injury-early-warning-spec.md`, `CoachSidebar.tsx`,
the explainability-first manifesto (`docs/explainability-first.md`).
