# Reglur æfingakerfisins (MicroPulse)

Staða 23. nóv. 2026 (commit 8d487b4). Listinn nær yfir allt sem ákveður hvað leikmaðurinn fær að æfa: styrk í sal,
markmiðsplön, vikuuppbyggingu og afhendingu á „Í dag“.

Hér er notað:

- **Regla** er auðkennið sem sést í skránni yfir breytingar (`AppliedAdaptation.ruleId`).
- **MicroPulse-regla** er regla þjálfarans eða okkar, ekki niðurstaða rannsóknar. Hún er alltaf merkt þannig.
- Skrár: `SP/` = `src/lib/micropulse/strengthProgramming/`, `GP/` = `goalPlan/`, `WS/` = `weekSetup/`,
  `PZ/` = `periodization/`.

**Liturinn er bara inntak.** Kerfið les litinn úr `v_coach_readiness_today_v8.final_color` og þýðir hann svona:

| Litur | Í kerfinu |
|---|---|
| grænn | FULL |
| gulur | MODIFIED |
| rauður | RECOVERY |
| engin röð | venjulegur dagur |

Engin regla hér reiknar litinn eða breytir honum.

---

## A. Í hvaða röð reglurnar keyra (hvað vinnur hvað)

Styrktaræfing dagsins er byggð í `buildStrengthSession` (`SP/index.ts`), í þessari röð:

1. **Hver ræður inntakinu.** Val leikmanns, styrktarmarkmið og 8 vikna markmið koma aðeins inn ef sendihátturinn
   leyfir það.
2. **Vika án leiks.** Vikuplan þjálfarans ræður:
   - styrkdagur er byggður eins og MD-4;
   - kraftdagur eins og MD-3;
   - léttur dagur eins og MD-2;
   - hvíldardagur gefur enga æfingu.
3. **Engin æfing:** dagur sem er ekki styrkdagur, eða þjálfari hefur merkt hann hvíld.
4. **Meiðsli eða endurhæfing** (`INJURY_BLOCK`): aðeins endurhæfing, engin liðsæfing.
5. **Grunnur dagsins:**
   - sniðmát fyrir MD-daginn;
   - MD+1 mínútureglan;
   - aðferð þjálfarans fyrir daginn.
   - Á gulum degi fer aðferðin eitt þrep niður.
6. **Vikureglurnar** (aðeins einstaklingsmiðað, fótbolti):
   - þungar endurtekningar;
   - léttur dagur;
   - skammtur nálægt leik (MD-2, MD-1);
   - forvörn (Nordic, Copenhagen).
7. **Öryggisreglur** (`applyAdaptationRules`): eymsli, álag, gulur/rauður dagur, og áherslur úr deficit-skránni.
   Það sem þær banna getur ekkert seinna sett inn aftur.
8. **Athugasemdir án breytingar:**
   - misstur dagur;
   - ósamhverfa;
   - hreyfiskimun (skipt um þunga lyftu ef þarf).
9. **Lyftuvalið fyllt:** listi liðsins og val leikmanns setja lyftur í kraft- og styrktarplássin.
10. **Efri hluti, markmið og viðbætur:**
    - efri hluti;
    - markmiðslyftur renna inn;
    - „skilað til baka“-sett;
    - skammtur nálægt leik endurskrifaður fyrir lyftuna sem er komin í plássið;
    - +1 sett frá markmiði og frá NordBord/ForceFrame.
11. **Skiptingar þjálfarans** (`COACH_OVERRIDE_APPLIED`): koma á eftir vélinni.
12. **Upphitun:** leiðréttingaræfingar og jafnvægisupphitun fara fremst.
13. **Hoppapróf (CMJ):** niðurskurður ef stökkprófið er undir bilinu.
14. **Dagsreglurnar** (`enforceDayRules`): þær skera eingöngu niður.
15. **Nýjar æfingar:** kynntar fyrst létt.
16. **Ekki grænn dagur:**
    - það sem græna útgáfan missti vegna tíma fer líka af gula deginum;
    - gulur dagur er aldrei meiri vinna en grænn (`STRUCTURE_READINESS_DOWNGRADE_SKIPPED`).
17. **Eftir byggingu, í sendingunni:**
    - Mesó-lagið kemur ofan á: hvíldarvika, lokavika, uppbygging og undirfasi keppnistímabils.
    - Hoppaprófsskurðinum er haldið.
    - Dagsreglurnar eru keyrðar aftur.
    - Þetta á ekki við um leiðréttingarsendingu.

Í stuttu máli:

- Öryggisreglur vinna yfir lista liðsins, val leikmanns og markmið.
- Skipting þjálfarans ræður hvaða æfing er gerð, ekki skammtinum. Hún sleppur við bönn dagsins, tímaskurð og
  nýju-æfingaregluna. CMJ-skurðurinn og hámörk dagsreglnanna gilda um hana eins og aðrar æfingar, en hún heldur alltaf
  a.m.k. einu setti.

---

## 1. Tímabil og vikuuppbygging

