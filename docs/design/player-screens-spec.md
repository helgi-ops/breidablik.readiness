# Player screens — exact spec (from Claude Design mockup, rounds 21–22)

Text spec of each player screen in `Coach Dashboard Hugmyndir.dc.html` so Claude Code can match
layout/order/copy/colour without needing the image. Colours = the Design-system tokens in the repo
`CLAUDE.md` (cobalt `#2740e6`, bone `#f4f2ec`, ink `#14181c`, green `#1c7a4a`, amber `#de9328`,
red `#a83e28`, rtp purple `#7a5cc4`). English is the default; IS shown here where the mockup was IS.

**Global rules seen across every player screen**
- One clean header, then ONE decision block, then the session, then after-session/RPE, then nudges
  as a single line. Session card is ALWAYS above nudges. No dev-chips on Today (only a small IS/EN
  toggle top-right).
- Readiness is stated ONCE (in the decision block) — no second "your body is showing…" paragraph.
- Bottom nav (4–5 items): `Today · Match · [RPE] · Dashboard · More` (EN) / `Í dag · Leikur ·
  Yfirlit · Meira` (IS). RTP players get `Endurhæft` in place of one item.

---

## 22a — Player Today, RETURN-TO-TRAINING (Arnór, green, week 3/3)
Order top → bottom:
1. **Header**: "Hi, Arnór" · "Wed 8 July · Breiðablik · FWD" · IS/EN toggle (EN active). Small pill
   under name: `RETURN · WK 3/3`.
