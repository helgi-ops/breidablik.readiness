# Reglur Periodization Hub (MicroPulse)

Staða 25. nóv. 2026 (eftir 2f95a92). Listinn nær yfir allt sem ákveður hvernig tímabilið er skipulagt í
Periodization Hub: Makró (tímabilið), Mesó (lotur, undirbúningur og keppnistímabil), Míkró (vikan og dagurinn)
og það sem hubbinn sýnir um styrk. Reglur sem byggja styrktaræfingu dagsins eru í
[`aefingakerfi-reglur.md`](aefingakerfi-reglur.md); hér er aðeins sá hluti sem hubbinn sjálfur ræður.

Hér er notað:

- **MicroPulse-regla** er regla þjálfarans eða okkar, ekki niðurstaða rannsóknar. Hún er alltaf merkt þannig.
- **Heimild** er stutt tilvísun sem leysist upp í heimildaskrá kerfisins (`references/ruleRefs.ts`,
  `findRefByShort`). Próf (`references/__tests__/ruleRefs.test.ts`) passar að hver tilvísun hér sé skráð.
- Skrár: `PZ/` = `src/lib/micropulse/periodization/`, `WS/` = `weekSetup/`, `SP/` = `strengthProgramming/`,
  `Hub` = `src/app/coach/periodization-hub/page.tsx`. Vísað er í fall eða fasta frekar en línunúmer, svo
  tilvísunin haldist þótt línur færist.

**Hubbinn setur aldrei litinn.** Allt hér er skipulag (lýsandi). Liturinn kemur úr
`v_coach_readiness_today_v8.final_color` og engin regla hér les hann eða breytir honum.

---

## A. Í hvaða röð reglurnar keyra (hvað vinnur hvað)

1. **Makró:** fasar tímabilsins úr leikjaskrá og dagsetningum þjálfarans (`detectSeasonPhases`).
2. **Lotur:** fasarnir skornir í lotur (`buildMesoBlocks`); markmið hverrar lotu (`blockGoalFromSeason`), val
   þjálfara vinnur.
3. **Vika:** dagar vikunnar lagðir út frá leikjum (`buildCalendarBlock`); á undirbúningstímabili fyrst áætlaðir
   laugardagsleikir og æfingar á viku (`buildPreseasonProposal`).
4. **Öryggi:** á keppnistímabili vikureglan (aldrei þrjár æfingar í röð), annars aldrei fleiri en þrír dagar í röð.
5. **Álag dagsins:** hlutfall af leik eftir dagsgerð × vikumargfaldari (stígandi, hámark, hvíldarvika).
6. **Míkró:** vikan er lesin inn í Week setup sem grunnur; vistað val þjálfara vinnur; staðfesting sendir.

Á hverju stigi vinnur val þjálfarans: dagur sem þjálfari setti er aldrei færður eða tekinn af honum.

---

## 1. Makró: tímabilið

| Regla | Hvað gerist | Heimild | Þjálfari / skráning |
|---|---|---|---|
| Fasar (`PZ/index.ts` `detectSeasonPhases`) | Undirbúningstímabil = upphaf → fyrsti **keppnisleikur**. Upphaf: dagsetning þjálfarans ef hún er fyrr, annars fyrsti dagur álagsgagna, annars 42 dögum fyrir fyrsta leik. Keppnistímabil = fyrsti keppnisleikur → lok þjálfarans (ef síðar en síðasti leikur), annars síðasti leikur | MicroPulse-regla | Makró: upphaf, lok, fyrsti deildarleikur |
| Æfingaleikir (`fixtureIsFriendly`) | Æfingaleikur byrjar ekki tímabilið. Merkið á leiknum ræður; án merkis er keppnisheitið lesið (friendl, æfinga, undirb, pre-season, vináttu, test, trial) | MicroPulse-regla | Þjálfari merkir leik sem æfingaleik |
| Frítímabil | Kemur aðeins þegar þjálfari setur lok tímabils. Byrjar daginn eftir lok; stendur til næsta undirbúnings þjálfarans, annars lengd þjálfarans í vikum, annars 10 vikur. Engir leikir, engin létt vika fyrir leik | MicroPulse-regla | Makró |
| Næsti undirbúningur (`PZ/preseasonWindow.ts` `upcomingPreseason`) | Þegar frítímabil er hafið byrjar næsti undirbúningur við lok þess og nær að fyrsta leik næsta tímabils ef hann er skráður, annars jafnlangur síðasta undirbúningi (sjálfgefið 10 vikur) | MicroPulse-regla | Skrá fyrsta leik næsta tímabils |
| Landsleikjahlé (`internationalBreaks.ts`) | Gluggar A-landsliða (FIFA / FIBA) fyrir árin 2026–2027 sýndir sem tillögur. Ekki staðfest hlé í deildinni; þjálfari setur dagsetningar og bætir við sem fríi, sem verður endurhleðslulota í Mesó | FIFA / FIBA dagatal (engin rannsókn) | Þjálfari ræður dagsetningum, bætir við og tekur út |
| Æfingabúðir (`buildCalendarBlock` `camps`) | Æfingadagur í búðum hækkar um valið hlutfall (0–40% í boði, hámark 60%), ofan á leikþakið. Tvær æfingar á dag: frídagur í búðum verður Mixed-æfing. Leikdagar óbreyttir. Sjálfgefið 15% og tvær á dag | MicroPulse-regla | Hub: dagsetningar, hlutfall, tvær á dag |
| Gagnalind (`dataTier`) | GPS + IMA: mikil vissa. GPS: miðlungs. Aðeins RPE (sRPE): lítil. Engin gögn: „skráðu æfingar“. Áætlunin er aldrei lokuð eftir búnaði | MicroPulse-regla | — |

