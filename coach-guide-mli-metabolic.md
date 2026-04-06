# Leiðarvísir fyrir þjálfara — MLI og Metabolic Load Score

## Mechanical Load Index (MLI)

### Hvað er MLI?

MLI mælir **líkamlega álag af hraðabreytingum** — hversu hart líkaminn þarf að vinna til að hraðna, hægja á sér og snúa. Þetta er ekki sama og hversu langt eða hratt leikmaðurinn hleypur, heldur hversu margar og hversu miklar **árekstrar við vöðva og liðamót** eiga sér stað.

Scorið er **0–100** og byggist á samanburði við eigin sögu leikmannsins (28 daga grunnlína). **50 þýðir meðallag. Yfir 70 er áhættusvæðið.**

---

### Þrjár tölur sem þarf að skilja

| Tala | Hvað hún segir |
|------|----------------|
| **MLI** | Álag dagsins miðað við meðallag þíns |
| **Residual** | Uppsafnað álag — tekur tillit til þess hvað var gert í gær og í fyrradag |
| **Sub-scores** (DSS · ASS · CSS · GDS) | Hvar álagið kemur frá |

**Residual er oft mikilvægara en MLI** — leikmaður getur verið 60 í MLI í dag en 110 í Residual ef hann var 90 í gær líka.

---

### Sub-scores útskýrðar

**DSS — Deceleration Subscore (40% af MLI)**
Mælir **hægingar** — þetta er þyngsta konan. Þegar leikmaður stoppar hart eða breytir um stefnu þurfa hamstringar og hnéliðir að taka þyngdina. DSS er yfirleitt hæst eftir markmót eða þjálfun með mikla sprettavinnu.

**ASS — Acceleration Subscore (20% af MLI)**
Mælir **hraðanir** — fókusar á sprint-upphafs. Þegar 100 í ASS er þetta vísbending um mikla sprettavinnu þann dag.

**CSS — Change of Direction Subscore (25% af MLI)**
Mælir **stefnubreytingar** (skiptist). Sýnir hversu mikið af hliðlægu álagi var á hnjám og ökkla. CSS sýnir `—` þegar IMA CoD gögn eru ekki til staðar.

**GDS — General Density Subscore (15% af MLI)**
Mælir **heildarþéttleika** — player load á mínútu og IMA-heildarfjölda. Gefur til kynna hvernig leikmaðurinn "starfaði" í heildina.

---

### Flags og hvað þær þýða

| Flag | Þýðing |
|------|---------|
| **Extreme** | MLI ≥ 85 — þessi dagur er langt yfir meðallagi leikmannsins |
| **Residual elevated** | Uppsafnað álag er hærra en venjulegt þótt dagurinn einn sé ekki extreme |
| **Decel spike** | DSS er sérstaklega hár miðað við rest af MLI — hamstrings og hné í áhættu |

---

### Bands í stuttu máli

| Band | Stig | Þýðing |
|------|------|---------|
| LOW | < 40 | Létt dagur |
| MODERATE | 40–54 | Venjuleg þjálfun |
| HIGH | 55–69 | Krefjandi dagur |
| VERY HIGH | 70–84 | Áhættusvæðið — fylgjast með |
| EXTREME | ≥ 85 | Of mikið eða mjög óvenjulegt — taka afstöðu |

**Confidence: "medium"** þýðir að við höfum 5–15 samanburðardaga í gagnagrunni. Eftir 20+ daga verður þetta "high" og tölurnar nákvæmari.

---

---

## Metabolic Load Score

### Hvað er Metabolic Load Score?

Þetta mælir **hversu hart orkukerfi líkamans vann** — ekki vöðvakraftur eins og MLI, heldur **hversu mikla orku leikmaðurinn þurfti að framleiða** og hversu lengi hann var á háu efnaskiptaálagi. Þetta tengist beint líkamsrækt og korkusöfnun.

Scorið er **0–100** og er z-score samanburður við eigin grunnlínu.

