# Strength delivery — how the layers combine

Coach-facing explanation of how a player's **Æfing dagsins** (Daily session) is built and
delivered. Diagram labels are in Icelandic (coach-facing language); the prose is English.

Canonical reference for the precedence + writers: [`session-delivery-model.md`](session-delivery-model.md).
These diagrams are the intuition layer on top of it.

---

## 1. Individualised — three independent layers → one session

You set three layers, each in its own place, and the engine (`buildStrengthSession`) weaves
them into every player's session. They answer different questions and never overwrite each other.

```mermaid
flowchart TD
  P["Team palette — HVAÐA æfingar<br/>pool per slot"]
  S["Per-MD structures — HVERNIG<br/>aðferð dagsins (French contrast, cluster…)"]
  R["Training principles — Á HVAÐA ákefð/gæðum<br/>%1RM · gæði · scheme"]
  B["buildStrengthSession — vélin les samhengið og fléttar lögin<br/>Sjálfvirkt: MD-dagur · readiness-litur · DSI/F-V · blokk<br/>1) aðferð úr structures · 2) fyllir slott úr palette<br/>3) mildar á readiness+DSI (gult lækkar, aldrei þyngir) · 4) principles-forskrift ofan á"]
  O["Æfing dagsins — leikmaður<br/>Æfingar (palette) í aðferð dagsins (structures), á forskrift blokkar (principles), mildað á readiness"]
  P --> B
  S --> B
  R --> B
  B -->|"einn writer → player_today_strength_override"| O
```

---

## 2. Training principles × Team palette — what each changes

The team palette fixes **which** exercise fills each slot. Training principles decide **how many
sets** land on that exercise and **at what intensity** — including the **Weekly approach**
(micro-dose vs traditional). Changing a principle never changes the palette.

```mermaid
flowchart TD
  P["Team palette<br/>HVAÐA æfing — pool per slot"]
  R["Training principles<br/>Prescription + Weekly approach"]
  M["Vélin fléttar — á SÖMU æfingu<br/>Palette velur æfinguna · principles ákveða sett og ákefð"]
  MI["Micro-dose (sjálfgefið)<br/>Sama æfing dreifist á vikuna · t.d. MD-4/MD-3/MD-2 · ~2 sett hvor"]
  TR["Traditional<br/>Valdir lyftidagar (aðrir Off) · settin skölluð upp (þak 6) · vikumagn jafnað"]
  K["Lykilregla: palette → HVAÐA æfing · principles → sett/ákefð/vikudreifing. Hvorugt yfirskrifar hitt.<br/>Traditional skalar aðeins aðal-lyftur (COMPOUND/ACCESSORY/UNILATERAL); power + Nordic/Copenhagen aldrei."]
  P --> M
  R --> M
  M --> MI
  M --> TR
  MI --> K
  TR --> K
```

> **Evidence:** micro-dose vs traditional maintain strength when the **weekly volume is equated**
> — not merely when there are fewer days (Cuthbert 2021). That's why the traditional lift day
> scales its main-lift sets up to carry the dropped days' volume (capped at 6).

---

## 3. Standard mode — how the team's session is delivered

In **Standard** mode the coach can deliver the team's authored **Custom Programme** instead of the
engine's per-player build. When the active Custom Programme covers today, the send *stands aside*
and lets the player's own Today resolution serve it (readiness-reactive at view time); otherwise
the engine builds the built-in Standard MD template and writes the override.

```mermaid
flowchart TD
  SS["Standard send<br/>manual eða auto-send · mode = standard"]
  D{"Nær virka Custom Programme liðsins yfir daginn?<br/>is_active · md_day eða GENERIC · season_phase · gluggi leikmanns"}
  Y["JÁ → vélin víkur (stand aside)<br/>Enginn engine-override · skilaboð + push<br/>Les Custom Programme beint (layer 3)<br/>GREEN/YELLOW/RED valið á skoðunartíma"]
  N["NEI → innbyggt Standard MD-template<br/>buildStrengthSession (mode = standard)<br/>MD + readiness · EKKI per-leikmaður · + coach-blokk<br/>Skrifar player_today_strength_override"]
  O["Æfing dagsins — það sem leikmaður sér<br/>Readiness mildar aðeins; aldrei liturinn eða ákvörðunin"]
  SS --> D
  D -->|JÁ| Y
  D -->|NEI| N
  Y --> O
  N --> O
```