## 2. Lotur (Mesó, bæði tímabil)

| Regla | Hvað gerist | Heimild | Þjálfari / skráning |
|---|---|---|---|
| Lengd lotu | 4, 5 eða 6 vikur (sjálfgefið 4). Hver lota má vera 2–8 vikur (`sliceByLengths`) | MicroPulse-regla | Hub: lengd í Block settings og á hverri lotu |
| Frítímabil (`OFFSEASON_BLOCK_WEEKS`) | Lotur á frítímabili eru alltaf 4 vikur, óháð lotulengd keppnistímabils | Issurin 2010 | Lengd hverrar lotu |
| Frí fyrir uppbyggingu | Ef uppbygging frítímabils byrjar seinna en lok tímabils er bilið ein „Frí“-lota: full hvíld | MicroPulse-regla | Makró: upphaf uppbyggingar |
| Röð markmiða (`blockGoalAt`) | Undirbúningur: fyrsta lota Uppsöfnun, svo Umbreyting og Framkvæmd til skiptis | Issurin 2010 | Markmið hverrar lotu |
| Markmið eftir leikjaplani (`blockGoalFromSeason`) | Frítímabil: Uppsöfnun, svo Umbreyting, aldrei Framkvæmd. Keppni: ≥1,5 leikir á viku → Framkvæmd; leiklaust bil ≥14 dagar í lotunni → næsta í röðinni (endurhleðsla); annars Framkvæmd | Issurin 2010; Martín-García 2018 | Markmið hverrar lotu |
| Endurhleðslulota | Á keppnistímabili: 2+ leiklausar vikur í röð, eða vika sem skarast við skráð frí, verða ein heil lota (ekki skorin) | MicroPulse-regla | Skrá frí |
| **`FIXTURES_PENDING`** | Leiklaust bil sem nær til loka tímabils og er a.m.k. ein lota að lengd = leikjaplanið er ekki komið (ekki hlé). Vikurnar skornar í venjulegar lotur, merktar „Bráðabirgða“, lesnar sem Framkvæmd. Skráð frí helst sem frí | MicroPulse-regla | Skrá leikina; þá festist uppsetningin |
| Áætlaður fyrsti leikur | Ef aðeins fyrsti leikur er þekktur (áætlaður út frá síðasta tímabili) eru keppnislotur Framkvæmd | MicroPulse-regla | Skrá rétta dagsetningu |
| Hvíldarvika (undirbúningur / frítímabil) | Síðasta vika lotunnar, færð á léttustu leikvikuna af tveimur síðustu (jafnt → seinni). Þreytumerki færir hana fremst í lotuna | MicroPulse-regla | Hub: festa hvíldarviku (vinnur) |
| Þreytumerki | Meðalálag lotu ÷ meðalálag 4 vikna á undan: >1,15 hækkandi, <0,9 lækkandi, >1,3 = snögg hækkun. Viðbragð >3 stigum undir 2 vikum á undan = lækkandi. Merkið leggur til; leikmannaplanið breytist aðeins ef þjálfari festir viku | MicroPulse-regla | — |
| Tillaga að markmiði (`recommendBlockGoal`) | Undirbúningur → Uppsöfnun. Leikur innan 3 vikna eða ≥1,5 leikir á viku → Framkvæmd. Annars næsta í röðinni. <3 leikir eða <4 vikna saga → „vísbending, ekki dómur“. Þreyta breytir ekki markmiði | Issurin 2010 | Tillaga; aldrei sett sjálfkrafa |
| Upphaf keppnissíðu (Hub, 2f95a92) | „Mesó: Keppnistímabil“ opnar á lotu vikunnar á tímabili; eftir tímabil á fyrstu lotu næsta tímabils (einu sinni); annars á lotu fyrsta keppnisleiks | MicroPulse-regla | Þjálfari velur aðra lotu |

## 3. Mesó: undirbúningstímabil (`PZ/preseasonProposal.ts`)

