# Individualised strength — how it works

*The daily strength session: how MicroPulse turns your chosen exercises, each
player's data, and the match countdown into one session per player — and how you
stay in control.*

This guide has two parts:

1. **For the coach** — plain language: what you set up, what the player gets, and
   how to keep control.
2. **Technical appendix** — for S&C staff and developers: the thresholds, the
   evidence, the data model and the endpoints.

---

## Part 1 — For the coach

### The one idea

Every player gets **one** strength session a day. You choose how it's built:

- **Standard** — the matchday template (MD-4 heavy, MD-3 power, …), tuned only to
  the day and the player's readiness. This is the classic MicroPulse session that
  you set up yourself.
- **Individualised** — the same matchday template, **plus** each player's own
  layer: their movement-screen corrective, their strength/power deficits, and
  their left/right symmetry, all built from **the exercises you chose for the
  team**.

You set the team default and can override it on any single send. Everything lives
on **Coach → Strength**.

> **Why one session?** In-season, 15–20 minute micro-doses 3–5×/week preserve
> strength and power without next-day fatigue (Rønnestad 2023). One coherent,
> individualised session reaches the player instead of two colliding ones.

### 1. Your team exercise palette

The individualised (and auto) build assembles each player's power and strength
work from a pool **you pick** — the *palette*. You choose, per slot:

| Slot | What goes here |
|---|---|
| **Power / explosive** | jumps, olympic derivatives, ballistic, med-ball |
| **Bilateral strength** | your main two-leg lift (squat / trap-bar / hip thrust) |
| **Unilateral strength** | your main single-leg lift (split squat / B-stance RDL) |
| **Isometric (strength / RFD / PAP)** | overcoming holds (IMTP, iso squat at 90°) and yielding holds (Spanish squat) |

Pick **both a bilateral and a unilateral** lower-body option: the system chooses
between them **per player** from their left/right symmetry — asymmetric players
get the single-leg lift to load the weaker side; symmetric players get the
bilateral lift.

Leave a slot empty and the built-in default is used. **The palette never touches
the Standard session — you enter that one yourself.**

### 2. The session structure per matchday

You can tie a **training method** to each matchday, and the system lays that
method out from your palette:

| Day | You can choose | Orientation |
|---|---|---|
| **MD-4** | Cluster · Straight sets · Contrast · French contrast · Overcoming isometric | Strength / power |
| **MD-3** | French contrast · Contrast · Cluster · Straight sets · Power contrast · Potentiation cluster · Overcoming isometric · Isometric PAP primer | Strength → power |
| **MD-2** | Power contrast · Potentiation cluster · Isometric PAP primer | Velocity / explosive |
| **MD-1** | Power contrast · Potentiation cluster · Isometric PAP primer | Velocity / explosive |
| **MD+1** | *(fixed recovery)* | Recovery |

**Isometrics — for strength *and* power.** Two isometric methods, each grounded
in the evidence:

- **Overcoming isometric** (strength days) — push maximally against an immovable
  bar at a deep joint angle (long muscle length), highest intent. Builds max
  strength and rate of force without joint movement (Oranchuk 2023). Joint-friendly.
- **Isometric PAP primer** (taper days) — a maximal isometric conditioning
  activity (3 sets × 3×3 s) that *potentiates* the explosive set 3–6 minutes later,
  raising jump/sprint output (Krzysztofik 2023, Jarosz 2025). Volume matters — one
  set does nothing.

The days closer to the match only offer **light, fast** methods (power contrast,
potentiation cluster) — the intent there is speed, not load. Heavy methods are
locked to MD-4 / MD-3 on purpose. Leave a day on **Default** to keep its built-in
structure. Injury-prevention work (Nordic, Copenhagen) stays on the strength days
and is never swapped out.

**One method per day — and it adapts to the player.** You don't stack methods
(that would bloat the micro-dose). Instead the chosen method **steps down a rung
for a yellow player**: French contrast → Contrast, Contrast → Cluster, and so on.
Green keeps the method; red is already recovery. So a fully-recovered player gets
the complex, an under-recovered team-mate the same day gets a lower-demand version
— and the set-reduction still applies on top. The downgrade is shown, with its
reason, under *"Why these changes?"*.

### 3. Swapping an exercise

Sometimes the sent exercise isn't quite right (equipment, comfort, a niggle).
Both you and the player can swap it — **but only for a safe alternative**:

- **You (coach):** on a player's session, hit **↻ swap** on any exercise. The
  exercise's safe alternatives are marked and listed first, then the rest of the
  same category.
- **The player:** on their Today card there's a **"Swap an exercise (safe
  options)"** panel. They can only pick from that exercise's curated safe
  alternatives — never something mechanically inappropriate. **Every player swap
  is logged for you.**

### 4. Automatic morning send (opt-in)

You can let MicroPulse send each player their session automatically every morning
on strength days — no click. It's **off by default** and fully self-service per
team:

- Turn it on/off yourself on Coach → Strength ("Auto-send every morning").
- It **never overwrites** a session you already sent that day.
- It **skips** off-days, injured players, and anyone on a RECOVERY verdict.
- You can always re-send, override, or switch it off.

### What the player sees

One session, labelled **"Sent by your coach"**, already tuned to how they are
today. If their movement screen flagged something, the corrective activation leads
as its own block, then the strength work. They see the "why" behind any change,
and can swap from safe options.

### Staying in control (the promise)

- **Rules decide, the system explains.** Every change — a symmetry-driven
  unilateral lift, a chosen method, a corrective — shows its reason and a paper
  citation under *"Why these changes?"*.