> **Individualised vs Standard:** Individualised always builds per-player and writes the override
> (no stand-aside). The stand-aside path is Standard-only, and its readiness variant is picked on the
> **player's** side at view time, whereas the engine/override path locks readiness at send time.

---

## 4. Which table does Standard read from?

The stand-aside path reads the **team's own active Custom Programme table** — resolved
team-scoped by `resolveTeamCustomTable` from the team's `is_active` `custom_template_sets` row
(`player_id IS NULL`). Each team has its own dynamically-named table.

```mermaid
flowchart TD
  A["Standard · stand-aside (layer 3)"]
  B["resolveTeamCustomTable(team)<br/>virka custom_template_sets · is_active · player_id NULL"]
  C["Breiðablik → breidablik_football_karlar_microdose_templates"]
  D["HK → hk_football_karlar_microdose_templates"]
  E["ekkert virkt custom → innbyggt MD-template (engine)"]
  A --> B
  B -->|team-scoped| C
  B -->|team-scoped| D
  B -->|fallback| E
```

- The table name comes from the active set's `table_name` (the builder derives it from the bare
  club name: `slugify(club)_sport_{karlar|konur}_microdose_templates`).
- It is **always** read `.eq("team_id", …)` — a team never sees another team's table
  (team-scoped reads + the `workout_templates` RLS and microdose-view fixes guarantee this).
- `microdose_templates` (the shared default table) is **not** the per-team custom table; a team with
  no custom programme simply falls back to the engine's built-in MD template.

### Covered vs not covered (the one caveat)

- **Covered** (the team's active table has a row for today's `md_day`/`GENERIC` in the week's
  `season_phase`, within the player's window) → Standard delivers from that team's own table.
- **Not covered** (no active custom table, or no matching row) → Standard does **not** use a custom
  table; the engine builds the built-in Standard MD template and writes the override.

---

## 5. What the generic Standard template looks like (no Custom Programme)

When a team runs Standard with **no covering Custom Programme**, players get the engine's built-in
template: default exercises (the **team palette is not applied** in Standard), readiness/MD-tuned.
Shown below as the GREEN/full day — YELLOW trims sets, RED → recovery/ISO. Doses reflect the current
meso block (e.g. Transmutation) applied on top. This is the fallback a coach replaces by building a
Custom Programme.

| MD day | ~min | Blocks → exercises (sets×reps) |
|---|---|---|
| **MD-4** | 24 | *Prep:* Glute activation 4×30s · *Compound:* **Trap-bar deadlift 3×3** · *Posterior:* Nordic hamstring curl 2×5 · *Adductor:* Copenhagen adduction 2×6/side |
| **MD-3** | 26 | *Prep:* Pogo bouncing 2×10 · *French contrast:* Back squat 2×3 → Box jump 2×3 → Trap-bar jump squat 2×3 → Med-ball rotational throw 2×4/side · *Med-ball:* Med-ball scoop throw 2×5 |
| **MD-2** | 16 | *Prep:* Pogo bouncing 2×5 · *Power primer:* IMTP 3×5s · Box jump 2×3 |
| **MD-1** | 12 | *Prep:* Pogo bouncing 2×5 · *Power primer:* IMTP 2×3s · Box jump 1×3 |
| **MD+1** | 16 | *Prep:* Hip mobility flow 3×5 · Glute activation 4×30s · *Power primer:* Jump shrug 2×3 · *Iso finish:* Long iso hamstring bridge (single-leg) 3×30s/side |

> These are the engine defaults (structures + exercises), not the coach's palette or per-MD method
> picks (both individualised-only). Build & activate a Custom Programme in **Custom Training
> Programmes** and Standard delivers that instead (GREEN/YELLOW/RED, readiness-reactive at view time).
> Source: `buildStrengthSession(snapshot, [], { mode: "standard" })` + the current meso block.