| Regla | Hvað gerist | Heimild | Þjálfari / skráning |
|---|---|---|---|
| Áætlaðir laugardagsleikir | Frá „Leikir um helgar frá“ fær hver vika án skráðs leiks leik á laugardegi. Ekki stillt = frá fyrsta skráða æfingaleik. „Engir“ (`GAMES_FROM_NONE`) = aðeins skráðir leikir. Skráður leikur vinnur alltaf | MicroPulse-regla (ákveðin 25. nóv. 2026) | Dagsetning eða „engir“ |
| Leikur vikunnar (`preAssumedGames`) | Þjálfari færir leikinn á annan dag, tekur hann út („enginn leikur þessa viku“) eða bætir við leik fyrir „frá“-dagsetninguna | MicroPulse-regla | Hub: dagaval vikunnar; „Fylgja reglunni“ |
| Æfingar á viku | 3, 4, 5 eða 6 (sjálfgefið 4) | MicroPulse-regla | Hub |
| Vika án leiks (`freeWeekLayout`) | 3: Mech · frí · Loco · frí · Mixed · frí · frí. 4: Mech · Loco · Mixed · frí · Activation · frí · frí. 5: + Mixed á laugardegi. 6: + Loco á fimmtudegi og Mixed á laugardegi, sunnudagur frí. Tveir dagar eftir leik haldast frí; engin MD-merki | MicroPulse-regla | Dagar þjálfara haldast |
| Leikvika og æfingar á viku | Áfyllingardagur telst ekki. Of margar æfingar: Mixed tekin fyrst, svo Activation, Loco, Mech, fjærst leik fyrst. Of fáar: Mixed bætt á frídag fjærst leik, aldrei tvo daga eftir leik | MicroPulse-regla | Dagar þjálfara haldast |
| Vika 1 (`PRESEASON_WEEK1_BASE`) | 1,3× leikur (þjálfari 0,5–3) | MicroPulse-regla; Gabbett 2016 | Hub; breyting færir allan ferilinn um sama hlutfall |
| Toppur | Línulegt frá viku 1 að toppi = min(4,2; max(2,0; 2,2 + 0,35 × (æfingar − 3))) × leikur | MicroPulse-regla; Teixeira 2021; Vanrenterghem 2017 | Æfingar á viku |
| Gólf viku 1 á breytu | Hlutfall af toppi: vegalengd 0,80; háhraði 0,65; löng hlaup (IMA) 0,62; hröðun 0,62; hemlun/stefnubreyting 0,58 | Jeong 2011; Harper 2022 | Hub: vika 1 á hverja breytu |
| Ferill á breytu | Hemlun, háhraði, sprettur, stefnubreyting rísa seint (veldisvísir 1,7); vegalengd og hröðun línulega | Vanrenterghem 2017; Harper 2022; Duhig 2016 | — |
| Hlutur breytu í vikunni | Sprettur < háhraði < vegalengd ≤ hraðanir (veldisvísar: vegalengd 1,0; háhraði 1,5; sprettur 2,2; hröðun 0,9; hemlun 1,0) | Martín-García 2018; Oliva-Lozano 2020; Anderson 2016; Casamichana 2022 | — |
| Létt vika fyrir fyrsta leik | Sjálfgefið −40% af toppvikunni, öll vikan um sama hlutfall. Þjálfari 0–60%. Aðeins ef undirbúningur er ≥3 vikur. Rannsóknabil sýnt: 41–60% | Bosquet 2007; Mujika & Padilla 2003; Clemente 2019c; Gualtieri 2023 (sjálfgefna 40% er MicroPulse-regla) | Hub |
| Æfingaleikur | Telst 0,5 af leik í viku 1 og hækkar línulega í 0,9 í síðustu viku | MicroPulse-regla | — |
| Dagar fylltir að vikumarki (`preseasonDayFit.ts`) | Æfingaleikurinn telst eins og hann er; æfingadagar deila restinni í hlutföllum dagatalsins | MicroPulse-regla | — |
| Viðmið án eigin gagna | 10.000 m, 620 m háhraði (band 5), 180 m sprettur (band 6), 40 hraðanir, 46 hemlanir, 1100 Player Load. Merkt lítil vissa | MicroPulse-regla | Vika 1 á hverja breytu |
| Lotur undirbúnings | Skornar í lotulengd frá upphafi undirbúnings, sama skipting og styrktarsendingin les | Issurin 2010 | Lengd og markmið hverrar lotu |
| Prófaáætlun (`testingSchedule.ts`) | Þolpróf (sjálfgefið 30-15 IFT): vika 1, miðja, síðasta. Hámarksstyrkur: vika 1 og síðasta. Með VALD: CMJ vikulega, NordBord vika 1/miðja/síðasta. Sprettur: vika 1 og síðasta. ≥48 klst hvíld | Buchheit 2008; Mann 2015; Weakley 2021; Claudino 2017; Gathercole 2015; Bourne 2018; Opar 2013; Haugen 2019 | — |
| Próf eftir lotu (`testsForBlock`) | Uppsöfnun: þol + styrkur (+ NordBord, CMJ). Umbreyting: þol + sprettur (+ CMJ). Framkvæmd: aðeins CMJ + sprettur, engin þreytandi próf. Hvíldarvika: CMJ + styrkur | MicroPulse-regla | — |
| Eyður nefndar | Engin eigin leikgögn, fyrsti leikur óskráður eða áætlaður, engir æfingaleikir: sagt berum orðum, aldrei giskað | MicroPulse-regla | — |

## 4. Mesó: keppnistímabil

