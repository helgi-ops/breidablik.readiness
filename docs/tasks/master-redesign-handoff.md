# MicroPulse — MASTER handoff fyrir Claude Code (skref-fyrir-skref)

> **Hvernig á að nota þetta skjal:** Ekki líma allt inn í einu. Gefðu Claude Code **eitt skref
> í einu**, í röð. Eftir hvert skref: keyrðu appið, berðu saman við sjónrænu viðmiðunina, og
> staðfestu áður en þú ferð í næsta skref. Hvert skref endar á **STOPP — staðfestu**.
>
> **Sjónræn viðmiðun (opnaðu til hliðar við CC):** `Coach Dashboard Hugmyndir.dc.html`
> — umferð 4a/10a/11a/19a (coach), 22a (player Today leiðrétt), 21a–c (æfing), 14a (player nav).
>
> **Gullnu reglurnar (gilda í hverju skrefi):**
> 1. Engin ný gögn, engin ný API-köll — allt er þegar sótt. Þetta er þema + röð + framsetning.
> 2. Enska sjálfgefin; íslenska eitt tap í burtu (strengir eru þegar tvítyngdir).
> 3. Explainability alls staðar: úrskurður → traust → „á bak við tölurnar".
> 4. Ekki fjarlægja virkni — færa/fela í mesta lagi. Enginn flipi/hlekkur tapast.
> 5. Litlir bútar. Ef skref snertir >2 skrár eða >~150 línur, skiptu því frekar í tvennt.

Ítarleg skjöl per svæði (vísað í hér að neðan): `Fasi 1/2/3`, `Player app`, `Player Today (14a)`,
`Player Today LEIÐRÉTTING`, `Æfing á Today`, `Game Report + Movement`.

---

## RÖÐ — 8 lotur

Farðu í þessari röð. Þema fyrst (slær í gegnum allt), svo coach, svo player.

| Lota | Hvað | Nánar í skjali |
|---|---|---|
| A | Þema (globals.css) | Fasi 1 |
| B | Coach „Today" endurraðað | Fasi 2 |
| C | Coach sigling + drawer | Fasi 3 |
| D | Player þema + dagslykkja | Player app (fasi 1) |
| E | Player „Today" leiðrétt röð | Player Today LEIÐRÉTTING + 14a |
| F | Æfing dagsins á Today | Æfing á Today |
| G | Game Report + Movement | Game Report + Movement |
| H | Fínpússun + samræming | — |

---

## LOTA A — Þema

**Skref A1.** Í `src/app/globals.css`: settu inn litatökana — beinhvítt `#f4f2ec`, ink `#14181c`,
kóbalt-primary `#2740e6`, umferðarljós grænt `#1c7a4a` / gult `#de9328` / rautt `#a83e28`, RTP-fjólublátt `#7a5cc4`.
Ekki breyta markup enn. **STOPP — staðfestu að litir birtast, ekkert brotnaði.**

**Skref A2.** Bættu við letri: Archivo (fyrirsagnir/tölur) + Geist (texti). `--font` tökar + `@font-face`/`next/font`.
**STOPP — staðfestu að letur hleðst.**

**Skref A3.** Samræmdu kort/radíus/skugga/merki við mockup-gildin (Fasi 1 §kort). **STOPP.**

---

## LOTA B — Coach „Today" (sjá Fasi 2)

**Skref B1.** Búðu til `TodayCommandCenter.tsx` (AI-samantekt + úrskurður + talning Ready/Modified/Recovery/Tomorrow).
Gögn: `data.summary.green/yellow/red`, `checkedIn/total`. **STOPP.**

**Skref B2.** Búðu til `AttentionList.tsx` — einn forgangsraðaður listi úr `[...alerts, ...monitors]`,
ALERT fyrst, `attentionReason[0]` sem ástæða, `UNFAMILIAR LOAD` merki þar sem við á. **STOPP.**

**Skref B3.** Skiptu út gömlu banner-stæðunni í „Í dag" fyrir: CommandCenter → AttentionList → hópatafla.
Færðu djúp S&C-kort (LoadVerdict/IMA/Calibration/Unfamiliar) undir „Sýna nánar". **STOPP — berðu við 4a/10a.**

**Skref B4.** `PlayerDecisionDrawer.tsx` — opnast við klikk á leikmann (líka grænan). Óvanalegt álag
sem eigin borði með samanburði + litareglu (≥70% → rautt). Sjá 11a. **STOPP.**

**Skref B5.** „Á bak við tölurnar" sheet á percentíl + ACWR (19a). **STOPP.**

---

## LOTA C — Coach sigling (sjá Fasi 3)

**Skref C1.** Endurstíla `CoachSidebar.tsx` — halda ALLRI rökfræði (kaflar, localStorage, tiers,
force-open). Aðeins nýtt þema + þéttari stíll + kóbalt virkur-kantur. **STOPP — staðfestu tiers + minni virka.**

**Skref C2.** (Valfrjálst, á bak við flagg) Táknarönd 3B — aðeins ef notendapróf styður. Sleppa annars.

**Skref C3.** Stækka drawer í fullt dýpi: RPE + GPS + IMA saman (6a), 7/28-daga þróun, override. **STOPP.**

---

## LOTA D — Player þema + dagslykkja (sjá Player app)

**Skref D1.** Player erfir þemað úr Lotu A. Staðfestu að player-skjáir nota sömu liti/letur. **STOPP.**

**Skref D2.** Morgun-innskráning: útskýring við **hverja** spurningu (ekki bara heild). `why:`-lyklar
eru til í `playerCopy.ts`. **STOPP.**