- **You always have the last word.** Your manual swap overrides any system choice.
- **Nothing is hidden.** Standard vs individualised, the palette, the structures,
  and auto-send are all your explicit choices.

---

## Part 2 — Technical appendix (S&C / developers)

### The build pipeline

`buildStrengthSession(snapshot, coachOverrides, { mode })` — one player, one day:

1. **Template / structure selection.** Default → the MD template
   (`pickTemplate`). If the coach chose a non-default, allowed method for the day →
   `buildStructuredBlocks(key, md)` lays that method out.
2. **Adaptation rules** (`applyAdaptationRules`) — readiness, soreness, decel
   burden, VBT, sprint drop, CoD asymmetry, congestion. (Standard mode drops the
   deficit-ledger emphases here.)
3. **Team palette** (`applyTeamPalette`, individualised only) — substitutes the
   coach's chosen exercises into the power/strength slots, keeping the MD-tuned
   dose; **symmetry** picks the pool (below).
4. **Coach overrides** (`applyCoachOverrides`) — the coach's manual swaps win last.
5. **Correctives** — the movement-screen corrective is merged as the session's
   front activation block (not readiness-reduced).
6. **Serialize** (`strengthSessionToTodayStructure`) → the Today-card structure,
   stored once per player per day.

### Symmetry → unilateral vs bilateral

`codAsymmetryPct >= 10%` (Bishop 2020, `PALETTE_UNILATERAL_ASYMMETRY_PCT`) → the
lower-body slot is filled from the **unilateral** palette pool, else the
**bilateral** pool. There is **no cross-pool fallback** — an empty chosen pool
leaves the template/adaptation exercise in place, so the palette never undoes the
adaptation engine's own `COD_ASYM_MAIN_LIFT_SWAP`.

### Structures

- `STRUCTURES_ALLOWED_BY_MD` — MD-4/MD-3 strength/power
  (`cluster`, `straight_sets`, `contrast`, `french_contrast`); MD-3/MD-2/MD-1
  velocity/explosive (`power_contrast`, `potentiation_cluster`). MD+1 fixed.
- `DEFAULT_STRUCTURE_BY_MD` — MD-4 = cluster, MD-3 = french_contrast (choosing the
  default keeps the built-in template byte-identical).
- **Dose fallback** (`DOSE_FALLBACK`) — dosing is exercise+MD specific and sparse,
  so a method landing on a day an exercise isn't dosed for resolves to the nearest
  MD dose.
- **Explosive methods force light + fast** (10% velocity cap, `sets 3 × reps 3`,
  max-intent) regardless of the day, and **skip** the Nordic/Copenhagen prevention
  block; strength methods keep it. Nordic (van Dyk 2019) and Copenhagen
  (Harøy 2019) are never palette-driven.

### Data model

| Table / column | Purpose | Access |
|---|---|---|
| `teams.strength_send_mode` | team default: `individualised` \| `standard` | coach |
| `teams.strength_auto_send` | opt-in auto morning send (bool) | coach |
| `team_strength_palette.slots` (jsonb) | per-slot exercise pool | RLS `coach_team_ids()` / `is_staff()` |
| `team_strength_palette.md_structures` (jsonb) | MD → method map | same |
| `player_today_strength_override` | the sent session (`structure` jsonb, 1 row/player/date) | coach-written |
| `strength_session_overrides` | coach manual swaps (block, position, exercise id) | coach, team-scoped |
| `player_exercise_swaps` | player swaps (log + coach window) | player-owned (`players.user_id`), coach read |

### Endpoints

- `GET/POST /api/coach/team/strength-palette` — palette slots + MD structures
  (POST merges only the field sent).
- `GET/POST /api/coach/team/strength-send-mode` — team default mode + auto-send.
- `POST /api/coach/team/send-strength-sessions` — bulk send (per-send `mode`).
- `POST /api/coach/player/[id]/send-strength-session` — single send.
- `POST /api/coach/player/[id]/strength-override` — coach swap (safe alternatives
  surfaced first).
- `POST/DELETE /api/player/exercise-swap` — player swap; validates the target is
  in the original exercise's `alternatives`, logs it, and rewrites today's
  structure so the card updates live.
- `GET /api/strength/auto-send` — Vercel cron `0 6 * * *` (`CRON_SECRET`), opt-in
  per team, skip-if-already-sent, strength-days only.

### Audit rules (surfaced as "Why these changes?")

`STANDARD_MODE`, `TEAM_PALETTE_APPLIED`, `PALETTE_SYMMETRY_UNILATERAL`,
`STRUCTURE_APPLIED`, `CORRECTIVE_MERGED` / `CORRECTIVE_CORROBORATES_EMPHASIS`,
`COACH_OVERRIDE_APPLIED`, `INJURY_BLOCK`.

### Evidence base

Rønnestad 2023 (microdosing) · Bishop 2020 (inter-limb asymmetry) · Tufano 2017
(cluster sets) · Cormie 2011 / Liu 2023 (contrast & French contrast) ·
Pareja-Blanco 2017 (velocity-loss caps) · van Dyk 2019 (Nordic, −51% hamstring) ·
Harøy 2019 (Copenhagen, −41% groin) · Martin-García 2018 (matchday taper) ·
Oranchuk 2023 (isometric length/intensity/intent) · Krzysztofik 2023 & Jarosz 2025
(isometric conditioning → PAPE) · Schaefer & Bittmann 2017 (pushing vs holding).