| Regla | Hvað gerist | Heimild | Þjálfari / skráning |
|---|---|---|---|
| **`INSEASON_THREE_IN_A_ROW`** (`WS/weekRules.ts`) | Aldrei fleiri en 2 æfingadagar í röð. Leikdagur telst ekki og slítur röðina. Fæstir frídagar; röð: MD+2, MD-2, MD+3, MD+4, MD-5, MD-6, MD+5, MD+6, MD-1, MD+1, MD-3, MD-4. MD-2 frí → vinnan færist á MD-3 og MD-1. Í Mesó-dagatalinu fer dagurinn beint í frí | MicroPulse-regla; Buchheit 2023b | Week setup: halda planinu með ástæðu, skráð (`session_fit_override_log`, `week_rule`). Dagur þjálfara aldrei tekinn |
| **`INSEASON_MD2_OFF`** (`WS/autoGrid.ts`) | MD+2 (48 klst eftir leik) er frí; MD+1 er áfylling/endurheimt. Leikur síðustu tvo daga fyrri viku telur. MD-1 aldrei frí. Sunnudagur frí ef enginn leikur | MicroPulse-regla; Buchheit 2023b | Þjálfari getur breytt degi; ⚠ „gegn reglu (þitt val)“ |
| Aðeins skráðir leikir (`noAutoMatch`) | Engir leikir búnir til á keppnistímabili; vika án leiks er æfingavika | MicroPulse-regla | Skrá leiki á Makró |
| Engin sjálfvirk hvíldarvika | Á keppnistímabili er hvíldarvika aðeins ef þjálfari velur; þreytumerki leggur aðeins til létta viku | Malone 2015; Fessi 2016; Moalla 2021 | Hub: velja létta viku |
| Létt vika (`LIGHT_WEEK_VOL`) | Magn ×0,8 (−20%), ákefð haldið, sama dagaröð | Fessi 2016; Moalla 2021 | Val þjálfara |
| Staðalvika (`holdsStandardWeek`) | Framkvæmdarlota á keppnistímabili heldur staðalvikunni: ekkert þrep milli vikna, enginn ×0,75 | Malone 2015; Oliveira 2019 | Breyta markmiði lotu |
| Vika án leiks (`FREE_WEEK_INSEASON`) | Mech · Loco · frí · Mixed · Activation · frí · frí (frídagurinn á undan Mixed svo ekki verði þrjár í röð) | MicroPulse-regla | Dagar þjálfara |
| Vikugerð (`classifyMatchWeek`) | ≤3 dagar í næsta leik = 3-leikja vika; ≤5 = 2-leikja vika; annars venjuleg. Þétt vika sleppir MD-5/-4/-3 | Oliveira 2019 | — |
| Vikumark (`weeklyTargetFromMatch`) | Leikir vikunnar + 0,6 × leikur × viðbragðsþak. Þétt vika er hærri vika, ekki léttari. Áfylling = leikur × (1 − mínútur/90) | Teixeira 2021; Anderson 2016 | — |
| Undirfasar styrks (`inSeasonSubPhase.ts`) | Endur-styrkur ×1,25 (frí eða ≥12 dagar milli leikja); viðhald ×0,5 (2+ leikir eða ≤3 dagar í næsta); sérhæfing ×1 (venjuleg vika); niðurtröppun ×0,6 (síðustu 3 vikur). Meiðslavarnir og kraftæfingar aldrei skalaðar | Issurin 2010; Rønnestad 2011; González-Badillo & Sánchez-Medina 2010; Suchomel 2016; Mujika 2003 | — |

## 5. Míkró: vikan og dagurinn (`buildCalendarBlock`)

| Regla | Hvað gerist | Heimild | Þjálfari / skráning |
|---|---|---|---|
| MD-merki | Venjuleg vika: MD+1 og MD+2 eftir leik, svo talið niður MD-N. Lengra en 7 dagar í næsta leik: nær leikur ræður | Owen 2017 | — |
| Dagar eftir leik | MD+1 = áfylling (endurheimt fyrir byrjunarlið, uppbót fyrir leikmenn undir 60 mín), MD+2 = frí | MicroPulse-regla | — |
| Dagaröð að leik | Talið aftur frá leik: MD-1 Activation, MD-2 frí, MD-3 Mixed, MD-4 Locomotive, MD-5 Mechanical (þar sem dagar eru til). Þröng vika: Loco · Mixed · frí. Hvíldarvika: Loco · frí · Mixed · frí · Activation. Framkvæmd (ekki staðalvika): Mechanical út, frí inn | Mujika 2003; Issurin 2010; Owen 2017 | Dagur og dagsgerð þjálfara vinnur |
| Háhraði og vélrænt aldrei sama dag | Mechanical-dagur = hraðanir/hemlun, lágur háhraði; Locomotive = háhraði og löng hlaup | MicroPulse-regla | — |
| Hlutfall af leik eftir dagsgerð (`CAL_SHARE`) | Vegalengd / háhraði / Player Load: Mechanical 0,45 / 0,25 / 1,10; Locomotive 0,55 / 0,45 / 0,55; Mixed 0,70 / 0,30 / 0,85; Activation 0,30 / 0,15 / 0,40; Áfylling 0,40 / 0,25 / 0,40 | MicroPulse-regla | — |
| IMA hraðanir/hemlun/stefnubreytingar (`CAL_SHARE_IMA`) | Mechanical 0,80; Mixed 0,60; Áfylling 0,55; Locomotive 0,50 (rammagildi, ekki mælt); Activation 0,38 | Stevens 2017; Martín-García 2018; Silva 2022 | — |
| Ákafar hraðanir, háhraði, sprettur (`CAL_SHARE_HI`) | Gildi á dagsgerð með bili og merki (mælt / afleitt / rammi). Sprettur er óvissasta talan | Stevens 2017; Martín-García 2018; Lacome 2018; Dalen 2019; Gualtieri 2023 | — |
| Eigið viðmið liðsins (`calibrateImaShares`) | ≥30 æfingadagar og ≥10 leikraðir: eigin gildi liðsins sýnd **til samanburðar**, aldrei sem markmið | MicroPulse-regla | — |
| Hækkun milli vikna (`AXIS_RATE`) | Vegalengd 8%, Player Load 8%, hraðanir/hemlun 7%, löng hlaup 6%, háhraði 5% á viku. Þak ×1,4. Hlaupaásar ná aldrei yfir leik á einni æfingu; vélræn vinna má fara yfir | Malone 2017; Gabbett 2016 | Viðbragð / VALD lækkar þakið |
| Magn eftir markmiði (`GOAL_VOL`) | Uppsöfnun ×1,10; Umbreyting ×0,95; Framkvæmd ×0,75 | Issurin 2010 | Markmið lotu |
| Dýpt hvíldarviku (`GOAL_DELOAD`) | Magn / ákefð: Uppsöfnun 0,75 / 0,75; Umbreyting 0,60 / 0,60; Framkvæmd 0,45 / 0,70; ekkert markmið 0,6 / 0,6 | Bosquet 2007; Mujika & Padilla 2003 | — |
| Öryggi utan keppnistímabils | Aldrei fleiri en 3 dagar í röð (leikur og áfylling telja); dagur þjálfara aldrei tekinn | MicroPulse-regla | — |
| Álag MD-daga (`plannedSessionLoad.ts`) | % af leik: MD-4 85 (RPE 8, 90 mín), MD-3 68, MD-2 50, MD-1 32, MD+1 22, MD-5 60, MD+2 35 (ef æft) | Martín-García 2018; MicroPulse-regla (24. nóv. 2026) | — |
| VALD-lækkun (`valdVolumeCap`) | Hoppróf ≤7 daga gamalt: við eigin getu 100%, 5–10% undir 85%, 10%+ undir 70%. Munur hægri/vinstri í aftanlæri: fylgst með, lækkar ekki | Claudino 2017; 85% og 70% eru MicroPulse-regla | Þjálfari lyftir lækkun fyrir leikmann og viku, skráð og afturkræft |
| Grunnur Week setup (`PZ/mesoWeek.ts`, `PZ/mesoSeed.ts`) | Vika sem enginn hefur vistað er lesin úr Mesó. Síðasta breyting vinnur milli vistaðrar viku og Mesó | MicroPulse-regla | — |
| Fasi vikunnar (`WS/weekPhase.ts`) | Fasi sem þjálfari vistaði, annars Makró-fasinn sem nær yfir vikuna | MicroPulse-regla | Week setup |
| Staðfesting (`WS/confirmation.ts`) | „Staðfest“, „Breytt frá staðfestingu“ eða „Óstaðfest“. Engin tilkynning til leikmanna | MicroPulse-regla | „Staðfesta viku → leikmenn“ |