| Regla | Hvenær | Hvað gerist | Heimild | Þjálfari / skráning |
|---|---|---|---|---|
| MD-merki dagsins (`fetchMdContextInfo`, `playerContext/domains.ts`) | Alltaf | Les leiki og GAME-raðir 4 dögum á undan og 5 á eftir og ákveður MD-daginn. Enginn leikur nálægt: MD-3 | — | Þjálfari getur gefið MD handvirkt í sendingu. Les ekki frídaga (OFF) úr vikuplaninu; handsending á OFF-degi fær línu um það (ósamræmi 11) |
| Fasi vikunnar (`resolveWeekPhase`) | Hver bygging | Fasi þjálfarans á vikunni, annars fasi tímabilsplansins. Keppni telst „inseason“ | — | Þjálfari vistar fasann |
| Fasar tímabils (`detectSeasonPhases`) | — | Undirbúningstímabil byrjar á dagsetningu þjálfarans, annars 42 dögum fyrir fyrsta leik. Undirbúningstímabil Breiðabliks 2026 byrjar 30. nóv., úr gögnum þjálfarans | — | `season_plans.overrides` |
| **`INSEASON_MD2_OFF`** (nýtt, 8d487b4) | Sjálfvirka MD-röðunin í Week setup, á keppnistímabili | Dagurinn eftir leik er MD+1 endurheimt, en sunnudagur vikunnar er áfram frí. MD+2 er **frídagur**. MD-1 er aldrei gerður að frídegi. Leikur síðustu tvo daga fyrri viku telur með | MicroPulse-regla; Buchheit 2023 | Þjálfari getur breytt hvaða degi sem er; ekki skráð. Undirbúnings- og utan tímabils: óbreytt |
| **`INSEASON_THREE_IN_A_ROW`** | Keppnistímabil (eða leikur í vikunni og fasi óþekktur) | Aldrei þrír æfingadagar í röð. Leikdagur er ekki æfing. Gildir líka í Mesó-dagatalinu á keppnistímabili, þar sem dagurinn fer beint í frí (ósamræmi 9). Leggur til að fækka um frídaga í þessari röð: MD+2, MD-2, MD+3, MD+4, MD-5, MD-6 … MD-3, MD-4 síðast. Vinnan af MD-2 færist á MD-3 og MD-1 | MicroPulse-regla; Buchheit 2023 | **Aðeins ráð.** „Halda planinu“ krefst ástæðu, skráð í `session_fit_override_log` (`week_rule`) |
| **`MISSED_DAY_NOT_SHIFTED`** | MD-3 til MD-1 þegar MD-4 var sendur en ekki kláraður | Bara lína í forskoðun þjálfarans. Misstur dagur er **aldrei** færður eða bætt ofan á annan | MicroPulse-regla; Buchheit 2024 | Sést bara í forskoðun þjálfarans |
| Vika án leiks (`NO_MATCH_WEEK_DAY`) | Enginn leikur nálægt | Styrkdagur = MD-4, kraftdagur = MD-3, léttur dagur = MD-2, hvíld = engin æfing. Dagur sem er ekki stilltur er léttur. Ekkert vikuplan: sjálfgefið plan (mánudagur styrkur, fimmtudagur kraftur, aðrir dagar léttir) og línan `NO_MATCH_DEFAULT_PLAN` | Regla þjálfarans; sjálfgefna planið er MicroPulse-regla | `team_strength_palette.no_match_week`; færsla eina viku í senn, með Afturkalla |
| Árekstur í viku án leiks | — | Varar við styrkdegi sem lendir á frídegi og stingur upp á næsta lausa degi | — | Sama |
| MD+1 mínútur (`md1MinutesTier`) | MD+1 | Spilaði ekki eða <30 mín: styrkur (MD-4 sniðmát). 30–59 mín: endurheimt. ≥60 mín: ísómetrískt neðri hluti (2 sett) og ferskur efri hluti. Mínútur óþekktar: föst endurheimt | Carling 2018; Nédélec 2012; Rønnestad 2023 | — |
| Sjálfgefnir hvíldardagar | — | Sniðmát eru til fyrir MD-4, MD-3, MD-2, MD-1 og MD+1. MD+2, MD+3, MD+4, MD-5 og OFF eru hvíld nema þjálfari velji aðferð | — | `team_strength_palette.md_structures` |
| `DAY_RULE_COACH_DAY_OFF` | MD+2 eða frídagur með æfingu sem þjálfari valdi | Byggt eins og valið var; lína segir frá því | „Þjálfarinn ræður síðast“ | — |
| Hvíldarvikur (Mesó) | Tímabilsplan | Undirbúningstímabil: hvíldarvika 4. hverja viku (stillanlegt 4/5/6). **Á keppnistímabili engin sjálfvirk hvíldarvika**; létt vika er val þjálfarans (magn ×0,8, ákefð haldið) | Malone 2015; Fessi 2016; Moalla 2021; Issurin 2010 | `season_plans.overrides` |
| Undirfasi keppnistímabils | Keppni | Margir leikir eða ≤3 dagar á milli: ×0,5. Hlé eða ≥12 dagar án leiks: ×1,25 (endurbyggja styrk). Síðustu 3 vikur tímabils: ×0,6. Annars ×1. Kraftur og forvörn eru ekki skalaðar | — | Lína `SUBPHASE_*` |

---

## 2. Reglur á hvern MD-dag (`SP/dayRules.ts`)

Dagsreglurnar eru athugaðar síðast og skera aðeins niður.

- **Heimild:** vikuplön þjálfarans (UEFA Fitness B, 22. nóv.). Þetta er regla þjálfarans, ekki rannsókn.
- **Sömu reglur og aðrir dagar:**
  - MD-5, MD+3 og MD+4 nota reglur MD-4.
  - OFF notar reglur MD+2.

| Dagur | Tilgangur | Hámark | Tekið út | Hámarks hraðatap | Hraði |
|---|---|---|---|---|---|
| MD-4 | Hámarksstyrkur + kraftur | 12 þungar endurt. á lyftu; 20 snertingar; **25 mín + 8 eftir** | Ekkert til uppgjafar (verður RPE 8) | **15%** | Trap bar 0,55–0,80 m/s, 2+ endurt. í varasjóði |
| MD-3 | Hraði + kraftur | **9 hlaðnar fótaendurt.** (þunga lyftan í contrast telur); 30 snertingar; 9 fallhopp; fallhæð ≤30 cm; 15 mín | Nordic, RDL (Copenhagen með eigin þyngd má) | **10%** | Hlaðið ≥0,80, ballísk ≥1,1 m/s (`DAY_RULE_ZONE` setur ≥1,1 á trap-bar hopp) |
| MD-2 | Viðhald, aðeins hratt | 6 hlaðnar endurt. (4×4 nálægt leik telst ekki með); 6 snertingar; 20 mín | **Allt þungt**; markmiðsvinna (nema markmiðslyfta nálægt leik); Nordic, RDL | **10%** | Fætur 1,0–1,3 m/s (40–55% 1RM), sama og vikureglan |
| MD-1 | Virkjun | 6 hlaðnar endurt.; 6 snertingar; 10 mín | Allt þungt; allt eccentrískt (Nordic, RDL, Copenhagen) | 10% | ≥1,1 m/s |
| MD+1 | Endurheimt + viðhald | 6 snertingar; 30 mín | Þungar fótalyftur, **nema** styrkur fyrir þá sem spiluðu lítið | — | 2–3 endurt. í varasjóði |
| MD+2 / OFF | Frí | — | Allt, en æfing sem þjálfari valdi er byggð og merkt | — | — |