---

### Fjórar mælibreytur

**Peak W/kg — Hámarksorka per kílógramm**
Þetta er hæsta krafan sem líkaminn setti á sig í eina augnablik (sprett). Gildi á bilinu 70–110 W/kg eru venjuleg í fótbolta. Þetta gefur til kynna hversu sprengjufullur æfingin var.

**HMLD — High Metabolic Load Distance (km)**
Heildarfjarlægð sem leikmaðurinn hljóp á ofan við orkuþröskuld (u.þ.b. 25 W/kg). Þetta er besti einstaki mælikvarðinn á **súrefniskrefjandi hluta æfingarinnar**. Dæmigert bil: 0.7–2.0 km á æfingu.

**T>thresh — Tími yfir orkuþröskuldinum**
Hversu margar mínútur leikmaðurinn eyddi í háu efnaskiptaástandi. T>thresh 4–7 mínútur er dæmigert á venjulegri þjálfun. Leikur getur gefið 8–15 mínútur.

**Avg W/kg — Meðalorka (kemur ekki inn)**
Þessi breyta er ekki í boði í Catapult stillingum liðsins — dálkurinn mun alltaf vera tómur.

---

### Fatigue type — hvað þýðir hvert?

| Fatigue type | Þýðing |
|-------------|---------|
| **Normal** | Metabolic load er innan eðlilegra marka miðað við grunnlínu |
| **Mechanical fatigue** | MLI er hár en metabolic er eðlilegt — vöðvakraftur er krefjandi en orkukerfi er OK |
| **Global fatigue** | Bæði MLI og Metabolic eru há — heildstætt þreytaástand, líkaminn er undir álagi frá báðum hliðum |

---

### Δ 5d — Breyting síðustu 5 daga

Þetta sýnir **stefnuna** — hvort leikmaðurinn sé að fara upp eða niður.

- **+25.6** þýðir að scorið hefur hækkað um 25.6 stig á 5 dögum — gæti bent til þess að hann sé að þjálfast sér yfir gáfu eða að keppni sé að koma
- **−3.9** þýðir að scorið er að lækka — gott merki um endurheimt

Þetta er **áhrifaríkasta talan fyrir skipulagningu** — auðvelt að sjá hvaða leikmenn eru að safna sér upp.

---

### Vol 7d — Sveifla síðustu 7 daga

Mælir **óstöðugleika** — hversu mikið scorið sveiflast á milli daga.

- **Lág Vol (< 3)**: Stöðugt álag — leikmaðurinn er að gera svipað á hverjum degi
- **Há Vol (> 8)**: Mikil sveifla — kannski leikur einn daginn og hvíld annan. Getur verið eðlilegt eða bent til þess að eitthvað sé að

---

### Confidence — hversu traustar eru tölurnar?

| Confidence | Þýðing |
|-----------|---------|
| **high** | 6+ dagar með gild gögn í grunnlínu — traustar niðurstöður |
| **medium** | 4–5 dagar — nokkuð traustar |
| **low** | < 4 dagar — skoða með varúð |

---

## Samspil MLI og Metabolic Load Score

Þessar tvær tölur eru **óháðar en fylla hvora aðra upp**:

- **Hár MLI + lágur Metabolic** → Kraftþjálfun eða tæknileg þjálfun með miklum hraðabreytingum en litlum sprettum
- **Lágur MLI + hár Metabolic** → Hlaup- eða þolþjálfun með löngum sprettum en fáum stefnubreytingum
- **Háir báðir** → Fullgildur leikur eða mjög krefjandi þjálfun — hér þarf hvíld
- **Lágir báðir** → Létt dagur eða endurheimt

**Bestu nýting:** Nota MLI til að meta **vöðvaálag** (þarf leikmaðurinn hvíld fyrir þjálfun?) og Metabolic til að meta **orkustöðu** (er leikmaðurinn líkamræðislega þreyttur?).