## 6. Styrkur í hubbnum

| Regla | Hvað gerist | Heimild | Þjálfari / skráning |
|---|---|---|---|
| Markmið lotu → styrkgæði (`SP/seasonPhaseStrength.ts` `strengthForBlockGoal`) | Uppsöfnun á undirbúningi/frítímabili: 65–80% 1RM, 3–4 × 8–12. Uppsöfnun á keppnistímabili: 80–90%, 4–5 × 4–6. Umbreyting: 70–85%. Framkvæmd: 30–60%. Hvíldarvika: ákefð haldið, magn −40–50% | Issurin 2010; González-Badillo & Sánchez-Medina 2010; Suchomel 2016; Rønnestad 2011 | Styrktarreglur þjálfara á lotu × fasa |
| Þungar endurtekningar á viku (`SP/weekRule.ts`) | Leikvika: keppni/frítímabil MD-4 9 + MD-3 6 = 15; undirbúningur 12 + 9 = 21; MD-5 +6. Vika án leiks: 15 / 21, mest 3 þungir dagar, aldrei tveir í röð | Rønnestad 2011 o.fl. (sjá aefingakerfi-reglur.md §3); skiptingin er MicroPulse-regla | Endurtekningar í setti 1–5 á dag |
| Sendiháttur (`SP/sendMode.ts`) | Staðlað: æfingakerfi liðsins á hverjum MD-degi (vikudegi í körfubolta) eða viðvörun „ekkert kerfi“. Einstaklings: gögn + skimun. Einstaklings + markmið: markmið bæta við aðeins á undirbúningi/frítímabili | MicroPulse-regla | Æfing dagsins → sendiháttur |

## 7. Körfubolti

| Regla | Hvað gerist | Heimild |
|---|---|---|
| Æfingadagar (`standardTrainingDays`) | 0–1 leikur: MD-3, MD-2, MD-1. 2 leikir: MD-2, MD-1. 3+: MD-1 | MicroPulse-regla |
| Vikugerðir (`WS/gameDensity.ts`) | Enginn leikur: uppbyggingargluggi. Einn leikur: ekki vanáætla vikuna. Tveir: bæta á varamenn (undir 0,5 af miðgildi mínútna). Þrír: þyngsta vikan, þriðji leikurinn þyngstur. Langtímaálag ætti ekki að hreyfast meira en 10% á viku | Salazar 2020; Conte 2018; Power 2024; Paulauskas 2019 |
| Annað | Leikjaplan frá KKÍ, landsleikjagluggar frá FIBA, æfingakerfi eftir vikudegi | — |

## 8. Aðeins til sýnis (ræður engu)

- **ACWR** er sýnt sem umdeilt sjónarhorn: spáir ekki fyrir um meiðsli og er ekki markmið (Impellizzeri 2020).
  Leiðandi mælikvarði er álag vikunnar í leikjum talið (vikuálag ÷ einn leikur).
- **Þreytumerki** leggur til létta viku eða að færa hvíldarviku; leikmannaplanið breytist aðeins ef þjálfari velur.
- **Eigið IMA-viðmið liðsins** er borið saman við rannsóknabilið, aldrei sett sem markmið.
- **Tillaga að markmiði lotu** er aldrei sett sjálfkrafa.