**Athugun í þessari röð.** Hver breyting skráist sem `DAY_RULE_TRIM`.

1. Bönn.
2. Aldrei til uppgjafar (RPE 8).
3. Hámarks hraðatap (Pareja-Blanco 2017; Rodríguez-Rosell 2020).
4. Þungar endurtekningar á lyftu.
5. Hlaðnar endurtekningar.
6. Fallhopp, snertingar og fallhæð.
7. Ballískt svæði.
8. Tímarammi MD-4.
9. Tímalína: sýnir tíma, sker ekkert.

Hvernig skorið er: eitt sett í einu, síðasta æfing fyrst, markmiðsvinna síðast. Hver æfing heldur a.m.k. einu setti
áður en æfing er tekin út. Skipting þjálfarans er aldrei tekin út vegna banns og heldur alltaf a.m.k. einu setti, en
hámörkin (sett, endurtekningar, stökk, hraðatap) gilda um hana. Línan segir „skipting þjálfara, heldur sér“.

**`TIME_BUDGET_TRIM`** (MD-4, MD-5, MD+3 og MD+4):

- **Rammi:** 25 mínútur, með upphitun og hvíldum.
  - Mat: sett × (30 s + hvíld), 6 mín upphitun og 5 mín liðleiki.
  - Nordic og Copenhagen teljast ekki með; þær eru í „+8 eftir“.
- **Ef æfingin fer yfir** er skorið í þessari röð:
  1. fylling í efri hluta;
  2. C-æfing;
  3. eitt sett af B2.
- **Aldrei skorið:** B1 (þunga lyftan), upphitun, skipting þjálfarans og forvörn.
- Ef æfingin er enn of löng kemur línan „Kept: …“.
- Gulur dagur heldur aldrei því sem græni dagurinn missti.

---

## 3. Vikuleg styrkregla (`SP/weekRule.ts`, `SP/preventionRule.ts`)

Aðeins einstaklingsmiðað, fótbolti. Staðlaður sendiháttur og körfubolti sleppa þessu.

| Regla | Hvenær | Hvað gerist | Heimild | Þjálfari |
|---|---|---|---|---|
| **`WEEK_RULE_HEAVY_REPS`** | MD-5/-4/-3 í leikviku; þungir dagar í viku án leiks | **Þungar fótaendurtekningar á dag.** Á keppnistímabili og utan tímabils: MD-4 **9**, MD-3 **6** (15 á viku); utan tímabils segir línan það. Undirbúningstímabil: MD-4 **12**, MD-3 **9** (21 á viku). MD-5: 6. „Þung lyfta“ = tveggja fóta grunnlyfta með ≤6 endurt. í setti. Sett = endurt. ÷ endurt. í setti; hámark 6 sett (10 fyrir einar). Contrast hámark 5 umferðir, French contrast 3. Tvær þungar lyftur deila endurtekningum dagsins. Hvert sett stöðvast við hraðatap dagsins | Cuthbert 2021; Grgic 2018; Rønnestad 2011; Hoff & Helgerud 2004; Schoenfeld 2019 o.fl. Skiptingin milli daga er MicroPulse-regla | Endurtekningar í setti: `md_reps_per_set` (1–5) |
| Vika án leiks | Vikuplan til | 15 (keppni) eða 21 (undirbúningur) á viku. **Mest 3 þungir dagar, aldrei tveir í röð.** 6–15 endurt. á dag í 3 endurt. skrefum | Sama | Vikuplan |
| **`WEEK_RULE_LIGHT_DAY`** | Vika án leiks: 4. þungi dagurinn, við hlið þungs dags, eða utan plans | Verður léttur dagur (skammtur nálægt leik) | Sama | — |
| **`WEEK_RULE_NEAR_MATCH`** | MD-2, MD-1, léttur dagur | Hlaðna kraftlyftan verður **4×4** við 30–40% 1RM (eða 3 umferðir 3+3 með hoppi). Hvert sett stöðvast við **10%** hraðatap. **Engin þung lyfta.** MD-2: 1,0–1,3 m/s (40–55%). MD-1: ≥1,3 m/s (30–40%) | Harrison 2019; Rodríguez-Rosell 2020; Mann 2015 o.fl. 4×4 og skipting svæða eru MicroPulse-regla | — |
| **`WEEK_RULE_PREVENTION`** | Leikvika: MD-4 / MD-3 | **Nordic 4×5 á MD-4; Copenhagen 4×6 á hvora hlið á MD-3.** Ef MD-4 er hvíld fara báðar á MD-3, og öfugt. Vika án leiks: Nordic á fyrsta styrkdegi, Copenhagen á fyrsta kraftdegi. „Eftir æfingu á velli, ekki á undan“ | Arnason 2008; van der Horst 2015; Bourne 2017; Lauersen 2018 o.fl. Einn dagur á hvora er MicroPulse-regla | Hvíld á degi færir báðar |
| Sjálfgefin aðferð | — | MD-4 cluster, MD-3 French contrast. Leyfðar aðferðir á hvern dag | „Aðferðin er val þjálfarans“ | `STRUCTURE_APPLIED` |
| `UPPER_BODY_ADDED` | MD-4/-3, ekki rauður | Fótbolti á keppnistímabili: 1 lyfta, ≤2 sett. Undirbúningstímabil: 2 lyftur. Fyrsta sem fer vegna tíma | — | Listi liðsins |
| `MDPLUS1_UPPER_STRENGTH` | MD+1, spilaði ≥60 mín | 2 lyftur í efri hluta, sami skammtur og MD-4 | Carling 2018; Nédélec 2012 | — |
| `TEAM_PALETTE_APPLIED` / `PLAYER_PICK_APPLIED` | Einstaklingsmiðað | Listi þjálfarans fyllir kraft- og styrktarplássin. Val leikmanns gengur fyrst: mest 2 kraft, 2 tvífóta, 2 einfóta, 1 efri. Setur aldrei inn það sem öryggisregla bannaði, og skiptir aldrei út Nordic/Copenhagen | Ntoumanis 2021 | `player_strength_pick_events` |

