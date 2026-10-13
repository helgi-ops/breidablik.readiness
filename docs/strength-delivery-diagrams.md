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