---

## C. Ósamræmi sem fannst (þitt að ákveða)

1. ~~**Áfylling á MD+1: 30 eða 60 mín.**~~ **Lagað 25. nóv.:** útreikningurinn (`STARTER_MINUTES = 60`) og
   dagatalið sögðu 60; vikutaflan og Mesó-athugasemdirnar sögðu 30. Textinn segir nú „undir 60 mín“. Styrktarþrep
   MD+1 (undir 30 / 30–59 / 60+ mín, `md1Tier.ts`) eru önnur regla og óbreytt.
2. ~~**MD+2-reglan vísaði í ranga grein.**~~ **Lagað 25. nóv.:** tilvísunin án „b“ vísar í grein Buchheit og félaga um spretti nálægt
   hámarkshraða; greinin um hvíld á MD+2 er „Buchheit 2023b“. Lagað í hubbnum, `plannedSessionLoad.ts`,
   `periodizationModel.ts` og `aefingakerfi-reglur.md`.
3. ~~**Hvaða MD-dagur er þyngstur.**~~ **Lagað 26. nóv.:** MD-4 er þyngsti æfingadagurinn alls staðar. Sjálfgefnu
   margfaldararnir í vikutöflunni (`mdWeekTargets`) eru nú MD-4 1,15 og MD-3 1,1 (voru 1,1 og 1,15), og Mixed er ekki
   lengur kallaður „stærsta æfingin“ (dagatalið, MD-taflan, hugmyndir dagsins), heldur leiklíkt áreiti með jafnvægi
   háhraða og vélræns. **Enn opið:** álagstafla dagsins (`plannedSessionLoad.ts`) merkir MD-4 Mechanical og MD-3
   Locomotive, en dagatalið og vikutaflan leggja MD-4 sem Locomotive og MD-3 sem Mixed. Þjálfarinn hélt tegundunum
   24. nóv.; bíður ákvörðunar.
4. ~~**Tvær styrktartöflur fyrir Uppsöfnun á undirbúningi.**~~ **Lagað 26. nóv.:** athugasemdin neðst á dagatalinu og
   rannsóknarviðmiðið fyrir leikmann án VBT lesa nú sömu töflu og styrkhluti hubbsins (`strengthSchemeFor` →
   `strengthForBlockGoal`): Uppsöfnun á undirbúningi 65–80% 1RM, 3–4 × 8–12; á keppnistímabili 80–90%, 4–5 × 4–6.
   Gamla 85–95% taflan er farin. Hraðabil (m/s) er aðeins sýnt fyrir umbreytingu og framkvæmd, þar sem %1RM-bilið
   passar við rannsóknirnar.
5. ~~**„ACWR-öruggt“ í texta vikunnar.**~~ **Lagað 26. nóv.:** textinn segir nú „Vex jafnt að toppi“; próf passar að
   ACWR komi ekki fyrir í textum stígandans.
6. ~~**Sjálfgefin létt vika fyrir fyrsta leik (40%)**~~ **Lagað 26. nóv.:** við reitinn, í skýringunni og í
   undirbúningsspjaldinu stendur nú að sjálfgefna 40% sé val þjálfarans, rétt undir rannsóknabilinu 41–60%. Gamla
   merkið á vikunni („magn −55%, hraða haldið betur −30%“) var úrelt og segir nú að öll vikan lækki um sama hlutfall.

## Óstaðfestar tilvísanir

Þessar tilvísanir eru í kóðanum en leysast ekki upp í heimildaskrá og eru því ekki notaðar sem heimild hér:
„Little & Buchheit“ og „Figueiredo“ (ekkert ár, engin skráning), Buchheit 2024 (11 meginreglur vikuhringsins;
ekki fundin sem ritrýnd grein) og Cazorla 1990 (VAMEVAL-próf). Reglurnar sem þær standa við eru merktar
MicroPulse-regla.

## Heimildir

Fullar heimildir fyrir stuttu tilvísanirnar hér að ofan, úr heimildaskrá kerfisins
(`src/lib/micropulse/references/ruleRefs.ts`, `findRefByShort`; sama listi og
[`heimildir-aefingakerfis.md`](heimildir-aefingakerfis.md)).