**Skref D3.** Eftir-æfingu RPE: útskýring + saga leikmanns fyrir neðan. **STOPP.**

**Skref D4.** „Á bak við tölurnar" á reiðuskori. **STOPP.**

---

## LOTA E — Player „Today" leiðrétt röð (sjá LEIÐRÉTTING + 14a) ⚠ mikilvægast

Þetta er lotan sem klikkaði síðast. Farðu HÆGT, eitt skref í einu.

**Skref E1.** Færðu dev-chips (Integrations · Unlocked · FULL · Sign out) af Today → More/Settings.
Haltu aðeins litlum IS/EN toggle á Today. **STOPP — Today á að vera laus við debug-chips.**

**Skref E2.** Sameinaðu reiðuskori í **eina** blokk efst: reiðuskori-litur + fyrirsögn + MD-4 chip +
ein útskýringarlína. Fjarlægðu grænu stak-málsgreinina („Your body is showing good readiness…") og
láttu „Today's outlook" renna inn. Session-borðinn má standa sem staðfesting. **STOPP — reiðuskori sagt EINU SINNI.**

**Skref E3.** Fastsettu röð Today: haus → ákvörðun → (RTP-kort ef `rtpActive`) → session → after-session
→ RPE → nudges sem EIN lína. Session verður að vera **fyrir ofan** allt nudges-efni. **STOPP — berðu við 22a.**

**Skref E4.** RTP-kort: sér kort, birtist AÐEINS þegar `player.rtpActive`. Compact (vika X/Y + rönd +
„On track ✓") þegar grænn/seint í ferli; fullt dýpi (stig/þak/sársauki) á fyrri stigum. Heilbrigður
leikmaður sér það EKKI. **STOPP — prófaðu bæði rtpActive og ekki.**

**Skref E5.** Vikulisti („training volume, running distance…") → ein mannamáls-setning eða falinn.
Ekki 8-liða kommu-hrúga. **STOPP.**

**Skref E6.** Botn-nav forgangur: Today · Match/Game Report · Dashboard · More (Movement + RPE-saga
undir More). Kortlagt á `PWA_PRIMARY_TABS`/`SECONDARY_TABS`, tiers óbreyttir. **STOPP.**

---

## LOTA F — Æfing dagsins á Today (sjá Æfing á Today)

**Skref F1.** Æfing dagsins sem aðgerða-kort beint undir ákvörðun (og RTP-korti ef til). **STOPP.**

**Skref F2.** Aðlögunar-borði fylgir reiðuskori: grænt „full session — nothing removed" / gult „−1 sett"
/ rautt „létt". Yfirstrikuð sett úr `reduceSetsInLine`/`setReduction` (engin ný reiknivinna). **STOPP — prófaðu grænt+gult.**

**Skref F3.** „Byrja æfingu" fókus-skjár: ein blokk, aðferð útskýrð (Cluster/EMOM/AMRAP textar eru
þegar til í `PlayerClient.tsx` l.1040–1060), sett-teljari, val-blokkir (A/B). **STOPP.**

> Utan umfangs í þessari lotu: sjúkraþjálfara-samþykkt endurþjálfun (RTP-æfingar) — aðskilið verk.

---

## LOTA G — Game Report + Movement (sjá Game Report + Movement)

**Skref G1.** Game Report þema-endurstíll. HALDA Engine/Driver ramma + IMA-orðalista + per-90 súlurit
+ print-stíl. **STOPP — staðfestu að útskýringar + print haldast.**

**Skref G2.** „Á bak við tölurnar" á hvert benchmark, endurnýttir orðalista-textar. **STOPP.**

**Skref G3.** Match Movement í sama anda. ⚠ Staðfestu fyrst hvaða GPS-hreyfi­gögn bakendinn skilar
raunverulega — ekki finna upp mælingar. **STOPP.**

---

## LOTA H — Fínpússun

**Skref H1.** Farðu yfir alla skjái: sama þema, sömu kort, samræmt bil. **STOPP.**
**Skref H2.** Staðfestu enska sjálfgefin alls staðar; IS-toggle virkar. **STOPP.**
**Skref H3.** Prófaðu tiers (Lite/Full/GPS/PT, free/pro) — ekkert brotnaði. **STOPP.**

---

## Heildar-acceptance (í lokin)
- [ ] Þema samræmt á coach + player.
- [ ] Coach „Í dag": ákvörðun-fyrst, einn athygli-listi, hópatafla + drawer.
- [ ] Coach sigling einfaldari, engin virkni tapaðist.
- [ ] Player Today: reiðuskori einu sinni, session fyrir ofan nudges, engir dev-chips.
- [ ] RTP sér kort, aðeins þegar `rtpActive`.
- [ ] Æfing dagsins á Today með reiðuskori-aðlögun (yfirstrikuð sett).
- [ ] Game Report/Movement: nýtt þema, explainability haldið, print heilt.
- [ ] Enska sjálfgefin; explainability alls staðar; engin ný API-köll.

---

### Af hverju skref-fyrir-skref?
Stór „endurhannaðu alla síðuna" prompt lætur CC taka margar ákvarðanir í einu — þá tapast röð/hierarkía
(eins og gerðist á Today: réttir íhlutir, röng röð). Lítil skref með STOPP láta þig grípa frávik strax
og bakka einu skrefi, ekki heilli síðu. Berðu hvert skref við sjónrænu viðmiðunina (22a o.fl.).