---

## 4. Breytingar eftir check-in

Liturinn er notaður hér en ekki reiknaður.

| Regla | Kveikja | Áhrif |
|---|---|---|
| `STRUCTURE_READINESS_DOWNGRADE` | Gulur | Aðferðin eitt þrep niður, í sömu fjölskyldu og leyfð þann dag. Röð: French contrast > contrast = cluster hámarksstyrkur > cluster > … > bein sett |
| `STRUCTURE_READINESS_DOWNGRADE_SKIPPED` | Neðra þrepið væri meiri vinna en grænt | Aðferðin helst: „gulur dagur er aldrei meiri vinna en grænn“ |
| `VERDICT_REDUCED_VOLUME` | Gulur | Fyrsta grunnlyfta, aftanlæri og einfóta: sett × 0,7, a.m.k. 1 (Gabbett 2017) |
| `VERDICT_BLOCK` | Rauður (nema MD+1 með ≥60 mín) | Allt fer nema upphitun og liðleiki. Leiðréttingaræfingar og jafnvægisupphitun haldast |
| Engar viðbætur | Gulur eða rauður | Ekkert +1 sett frá markmiði eða prófi, ekkert „skilað til baka“. Markmiðslyftur á gulum degi: helmingur setta |
| `CMJ_DROP_NOT_STACKED` | Hoppapróf niðri á degi sem check-in hefur þegar lækkað | Ekki skorið tvisvar |
| Send æfing fylgir check-in | Sjálfvirk sending, ekkert byrjað | Byggð aftur við check-in, með sama byggi og kl. 09:00 og lit dagsins. **Handsendar æfingar eru aldrei endurbyggðar** |
| Sniðmát / Custom Programme | Gulur / rauður | Gulur: −1 sett á hverja línu. Rauður: kraft- og aðalblokkir faldar. Hvíldarvika −1 í viðbót. Á æfingu sem þjálfari sendi aðeins ef litur dagsins er verri en sá sem hún var sett upp með (#12) |
| Markmiðsspjald | Gulur | Erfiðu blokkirnar teknar út og mínútur helmingaðar. Rauður: sleppt |

---

## 5. Álag, GPS og líðan (`SP/adaptationRules.ts`)

| Regla | Kveikja | Áhrif | Heimild | Staða |
|---|---|---|---|---|
| `INJURY_BLOCK` | Meiðsli / endurhæfing | Engin liðsæfing; endurhæfing | Samstaða um endurkomu | Virk |
| `SORE_HAM_NORDIC_SWAP` / `_RDL_REMOVE` | Eymsli í aftanlæri | Nordic → löng ísómetrísk brú; RDL út | Lim 2020 | Virk |
| `DECEL_BURDEN_NORDIC_REMOVE` / `_DL_SWAP` | ≥3 dagar í röð með hátt hemlunarálag | Nordic út; trap-bar DL → hip thrust | McBurnie 2022 | Virk ef gögn eru til |
| `SPRINT_DROP_MTP_SWAP` / `_PLYO_REMOVE` | Hámarkshraði **í dag** ≥7% undir eigin viðmiði | MTP → IMTP; fallhopp út | Comfort 2018; Edouard 2019 | **Nánast óvirk:** þarf GPS dagsins fyrir æfingu |
| `VBT_LOAD_REDUCTION` | Hraðatap ≤ −20% | Létt á aðallyftu | Pareja-Blanco 2017 | **Óvirk:** gögnin eru alltaf tóm |
| `COD_ASYM_MAIN_LIFT_SWAP` | Ósamhverfa í stefnubreytingum ≥15% **og** þjálfari valdi „skipta“ | Þung tvífóta lyfta → búlgörsk, veikari hlið fyrst | Bishop 2020 | Virk eftir smell þjálfara |
| `SPRINT_EXPOSURE_UNDERLOAD` | Of lítill sprettur | Bara athugasemd | Malone 2017 | — |
| `SORE_GROIN_COPENHAGEN_REMOVE` | Eymsli í nára | Copenhagen út | — | Virk |
| `SORE_LB_DL_SWAP` | Eymsli í mjóbaki | Trap-bar DL → framhnébeygja | Gullett 2009 | Virk |
| `FOSTER_STRAIN_VOLUME_CUT` | Foster strain ≥6000 (7 dagar) | Fyrsta grunnlyfta, sett × 0,67 | Foster 1998 | Virk með sRPE |
| `CONGESTED_WEEK_FLAG` | 2 leikir á 7 dögum og dagurinn í dag innan þeirra. Næsti leikur úr dagatalinu telst alltaf; leikur sem er búinn aðeins ef leikmaðurinn spilaði ≥60 mín | Bara athugasemd | Rønnestad 2023 | — |
| `LEDGER_EMPHASIS_CONFIRM` / `_ADD` | Áhersla úr deficit-skrá, ekki rauður | +1 sett: hliðarhopp, búlgörsk, Nordic eða hnébeygja eftir flokki | Deficit-skráin | Virk |
| `PALETTE_SYMMETRY_UNILATERAL` | Ósamhverfa ≥10% **og** „skipta“ | Einfóta lyfta úr lista liðsins | Bishop 2020 | Virk eftir smell |
| Frívika (send af þjálfara) | 1–21 dagur | Fast sniðmát: styrkur, rólegt hlaup, tempó, hvíld. Endurhæfing helst | Rønnestad 2011; Mujika 2000 | Þjálfari breytir áður en sent er |

Annað hlaup og þol (álagsplan, long runs, near-max o.fl.) eru markmið og ráð fyrir þjálfara, ekki það sem
leikmaðurinn fær sent. Undantekning eru vallaræfingar markmiðsplana (kafli 7).

---

## 6. Próf

| Regla | Kveikja | Áhrif | Heimild |
|---|---|---|---|
| **`CMJ_DROP_MD3`** | Hoppapróf á MD+3 undir bilinu | Æfing á MD-4/MD-5: −1 sett á hverja æfingu, Nordic 1 sett, sama hraði og þyngd | Claudino 2017; Hader 2019; Gathercole 2015 |
| **`CMJ_DROP_MD2`** | Próf á MD-2 niðri | MD-2 og MD-1: aðeins upphitun, fyrsti primer, fyrsta fótalyfta og ísómetrískt/efri | Sama |
| **`CMJ_DROP_MD1_FALLBACK`** | Ekkert MD-2 próf, MD-1 niðri | Aðeins primer | Sama |

**Hvað er fall í CMJ.** Meðaltal prófsins er borið saman við miðgildi eldri prófa leikmannsins:

- eldri próf ná 90 daga aftur, a.m.k. 3, mest 5;
- það er fall ef útkoman er undir væntanlegri dýfu eftir HSR síðasta leiks (Hader 2019) ± suð.

| Regla | Kveikja | Áhrif | Heimild |
|---|---|---|---|
| **`NORDBORD_ADDON`** | NordBord ≤14 daga gamalt, fótur ≥10% undir síðasta prófi | **+1 Nordic sett** (337 N sýnt sem viðmið) | Regla þjálfarans 23. nóv. |
| **`FORCEFRAME_ADDON`** | ForceFrame ≤21 dags, munur ≥10% milli hliða eða fall ≥10% | **+1 Copenhagen sett** | Schaber 2021 |
| **`ADDON_CAP`** | Æfingin hefur þegar fengið +1, eða dagurinn er ekki forvarnardagur vikunnar | Ekkert aukasett. Aukasettið fer aðeins á skammt vikureglunnar (einn dagur í viku), svo hámarkið gildir fyrir vikuna | — |
| **`ASYMMETRY_REVIEW`** / **`ASYMMETRY_KEPT`** | Ósamhverfa ≥10% | Tvífóta lyftan helst, flaggað fyrir þjálfara/sjúkraþjálfara. Ákvörðun **heldur í 28 daga** | Bishop 2020; 28 dagar eru MicroPulse-regla |
| **`SCREEN_OHS_UNILATERAL`** | Hnébeygjuskimun ≤56 daga: hné inn eða hæll upp | Þung hnébeygja → búlgörsk; trap-bar DL → B-stance RDL. Sömu sett og þyngd | Post 2017; Krause 2015 |
| **`SCREEN_SLB_WARMUP`** | Lélegt jafnvægi á öðrum fæti | Jafnvægisæfing í upphitun | Ross & Guskiewicz 2005 |
| `CORRECTIVE_MERGED` | Leiðréttingaræfingar úr skimun | Fremsta blokk; ekki minnkuð eftir lit, helst á rauðum degi | — |

Ekkert +1 sett frá prófi kemur á gulum eða rauðum degi.

Eftirtöldum ákvörðunum má breyta:

- **Ósamhverfa:** ákvörðun þjálfarans fer í `asymmetry_reviews`. Ástæða er valfrjáls.
- **Skimun:** áhrifin hverfa þegar leikmaðurinn er skimaður aftur.

---

## 7. Markmiðsplön (`GP/`)

**Hvað er í boði og hvernig planið lítur út**

- **Markmið:** hámarkshraði, hröðun, hemlun og stökk (á velli); hámarksstyrkur, sprengikraftur og styrkur+kraftur (í
  sal).
- **Lengd og æfingar:** 8 vikur, mest 20 mín á æfingu.
  - Markmið í sal: 2 æfingar á viku.
  - Markmið á velli: 2 á keppnistímabili, 3 utan þess.
- **Yngri en 18 ára:** fá unglingaplan. Ef aldur vantar fær leikmaðurinn líka unglingaplan.
- **Lokað fyrir:** óvirka leikmenn, meidda og leikmenn í endurkomuferli.
  - Hámarkshraði er ekki fyrir markverði og ekki utan fótbolta.
- **Öryggi:** gulur dagur er léttari og rauðum degi er sleppt. Meiðsli setja planið í bið. Aldrei á MD-1 eða MD+1.

**Reglur**

- **`GOAL_PLAN_PAUSED_IN_SEASON`:**
  - Markmið sem beðið er um á keppnistímabili byrjar á undirbúningstímabilinu.
  - Plan sem er í gangi fer í bið á keppnistímabili og heldur áfram á undirbúningstímabili.
  - Bið lengri en 21 dagur: byrjað aftur í viku 1.
  - Þjálfari getur haldið áfram á keppnistímabili, með ástæðu.
- **`GOAL_PRIORITY`:**
  - Eitt opið markmið í einu.
  - Meiðslaforvörnin gengur fyrst.
  - Skráð við samþykkt (van Dyk 2019; Harøy 2019).

**Staðsetning í vikunni**

- Aldrei á MD, MD-1 eða MD+1.
- Minnst 2 dagar á milli æfinga.
- Próf helst á MD+3, annars MD-2.
- Frá 30. nóv. 2026 fara lyftur markmiðs á MD-4 og svo MD-3, **aldrei á MD-2**.
- Æfing sem kemst ekki fyrir er ekki bætt upp.

**Samruni við styrktaræfinguna** (aðeins á uppbyggingartímabili)

- **`GOAL_PLAN_GYM_MERGED`:** markmiðslyfta **kemur í stað** samsvarandi lyftu liðsins; henni er ekki bætt ofan á.
  - Aldrei á rauðum degi. Gulur dagur: helmingur setta.
  - Þungu endurtekningarnar eru lagaðar að vikureglunni.
- **`GOAL_PLAN_SPEED_ZONE`:** svæðin eru í m/s og fara eftir markmiði og degi.
  - Hámarksstyrkur: MD-4 0,55–0,65; MD-3 0,8–0,9.
  - Sprengikraftur: MD-4 0,8–0,9 og 1,1–1,3; MD-3 0,8–0,9 og 1,2–1,4.
- **`GOAL_PLAN_GYM_GIVE_BACK`:** sett sem markmiðsdagurinn gat ekki haldið eru gerð á þyngsta degi vikunnar. Aðeins á
  grænum dögum (Cuthbert 2021).
- **`GOAL_PLAN_NEAR_MATCH`:** á MD-2 og MD-1 tekur markmiðslyftan hraðaplássið sem trap-bar hopp, 4×4.
- **`PLAYER_GOAL_APPLIED` / `_PAUSED`:** „robust“ gefur +1 Nordic sett á MD-4, aðeins á undirbúnings- og
  utan tímabils.
  - Í bið á keppnistímabili, í hvíldar- og lokavikum, á gulum og rauðum dögum, í þéttri viku og eftir hemlunarálag.

**Innihald hvers plans**

- **Hámarkshraði:**
  - Mest 150 m á fullu á æfingu. Fljúgandi 10–30 m.
  - Byrjar með uppbyggingu ef enginn sprettur á 90% hefur verið í meira en 10 daga.
  - Próf í viku 3 og 8.
- **Hröðun:**
  - Sleði 15–30% hægari.
  - Undir 18 ára: enginn sleði og ekkert yfir 75%.
- **Hemlun:**
  - Of mikið álag gefur aðeins tækni.
  - Veikari fótur ≥10% fær +1 sett.
  - Dos'Santos 2019.
- **Stökk:**
  - Snertingar: byrjandi 50, miðlungs 55, lengra kominn 70.
  - Fallhopp 20 → 40 cm (Sánchez-Sixto 2021).
- **Hámarksstyrkur:**
  - 3×5 við 75–80%, svo 4×3 við 85–90%, létt í viku 7, próf í viku 8.
  - Viðbætur: iso pull og búlgörsk.
- **Sprengikraftur:**
  - 4×5 → 5×6.
  - Þung lyfta 2×3–4 við 80–85%.
  - Fallhopp mest 30 cm.
- **Lyftur almennt:**
  - Þungt við 75–85%, aldrei til uppgjafar.
  - Stöðvað við 10–20% hraðatap.
  - Ef hraðinn er meira en 0,06 m/s frá markinu breytist þyngdin um ±4–5%.

---

## 8. Almennar reglur

| Regla | Hvað gerist | Heimild |
|---|---|---|
| `TIME_BUDGET_TRIM` | Sjá kafla 2 | Regla þjálfarans |
| **`NEW_EXERCISE_INTRO`** / **`NEW_EXERCISE_HELD`** | Æfing sem ekki hefur verið skráð í 120 daga fer í upphitun á MD-4 eða í hvíldarviku: **2 × 5 við RPE 4–5, 1 mín hvíld**. Aðra daga er henni sleppt. Lyfta vikureglunnar (þung á MD-4/MD-3, hröð á MD-2/MD-1) heldur sér: 2 auðveld sett í upphitun og svo vinnusettin. **Óvirk þar til leikmenn skrá sett** (taflan er tóm) | MicroPulse-regla; McHugh 2003 |
| `GOAL_PRIORITY` | Eitt aðalmarkmið (kafli 7) | — |
| `MISSED_DAY_NOT_SHIFTED` | Misstur dagur ekki færður (kafli 1) | — |
| Röð í contrast | Kraftur fyrst, svo styrkur. Undantekning: French contrast byrjar á þungu lyftunni | Regla þjálfarans |
| RPE-aðlögun | Tillaga á spjaldi þjálfara (+2,5–5% eða −5%). Breytir aldrei æfingunni | Zourdos 2016; Helms 2016 |
| Mesó-lag | Hvíldarvika: helmingur setta, líka þungu settin í vikureglunni (`WEEK_RULE_DELOAD`). Lokavika: −1 sett. Uppbygging (undirbúnings/utan tímabils): +1 sett. Undirfasi ×0,5/0,6/1/1,25 á aðra aðalvinnu. **Nordic og Copenhagen breytast aldrei.** Þungu endurtekningarnar breytast ekki í lokaviku, undirfasa eða uppbyggingu | Issurin 2010; Cuthbert 2021; Rønnestad 2011 |

---

## 9. Afhending og val þjálfarans

**Hvað leikmaðurinn sér á „Í dag“** (`fetchStage4Plan`), í þessari röð:

0. **Daglegt sniðmát frá þjálfara.** Þá er styrktarspjaldið ekki sýnt.
1. **Æfing sem þjálfari sendi** (`player_today_strength_override`):
   - Læst, en aðlagast ef leikmaðurinn skráir sig inn síðar á verri lit (gulur −1 sett, rauður aðeins upphitun og
     liðleiki; #12). Sjálfvirk æfing er sett upp aftur við innskráningu.
   - Sjálfvirk æfing er falin á frídegi, handsend ekki.
2. **Prógramm liðsins eða Custom Programme.** Valið eftir liði, MD-degi, lit og fasa.
3. **Eldri varaleiðir.**
4. **Sjálfgefin bygging vélarinnar.**
5. **Hvíldarspjald.**
6. **Hlaup.**

Æfingavika (`player_training_programmes`) er ekki uppspretta fyrir „Í dag“.

**Sem senda æfingu** (síðasta sending vinnur):

| Leið | `origin` | Athugið |
|---|---|---|
| Ein æfing | `session` | |
| Hópsending | `bulk` | |
| 4 vikna blokk | `block` | **Aldrei aðlöguð eftir lit.** Eina leiðin sem sýnir árekstra |
| Leiðrétting | `corrective` | Án Mesó, markmiða og skiptinga |
| Sjálfvirkt kl. 09:00 | `auto` | Ekki á frídegi; ekki ef leikmaður á þegar æfingu |
| Endurbygging við check-in | `auto` | |

**Sendihættir:**

| Háttur | Æfingin | Val leikmanns |
|---|---|---|
| Standard | Sniðmát + gulur/rauður | Ekkert |
| Individualised | Allar reglur | Aðeins prufuleikmenn |
| Individualised + goals | Allar reglur | Allir |

**Hvar val þjálfarans er skráð:**

- **Skipting á æfingu:** `strength_session_overrides`. Ástæða er valfrjáls (ósamræmi 18).
- **Ósamhverfa:** `asymmetry_reviews`.
- **Sendiháttur og sjálfvirk sending:** `teams`.
- **Aðferðir, hvíldardagar, endurtekningar í setti og vikuplan:** `team_strength_palette`.
- **„Halda planinu“:** `session_fit_override_log`.
- **Hvað fór út:** `strength_send_log`.

`rulesEngine` og `automation` búa aðeins til viðvaranir og ábendingar. Þau breyta aldrei æfingunni.

---

## D. Reglur sem eru óvirkar eða nánast óvirkar

1. `VBT_LOAD_REDUCTION`: hraðagögnin koma alltaf tóm.
2. `SPRINT_DROP_*`: þarf GPS dagsins, en æfingin er send fyrir æfingu.
3. `SPRINT_EXPOSURE_UNDERLOAD` og `CONGESTED_WEEK_FLAG` gefa bara athugasemd.
4. Allar greinar fyrir „REDUCED“ og „HOLD“: liturinn gefur þau gildi aldrei.
5. `MISSED_DAY_NOT_SHIFTED`: sést aðeins í forskoðun þjálfara.
6. `NEW_EXERCISE_*`: settaskráin er tóm.
7. Lagfæringin í þriggja-daga-reglunni er aldrei sett inn sjálfkrafa. Hún er aðeins ráð.
8. „Stronger“- og „power“-markmið leikmanns eru hætt.
9. Hámarkshraði „>21 dagur → uppbyggingarhlaup“ er aðeins texti.
10. RPE-aðlögun: aðeins á spjaldi þjálfara.
11. Hemlunar-, CMJ-, NordBord-, ForceFrame- og skimunarreglur þegja ef gögnin vantar.

## C. Ósamræmi sem fannst (þitt að ákveða)

1. ~~**MD-2 hraðatexti.**~~ **Lagað 23. nóv.:** MD-2 er aðeins hraður dagur. Dagsreglan bannar þunga lyftu, hraðatap er
   mest 10% og textinn er 1,0–1,3 m/s eins og í vikureglunni. Engin leyfð MD-2 aðferð hafði þunga lyftu. Bannið nær
   aðeins viðbótum, t.d. búlgörsku úr deficit-skránni.
2. ~~**Mesó-lagið breytir föstum skömmtum.**~~ **Lagað 23. nóv.:**
   - Nordic og Copenhagen eru eins í hverri viku, óháð blokk, lokaviku eða undirfasa.
   - Þungu endurtekningarnar og skammtur nálægt leik haldast í lokaviku og undirfasa.
   - Aðeins hvíldarvika helmingar þungu settin og segir frá því (`WEEK_RULE_DELOAD`).
3. ~~**Deficit-skráin telst ekki með.**~~ **Lagað 23. nóv.:** á degi þar sem vikureglan setti þungu endurtekningarnar
   bætir hámarksstyrks-áhersla deficit-skrárinnar engri þungri lyftu við. Hún setur heldur enga lyftu aftur inn sem
   öryggisregla skipti út. Í staðinn kemur lína um að endurtekningarnar komi úr vikureglunni.
4. ~~**MD-3 á undirbúningstímabili.**~~ **Lagað 23. nóv.:**
   - Létt hlaðið hopp í contrast-umferð (≤40% af hámarki) telst nú sem stökksnertingar (mest 30), ekki hlaðnar
     endurtekningar.
   - Undirbúningstímabil: 3×3 þungt og 3 umferðir hopp. Keppnistímabil: 2×3 og 2 umferðir.
   - Cluster (3×12 við 80%) er ekki lengur í boði á MD-3. Dagsreglan tók lyftuna alveg út.
   - Gulur leikmaður á MD-3 contrast fór áður niður í cluster og missti styrktarlyftuna. Nú fer hann í ísómetríska
     lyftu.
5. ~~**Ný æfing og B1.**~~ **Lagað 23. nóv.:** lyfta sem vikureglan setti (þunga lyftan á MD-4/MD-3, hraðalyftan á
   MD-2/MD-1) er aldrei breytt í upphitun þótt hún sé ný. Leikmaðurinn fær 2 auðveld sett í upphitun til að læra hana
   og svo vinnusett dagsins. Skammtur vikureglunnar heldur. Aðrar nýjar æfingar verða áfram upphitun.
6. ~~**CMJ-skurður og skipting þjálfarans.**~~ **Lagað 23. nóv.:** skipting þjálfarans ræður hvaða æfing er gerð,
   ekki skammtinum. Hámörk dagsreglnanna gilda nú um hana eins og CMJ-skurðurinn. Bönn dagsins og tímaskurður sleppa
   henni áfram, og hún heldur alltaf a.m.k. einu setti. Línan segir „skipting þjálfara, heldur sér“.
7. ~~**`ADDON_CAP` á viku.**~~ **Lagað 23. nóv.:** aukasett prófsins fer aðeins á forvarnarskammt vikureglunnar (Nordic
   MD-4, Copenhagen MD-3), sem er einn dagur í viku. Nordic á öðrum degi (t.d. í sniðmáti MD-5) fær ekkert aukasett og
   línan segir hvert það fer. Hámarkið +1 á viku heldur því yfir alla vikuna.
8. ~~**Þétt vika.**~~ **Lagað 23. nóv.:** 2 leikir á 7 dögum, og dagurinn í dag innan þeirra 7 daga. Leikir í
   dag og fram í tímann koma úr dagatali liðsins og teljast alltaf. Leikur sem er búinn telst aðeins ef leikmaðurinn
   spilaði ≥60 mín. Áður taldi kóðinn aðeins leiki með mínútum á 15 daga bili, svo næsti leikur taldist aldrei.
9. ~~**Tvö „í röð“-hámörk.**~~ **Lagað 23. nóv.:** á keppnistímabili fylgir Mesó-dagatalið vikureglunni: mest 2
   æfingadagar í röð og leikdagur telst ekki með. Frídagurinn er valinn eins og í vikureglunni (MD+2, MD-2, svo dagar
   lengst frá leik), svo í 8 daga viku fellur MD-5 niður og vinna dagsins færist ekki annað. Í landsleikjahléi er
   vikan þung, hlaup, frí, blandað, virkjun. Utan tímabils heldur Mesó sínu hámarki (3, leikir taldir). Dagur sem
   þjálfari festi heldur sér.
10. ~~**MD+2 er meðhöndlaður á þrjá vegu.**~~ **Lagað 23. nóv.:** MD+2 er frídagur á keppnistímabili, alls staðar.
    - Álagsplanið og periodization-líkanið segja það. Æfing sem þjálfari setur á MD+2 er val þjálfarans: létt, 35%.
    - Markmiðsplan á keppnistímabili velur ekki MD+2, nema þjálfari hafi sett æfingu þar í vikuplaninu.
    - Á undirbúningstímabili og utan tímabils er MD+2 áfram æfingadagur.
11. ~~**Handsendar æfingar á frídögum.**~~ **Lagað 23. nóv.:** eins dags sending (einn leikmaður eða hópurinn) á
    degi sem vikuplanið merkir OFF fer út, því þjálfarinn valdi hana. Hún er sett upp eftir stöðu dagsins í
    leikvikunni (vélin hefur enga æfingu fyrir OFF) og fær línuna `DAY_RULE_COACH_DAY_OFF`: „frídagur í vikuplaninu,
    sent af því þjálfarinn valdi það“. Sendingarglugginn segir það líka. 4 vikna blokk sleppir dögum sem eru OFF
    þegar hún er send og telur þá upp. Sjálfvirka sendingin sendir áfram aldrei á frídegi.
12. ~~**Handsendar æfingar fylgja aldrei check-in síðar.**~~ **Lagað 23. nóv.:** þegar leikmaður skráir sig inn
    eftir að þjálfari sendi æfingu (einn leikmaður, hópurinn eða 4 vikna blokk) og liturinn er verri en sá sem æfingin
    var sett upp með, aðlagast hún á „Í dag“. Æfingarnar sem þjálfarinn valdi haldast. Gulur: eitt sett af hverri
    línu. Rauður: aðeins upphitun og liðleiki. Lína segir „aðlagað að innskráningu dagsins“. Ekkert er minnkað
    tvisvar: æfing sett upp á gulum degi er ekki minnkuð aftur á gulum degi. Sjálfvirka sendingin er áfram sett upp
    aftur á þjóninum og leiðréttingarsending er óbreytt (`handSentAdjust.ts`).
13. ~~**Utan tímabils fær vikureglu keppnistímabils**~~ **Lagað 23. nóv.:** þjálfarinn ákvað að utan tímabils haldi
    15 á viku eins og á keppnistímabili. Markmiðið þar er að stöðva tapið og 15 er yfir þeim 12 sem héldu styrk
    (Rønnestad 2011). Línan sagði „keppnistímabil“ og segir nú „utan tímabils, heldur eins og á keppnistímabili“
    (`weekRulePhaseOf`). Sama í textanum á /coach/strength.
14. ~~**Vika án leiks og án vikuplans**~~ **Lagað 23. nóv.:** lið sem hefur ekkert vikudagaplan fær sjálfgefið plan
    (`DEFAULT_NO_MATCH_WEEK`): mánudagur styrkur (MD-4), fimmtudagur sprengikraftur (MD-3), aðrir dagar léttir.
    Vikureglan og Nordic/Copenhagen gilda þá eins og í skipulagðri viku. Línan `NO_MATCH_DEFAULT_PLAN` segir að
    sjálfgefna planið hafi verið notað og hvar má setja plan liðsins. Færsla eina viku í senn heldur sér. Um leið og
    einn dagur er stilltur gildir plan þjálfarans. Í dag (23. nóv.) hefur aðeins Breiðablik (fótbolti) plan.
    Markmiðsplön (8 vikur) raða enn eftir eigin reglu þegar ekkert plan er til.
15. ~~**`buildMesoPlan` setur hvíldarviku 4. hverja viku líka á keppnistímabili**~~ **Lagað 23. nóv.:** vika sem
    byrjar á keppnistímabili (`inSeasonRange`) fær aldrei sjálfvirka hvíldarviku, eins og í `buildMesoBlocks`. Létt
    vika á tímabili er val þjálfarans. Undirbúningstímabil heldur hvíldarviku 4. hverja viku. PDF-ið segir það í
    athugasemd. Regla sem þegar var ákveðin (6. nóv.), svo ekki spurt.
16. **Gulur dagur er meðhöndlaður á fimm vegu** eftir leið:
    - vélin: þrep niður og −30% sett;
    - sniðmát: −1 sett;
    - markmiðsspjald: helmingur mínútna;
    - markmiðslyftur: helmingur setta;
    - CMJ-skurður: −1 umferð.
17. **Markmiðsplön:**
    - Plan sem er samþykkt á keppnistímabili er fryst sem 2 æfingar á viku, en keyrir bara á undirbúningstímabili.
    - Gulur-textinn segir „helmingur setta“ en spjaldið helmingar mínútur.
    - Leikmaður sem vantar aldur á fær unglingaplan.
18. **Ástæður þjálfara eru valfrjálsar á sumum stöðum**, þvert á CLAUDE.md:
    - skipting á æfingu og ósamhverfa;
    - eytt skipting skilur enga sögu eftir.
19. **Sjálfgefið tungumál:** handsendar æfingar falla á íslensku, blokk og leiðrétting á ensku. CLAUDE.md segir enska.