- Anderson L, Orme P, Di Michele R, Close GL, Morgans R, Drust B, Morton JP. Quantification of training load during one-, two- and three-game week schedules in professional soccer players from the English Premier League: implications for carbohydrate periodisation. J Sports Sci 2016;34(13):1250–1259. doi:10.1080/02640414.2015.1106574 PMID 26536538
- Bosquet L, Montpetit J, Arvisais D, Mujika I. Effects of tapering on performance: a meta-analysis. Med Sci Sports Exerc 2007;39(8):1358–1365. doi:10.1249/mss.0b013e31806010e0 PMID 17762369
- Bourne MN, Timmins RG, Opar DA, Pizzari T, Ruddy JD, Sims C, Williams MD, Shield AJ. An Evidence-Based Framework for Strengthening Exercises to Prevent Hamstring Injury. Sports Med 2018;48(2):251–267. doi:10.1007/s40279-017-0796-x PMID 29116573
- Buchheit M, Settembre M, Hader K, McHugh D. Exposures to near-to-maximal speed running bouts during different turnarounds in elite football: association with match hamstring injuries. Biol Sport 2023;40(4):1057–1067. doi:10.5114/biolsport.2023.125595 PMID 37867737
- Buchheit M, Settembre M, Hader K, McHugh D. Planning the Microcycle in Elite Football: To Rest or Not to Rest?. Int J Sports Physiol Perform 2023;18(3):293–299. doi:10.1123/ijspp.2022-0146 PMID 36596310
- Buchheit M. The 30-15 intermittent fitness test: accuracy for individualizing interval training of young intermittent sport players. J Strength Cond Res 2008;22(2):365–374. doi:10.1519/JSC.0b013e3181635b2e PMID 18550949
- Casamichana D, Martín-García A, Díaz AG, Bradley PS, Castellano J. Accumulative weekly load in a professional football team: with special reference to match playing time and game position. Biol Sport 2022;39(1):115–124. doi:10.5114/biolsport.2021.102924 PMID 35173370
- Claudino JG, Cronin J, Mezêncio B, McMaster DT, McGuigan M, Tricoli V, Amadio AC, Serrão JC. The countermovement jump to monitor neuromuscular status: A meta-analysis. J Sci Med Sport 2017;20(4):397–402. doi:10.1016/j.jsams.2016.08.011 PMID 27663764
- Clemente FM, Rabbani A, Conte D, Castillo D, Afonso J, Truman Clark CC, Nikolaidis PT, Rosemann T, Knechtle B. Training/Match External Load Ratios in Professional Soccer Players: A Full-Season Study. Int J Environ Res Public Health 2019;16(17):3057. doi:10.3390/ijerph16173057 PMID 31443592
- Conte D, Kolb N, Scanlan AT, Santolamazza F. Monitoring Training Load and Well-Being During the In-Season Phase in National Collegiate Athletic Association Division I Men's Basketball. Int J Sports Physiol Perform 2018;13(8):1067–1074. doi:10.1123/ijspp.2017-0689 PMID 29431544
- Dalen T, Sandmæl S, Stevens TGA, Hjelde GH, Kjøsnes TN, Wisløff U. Differences in Acceleration and High-Intensity Activities Between Small-Sided Games and Peak Periods of Official Matches in Elite Soccer Players. J Strength Cond Res 2021;35(7):2018–2024. Published ahead of print 2019. doi:10.1519/JSC.0000000000003081 PMID 30741867
- Duhig S, Shield AJ, Opar D, Gabbett TJ, Ferguson C, Williams M. Effect of high-speed running on hamstring strain injury risk. Br J Sports Med 2016;50(24):1536–1540. doi:10.1136/bjsports-2015-095679 PMID 27288515
- Fessi MS, Zarrouk N, Di Salvo V, Filetti C, Barker AR, Moalla W. Effects of tapering on physical match activities in professional soccer players. J Sports Sci 2016;34(24):2189–2194. doi:10.1080/02640414.2016.1171891 PMID 27065344
- Gabbett TJ. The training-injury prevention paradox: should athletes be training smarter and harder?. Br J Sports Med 2016;50(5):273–280. doi:10.1136/bjsports-2015-095788 PMID 26758673
- Gathercole R, Sporer B, Stellingwerff T, Sleivert G. Alternative countermovement-jump analysis to quantify acute neuromuscular fatigue. Int J Sports Physiol Perform 2015;10(1):84–92. doi:10.1123/ijspp.2013-0413 PMID 24912201
- González-Badillo JJ, Sánchez-Medina L. Movement velocity as a measure of loading intensity in resistance training. Int J Sports Med 2010;31(5):347–352. doi:10.1055/s-0030-1248333
- Gualtieri A, Rampinini E, Dello Iacono A, Beato M. High-speed running and sprinting in professional adult soccer: Current thresholds definition, match demands and training strategies. A systematic review. Front Sports Act Living 2023;5:1116293. doi:10.3389/fspor.2023.1116293 PMID 36860737
- Harper DJ, McBurnie AJ, Dos'Santos T, Eriksrud O, Evans M, Cohen DD, Rhodes D, Carling C, Kiely J. Biomechanical and Neuromuscular Performance Requirements of Horizontal Deceleration: A Review with Implications for Random Intermittent Multi-Directional Sports. Sports Med 2022;52(10):2321–2354. doi:10.1007/s40279-022-01693-0 PMID 35643876
- Haugen T, Seiler S, Sandbakk Ø, Tønnessen E. The training and development of elite sprint performance: an integration of scientific and best practice literature. Sports Med Open 2019. doi:10.1186/s40798-019-0221-0
- Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ. Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls. Int J Sports Physiol Perform 2020;15(6):907–913. doi:10.1123/ijspp.2019-0864 PMID 32502973
- Issurin VB. New horizons for the methodology and physiology of training periodization. Sports Med 2010;40(3):189–206. doi:10.2165/11319770-000000000-00000 PMID 20199119
- Jeong TS, Reilly T, Morton J, Bae SW, Drust B. Quantification of the physiological loading of one week of "pre-season" and one week of "in-season" training in professional soccer players. J Sports Sci 2011;29(11):1161–1166. doi:10.1080/02640414.2011.583671 PMID 21777053
- Lacome M, Simpson BM, Cholley Y, Lambert P, Buchheit M. Small-Sided Games in Elite Soccer: Does One Size Fit All? Int J Sports Physiol Perform 2018;13(5):568–576. doi:10.1123/ijspp.2017-0214 PMID 28714774
- Malone JJ, Di Michele R, Morgans R, Burgess D, Morton JP, Drust B. Seasonal training-load quantification in elite English premier league soccer players. Int J Sports Physiol Perform 2015;10(4):489–497. doi:10.1123/ijspp.2014-0352 PMID 25393111
- Malone S, Roe M, Doran DA, Gabbett TJ, Collins K. High chronic training loads and exposure to bouts of maximal velocity running reduce injury risk in elite Gaelic football. J Sci Med Sport 2017;20(3):250–254. doi:10.1016/j.jsams.2016.08.005 PMID 27554923
- Mann JB, Ivey PA, Sayers SP. Velocity-based training in football. Strength Cond J 2015;37(6):52–57. doi:10.1519/SSC.0000000000000177
- Martín-García A, Gómez Díaz A, Bradley PS, Morera F, Casamichana D. Quantification of a Professional Football Team's External Load Using a Microcycle Structure. J Strength Cond Res 2018;32(12):3511–3518. doi:10.1519/JSC.0000000000002816 PMID 30199452
- Moalla W, Fessi MS, Nouira S, Mendez-Villanueva A, Di Salvo V, Ahmaidi S. Optimal Pretaper Phase on Physical Match Performance in Professional Soccer. Int J Sports Physiol Perform 2021;16(10):1483–1489. doi:10.1123/ijspp.2020-0334 PMID 33761460
- Mujika I, Padilla S. Scientific bases for precompetition tapering strategies. Med Sci Sports Exerc 2003;35(7):1182–1187. doi:10.1249/01.MSS.0000074448.73931.11 PMID 12840640
- Oliva-Lozano JM, Gómez-Carmona CD, Pino-Ortega J, Moreno-Pérez V, Rodríguez-Pérez MA. Match and Training High Intensity Activity-Demands Profile During a Competitive Mesocycle in Youth Elite Soccer Players. J Hum Kinet 2020;75:195–205. doi:10.2478/hukin-2020-0050 PMID 33312307
- Oliveira R, Brito J, Martins A, Mendes B, Calvete F, Carriço S, Ferraz R, Marques MC. In-season training load quantification of one-, two- and three-game week schedules in a top European professional soccer team. Physiol Behav 2019;201:146–156. doi:10.1016/j.physbeh.2018.11.036 PMID 30529511
- Opar DA, Piatkowski T, Williams MD, Shield AJ. A novel device using the Nordic hamstring exercise to assess eccentric knee flexor strength: a reliability and retrospective injury study. J Orthop Sports Phys Ther 2013;43(9):636–640. doi:10.2519/jospt.2013.4837 PMID 23886674
- Owen AL, Lago-Peñas C, Gómez MÁ, Mendes B, Dellal A. Analysis of a training mesocycle and positional quantification in elite European soccer players. Int J Sports Sci Coach 2017;12(5):665–676. doi:10.1177/1747954117727851
- Paulauskas H, Kreivyte R, Scanlan AT, Moreira A, Siupsinskas L, Conte D. Monitoring Workload in Elite Female Basketball Players During the In-Season Phase: Weekly Fluctuations and Effect of Playing Time. Int J Sports Physiol Perform 2019;14(7):941–948. doi:10.1123/ijspp.2018-0741 PMID 30676809
- Power CJ, Fox JL, Teramoto M, Dalbo VJ, Scanlan AT. Training and Game Loads Across Noncongested and Congested Weekly Microcycles During the Regular Season in a Semiprofessional Women's Basketball Team. Int J Sports Physiol Perform 2024;19(12):1455–1466. doi:10.1123/ijspp.2023-0448 PMID 39374918
- Rønnestad BR, Nymark BS, Raastad T. Effects of in-season strength maintenance training frequency in professional soccer players. J Strength Cond Res 2011;25(10):2653–2660. PMID 21873897
- Salazar H, Svilar L, Aldalur-Soto A, Castellano J. Differences in Weekly Load Distribution Over Two Euroleague Seasons with a Different Head Coach. Int J Environ Res Public Health 2020;17(8):2812. doi:10.3390/ijerph17082812 PMID 32325842
- Silva H, Nakamura FY, Beato M, Marcelino R. Acceleration and deceleration demands during training sessions in football: a systematic review. Sci Med Football 2022. doi:10.1080/24733938.2022.2090600
- Stevens TGA, de Ruiter CJ, Twisk JWR, Savelsbergh GJP, Beek PJ. Quantification of in-season training load relative to match load in professional Dutch Eredivisie football players. Sci Med Football 2017;1(2):117–125. doi:10.1080/24733938.2017.1282163
- Suchomel TJ, Nimphius S, Stone MH. The Importance of Muscular Strength in Athletic Performance. Sports Med 2016;46(10):1419–1449. doi:10.1007/s40279-016-0486-0 PMID 26838985
- Teixeira JE, Forte P, Ferraz R, Leal M, Ribeiro J, Silva AJ, Barbosa TM, Monteiro AM. Monitoring Accumulated Training and Match Load in Football: A Systematic Review. Int J Environ Res Public Health 2021;18(8). doi:10.3390/ijerph18083906 PMID 33917802
- Vanrenterghem J, Nedergaard NJ, Robinson MA, Drust B. Training Load Monitoring in Team Sports: A Novel Framework Separating Physiological and Biomechanical Load-Adaptation Pathways. Sports Med 2017;47(11):2135–2142. doi:10.1007/s40279-017-0714-2 PMID 28283992
- Weakley J, Mann B, Banyard H, McLaren S, Scott T, Garcia-Ramos A. Velocity-based training: from theory to application. Strength Cond J 2021;43(2):31–49.