2. **Today's decision**: green dot + `TODAY'S DECISION` label + chip `MD-4 · 4 to match`.
   Headline (big, Archivo): "Full session — go at intensity". Sub: "Readiness is green and it's the
   final week of your return. Follow the plan, warm up well, and put quality first."
3. **YOUR RETURN TO TRAINING card** (rtp purple accent, light lilac bg): "Week 3 of 3" + `final week`
   chip + `On track ✓` (green). "Almost back to full training — great work. Plan set with your coach."
   → This card appears ONLY when `player.rtpActive`. Compact form (week X/Y + bar + "On track ✓")
   when green/late in the process.
4. **Today's session** header + `MD-4 · LOWER BODY`. Green adaptation banner: "Full session —
   nothing removed ✓ / Readiness is green — go full session with good technique." Exercises list:
   - A · ISO Mid-Thigh Pull · "isometric · tendon load" · `3×5s`
   - B · Trap-bar jump · "Contrast · power" · `4×3`
   - C · Nordic curl · "Hamstring · eccentric" · `3×5`
   Footer: "+2 blocks · ~30 min" · **green** `Start session →` button (CTA colour follows green
   readiness here).
5. **After session · Tendon Reload** row: "10 min — supports tendons + nervous system" (chevron).
6. **RPE · Log yesterday's effort**: "30 sec — tunes tomorrow's plan" (chevron).
7. Muted line: "Daily reminders are off · **manage in More**".
8. Bottom nav: Today · Match · RPE · Dashboard · More.

## 22c — Player Today, HEALTHY (Ísak, green, no RTP)
Identical structure to 22a **minus the return-to-training card** (step 3 removed) — decision flows
straight into the session. Header "Hi, Ísak · MID". Session: Trap-bar deadlift `4×3` (Cluster·strength
@82%), Trap-bar jump `4×3`, Nordic curl `3×5`; "+2 blocks ~55 min"; green `Start session →`. Then
RPE row, then nav. **This is the reference that a healthy player never sees the RTP card.**

---

## 21a — Player Today, ADAPTED / YELLOW day (Kolbeinn, IS, amber)
1. Header "Halló, Kolbeinn" · "Fimmtudagur 3. júlí · MD-2" · streak pill "12 daga streak".
2. **Ákvörðun dagsins**: amber dot + `ÁKVÖRÐUN DAGSINS`. Headline "Léttari dagur". Sub: "Minnkað álag
   — sprint-magnið í gær var óvenju hátt. Æfingin í dag er aðlöguð sjálfkrafa."
3. **Æfing dagsins** + `STYRKUR · NEÐRI LÍKAMI`. Amber adaptation banner: "↓ Aðlöguð — eitt sett tekið
   af hverri lyftu · Reiðuskori er gult í dag, svo við lækkum rúmmálið en höldum gæðunum. **Af hverju?**"
   Exercises (removed set shown struck-through, e.g. `4`→`3`):
   - A · Trap-bar lyfta · "Cluster · 20s hvíld í setti" · ~~4~~`×3` · @80%
   - B1 · Nordic curl · "Ofursett með B2" · `3×5`
   - B2 · Copenhagen planki · "Hvor hlið" · `2×20s`
   Footer "+2 blokkir ~40 min" · **cobalt** `Byrja æfingu` button.
4. **RPE · Skráðu álag gærdagsins** row.
5. `SKOÐA MEIRA` tiles: Leikur · Hreyfing · Yfirlit.
6. Bottom nav: Í dag · Leikur · Yfirlit · Meira.
> Struck-through set + amber banner come from `reduceSetsInLine`/`setReduction` — no new maths.

## 21b — "Byrja æfingu" FOCUS screen (in-session)
1. Header "Æfing dagsins · Styrkur · neðri líkami · aðlöguð −1 sett" + segmented progress bar (5 blocks).
2. Block card: `BLOKK A · 1 AF 5` + `Cluster` chip. "Trap-bar lyfta". Stat row (Archivo numbers):
   `4 sett · 3 reps · 80% af 1RM · 20s hvíld` (the "4" tinted to show adaptation).
3. `HVAÐ ER CLUSTER?` explainer paragraph (method explained in plain language — Cluster/EMOM/AMRAP
   text already exists in `PlayerClient.tsx` ~l.1040–1060).
4. Set chips: `Sett 1 ✓` (done, green) · `2 Núna` (current, cobalt) · `3 Sett 3` (upcoming, muted).
5. **cobalt** `Sett lokið ✓` button. Under it: "Næst: Nordic curl (B1) →".
> One block at a time, method explained, set counter. Optional A/B choice blocks.

## 21c — Player Today, GREEN full day (Ísak, green)
Same skeleton as 21a but GREEN, no adaptation. Header "Halló, Ísak" + "27 daga streak". Ákvörðun
(green): "Klár í fulla æfingu" · "Öll merki græn — svefn, orka og álag í jafnvægi. Keyrðu æfingu
dagsins eins og hún er skrifuð." Æfing dagsins green banner "✓ Full æfing — ekkert tekið af /
Reiðuskori grænt, svo öll settin standa. Sæktu í þig." Exercises Trap-bar lyfta `4×3`, Nordic curl
`3×5`, Trap-bar stökk `4×3`; "+2 blokkir ~55 min"; `Byrja æfingu`. RPE row. Nav.
> Green day = same layout as yellow, only the state (banner colour + no struck sets) changes.

## 21d — Player Today, RETURN-TO-PLAY staged (Andri, rtp purple)
1. Header "Halló, Andri · MD-2" + `ENDURKOMA` badge.
2. **Endurkomu-ferli card** (rtp purple): "Stýrð endurkoma — aftanlæri" · `Stig 3 / 5`. "Þú ferð upp
   í stig 4 þegar sársauki er 0/10 og styrkur ≥90% af hinni hlið. **Ekki hlaupa á fullum hraða enn.**"
   Two metric tiles: `ÁLAGSÞAK Í DAG 70% HSR` · `SÁRSAUKA-HLIÐ 0/10 ✓`.
3. **Endurþjálfun dagsins** + `Sjúkraþj. samþykkt` badge. Numbered list:
   1. Ísómetrísk aftanlæri · "Vefjaálag · sársauki ≤2/10" · `5×20s`
   2. Nordic — stýrt neðurtak · "Sérhæfð progression · stig 3" · `3×4`
   3. Framhlaup — ⅔ hraði · "Undir álagsþaki (70% HSR)" · `6×40m`
   "Sársauka-skráning eftir hverja æfingu" · purple `Byrja →`.
4. **SKILABOÐ FRÁ SJÚKRAÞJÁLFARA** box: "Stoppaðu strax ef sársauki fer yfir 2/10 í aftanlæri. Við
   metum stig 4 á föstudag."
5. Bottom nav: Í dag · Endurhæft · Yfirlit · Meira.
> RTP staged flow is symptom-limited + physio-approved: load is a ceiling ("álagsþak"), pain side is
> the gate. Distinct from the normal session card. This is a separate, deeper mode than 22a's compact
> RTP card.

---

## CTA / colour notes (confirm per screen against the image)
- Primary CTA is cobalt (`Byrja æfingu` / `Sett lokið`). On the EN green-readiness screens (22a/22c)
  the `Start session` button reads green — treat the CTA as primary cobalt by default, and only use
  green if matching those specific green-day mockups. RTP screens use purple.
- Decision dot + banner colour = readiness (green/amber/red). RTP surfaces = purple, always.
- Numbers/stats in Archivo; body in Geist.
