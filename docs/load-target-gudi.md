# Álagsmarkmið — Leiðbeiningar fyrir þjálfara

Þessi leiðarvísir útskýrir nýja **Álagsmarkmið** eiginleikann á GPS síðunni
og hvernig á að velja réttu aðferðina fyrir þitt lið.

---

## Yfirlit

Þegar þú opnar GPS síðuna sérðu **Vikuálag** spjaldið efst. Það sýnir
núna uppsafnað GPS álag vikunnar (t.d. Total Distance, Player Load,
Velocity Band 5/6, Accel/Decel B2-3) og ber það saman við **markmið**.

Áður fyrr var markmiðið alltaf 8 vikna rolling average af eigin sögu
liðsins. Núna getur þú valið milli **þriggja aðferða** eftir því hvað
hentar þjálfunaráætluninni þinni.

Þú opnar stillingarnar með því að ýta á **tannhjólsmyndina** (⚙) efst
til hægri í Vikuálag spjaldinu, við hliðina á „day X of 7" texta.

---

## Aðferðirnar þrjár

### 1. Söguleg meðaltöl (Historical baseline)

**Hvað:** Miðar við 8 vikna rolling average af gögnum liðsins sjálfs.
Þetta er sjálfgefið og það sem kerfið hefur alltaf gert.

**Hvenær á að nota:**
- Í byrjun tímabils eða þegar þú ert ekki með fastmótaða áætlun.
- Þegar þú treystir sögulegum gögnum og vilt bara sjá hvort vikan er
  eðlileg miðað við það sem liðið er vant.
- Þegar gagnagrunnurinn er of lítill til að reikna leikálag áreiðanlega.

**Kostir:** Einfalt, sjálfvirkt, krefst engrar handstillingar.

**Gallar:** Endurspeglar ekki sérstaka áætlun þjálfarans. Ef vikan er
óvenjuleg (t.d. tvöfaldur leikur, heavy block) þá verður þetta
villandi.

---

### 2. Leikálag (Match demand) — **vísindaleg nálgun**

**Hvað:** Kerfið finnur síðustu leiki liðsins (síðustu 120 daga sjálfgefið),
reiknar meðaltal á hvert KPI úr leikjunum, og margfaldar svo með
prósentutöflu fyrir alla MD-daga í vikunni. Útkoman er vikulegt
markmið sem endurspeglar hve mikið liðið ætti að æfa miðað við kröfur
leiksins.

**Dæmi:** Ef meðaltals Total Distance í leik er 9.000 m og prósentutaflan
segir að MD-4 = 115% af leik, MD-3 = 100%, MD-2 = 75% o.s.frv., þá
leggur kerfið það saman í vikulegt Total Distance markmið.

**Grunnur:** Martin-Garcia o.fl. (2018, Barcelona B), Akenhead o.fl.
(2016), Stevens o.fl. (2017) — allir þessir benda á að æfingaálag
ætti að vera sett í samhengi við raunverulegar kröfur leiksins, ekki
bara sögulegt meðaltal.

**Hvenær á að nota:**
- Þegar þú ert í tímabili og vilt að æfingar fylgi leiknum.
- Þegar þú ert með áreiðanleg GPS gögn úr nýlegum leikjum.
- Þegar þú vilt auðvelda leið til að jafna álag milli leikmanna sem
  spila mismikið í leikjum.

**Hvernig finnur kerfið leikina:**
1. Fyrst skoðar það **team_schedule_events** (þar sem event_type = 'match')
2. Svo **week_plans** (day_type = 'GAME')
3. Ef ekkert fannst þar þá notar það **fallback**: dagar þar sem
   meðaltals Total Distance í liðinu fór yfir ákveðið þröskuldsgildi
   (sjálfgefið 8.000 m).

Þú getur séð í spjaldinu sjálfu hve margir leikir fundust (t.d.
„8 leikir" neðst).

**Stillingar í glugganum:**
- **Leikir aftur í tímann (dagar):** 14–365. Stærri tala = fleiri
  leikir í meðaltalinu (stöðugri tala) en getur blandað saman
  tímabilum. 120 daga sjálfgefið er ágætt fyrir eitt tímabil.
- **Lágmarks TD fyrir leik-detection:** Notað aðeins í fallback.
  8.000 m er sanngjarnt fyrir full lið, lækkaðu fyrir yngri flokka.
- **Lágmarks leikmínútur (FULL sía):** Aðeins leikmenn sem spiluðu
  a.m.k. þetta margar mínútur í leiknum eru teknir með í
  meðaltalið. **Sjálfgefið 75 mín** (sem telst „FULL" leikur).
  Stilltu á 0 til að slökkva á síunni ef þú vilt að allir sem áttu
  GPS gögn telji með.

**Hvernig FULL sían virkar:**
Kerfið reiknar leiknar mínútur út frá GPS gögnum í þessari röð:
1. **`fmp_total_duration_s`** (heildartími úr Catapult FMP) ÷ 60
2. Ef það vantar: **`total_player_load / player_load_per_minute`**
3. Ef hvorugt er til: leikmaðurinn er **útilokaður** (varanlegt — við
   viljum ekki blanda inn leikmönnum sem við getum ekki staðfest að
   hafi spilað nógu lengi).

Þetta þýðir að **varamenn sem komu inn með 10–20 mín** eru teknir út
úr meðaltalinu, og þú færð raunverulega kröfu fyrir byrjunarliðsmann.
Þetta er mikilvægt því að annars myndi meðaltalið lækka og æfingar
verða of léttar.

**Díagnostík í glugganum:** Þegar þú ert í Leikálags-ham sérðu neðst
í stillingaglugganum:
- `X leikir fundnir` — fjöldi leikdaga
- `Y leikmenn með FULL` — fjöldi leikmanns-daga sem stóðust síuna
- `Z sleppt (of litlar mínútur)` — fjöldi sem var útilokaður

Ef „sleppt" tala er há (t.d. helmingur) þá veistu að sían er virk og
útilokar varamenn. Ef fjöldi leikmanna með FULL er of lítill (t.d. 2–3)
þá gæti verið skynsamlegt að lækka þröskuldinn tímabundið (t.d. í 60
mín) til að fá nógu stórt sýni.

---

### 3. Markmið þjálfara (Coach target)

**Hvað:** Þú setur vikulegt markmið handvirkt fyrir hvert KPI.
Kerfið notar þínar tölur beint sem markmið vikunnar.

**Hvenær á að nota:**
- Þegar þú hefur sérstaka áætlun (t.d. uppbyggingarblokk með hærri
  heildar distance) sem er ekki beint tengd leikálagi.
- Þegar þú ert með reynslu og veist nákvæmlega hvað þú vilt sjá.
- Fyrir preseason þar sem álag er oft hærra en í tímabili.

**Hvernig á að stilla:** Sláðu inn tölu fyrir hvert KPI (Total Distance
í m, Player Load stig, Velocity Band 5/6 í m, Accel/Decel í fjölda).
Ef þú skilur eitthvað eftir autt þá fellur kerfið til baka í söguleg
meðaltöl fyrir _það_ KPI aðeins.

**Ráð:** Byrjaðu á því að kíkja á sögulegu meðaltölin (Söguleg meðaltöl
aðferðin) og taktu þær tölur sem upphafspunkt, svo stilltu þær í þína
átt.

---

## Mesocycle fasi og margfaldari

Óháð aðferðinni getur þú stillt **Mesocycle fasa** og **margfaldara**
til að auðveldlega hækka eða lækka markmiðin án þess að breyta
grunntölunum:

| Fasi | Týpískur margfaldari | Notkun |
|------|---------------------|--------|
| Uppbygging (Build) | ×1.05–1.15 | Hækkar álagið lítillega, krefur meira |
| Viðhald (Maintain) | ×1.00 | Hlutlaus — notar grunnmarkmiðið eins og er |
| Lækkun (Taper) | ×0.70–0.85 | Lækkar álagið fyrir leik/mót |

**Dæmi:** Ef þú ert á leikálagsaðferð og vilt taper vikuna fyrir
úrslitaleik, veldu **Lækkun** og færðu margfaldarann á **×0.75**.
Öll markmiðin lækka um 25% í einu lagi.

---

## Leyfilegt bil (Corridor)

Sleðinn „Leyfilegt bil (±)" stjórnar því hvenær kerfið sýnir **grænt**
(á réttri braut) og hvenær það sýnir **gulleitt** (yfir/undir).

- **±15% (sjálfgefið):** Frekar strangt. 85–115% af markmiði telst grænt.
- **±10%:** Mjög strangt. Fyrir elite lið með mikla gagnavinnslu.
- **±20–25%:** Sveigjanlegra. Fyrir lið með breytilegt álag, yngri flokka,
  eða lið með minni gögn.

Ef bil er sett á ±20% þá er græna svæðið 80–120%, gult 120–140%, og
rautt þar fyrir utan.

---

## Liturinn á ringinum — hvað þýðir hann?

Þegar þú horfir á stóra prósentuhringinn efst í spjaldinu:

| Litur | Merking |
|-------|---------|
| 🔵 Blátt (↓) | Undir markmiði — gæti þurft meira álag |
| 🟢 Grænt (✓) | Á réttri braut — innan leyfilegs bils |
| 🟡 Gult (↑) | Yfir markmiði — ekki áhyggjuefni en eftirlit |
| 🔴 Rautt (⚠) | Langt yfir markmiði — áhættusamt, íhuga að lækka |

Litli punkturinn utan á hringinum sýnir hvar þú **ættir** að vera núna
miðað við dag vikunnar (linear estimate). Ef stóra talan þín er mun
hærri en pósitíon punktsins þá er vikan á undan áætlun.

---

## Hvað á ég að velja? (stutt ráðgjöf)

| Ástand | Mælt með |
|--------|----------|
| Byrjun tímabils, lítið af gögnum | Söguleg meðaltöl |
| Reglulegt tímabil með leikjum hverja viku | **Leikálag** |
| Double-game vika | Leikálag + mesocycle ×1.10 |
| Taper vika fyrir úrslitaleik | Leikálag + Lækkun ×0.75 |
| Preseason uppbygging | Markmið þjálfara (handstillt hærri tölur) |
| Vil nákvæma stjórn, veit hvað ég vil | Markmið þjálfara |

---

## Hvernig veit ég að stillingin virkar?

1. Opnaðu stillingagluggann með tannhjólinu.
2. Neðst í glugganum sérðu **„Forskoðun á markmiði"** með útreiknuðu
   tölunum fyrir hvert KPI áður en þú vistar.
3. Þegar þú vistar uppfærist spjaldið sjálfkrafa og þú sérð nýja
   merkið efst (Leikálag / Markmið þjálfara / Söguleg meðaltöl).
4. Stóra prósentan breytist úr „af dæmigerðri viku" í „af markmiði"
   þegar þú ert ekki í baseline aðferðinni.

---

## Algengar spurningar

**Q: Hvað ef engir leikir finnast fyrir Leikálag aðferðina?**
A: Þá fellur kerfið til baka í fallback (TD þröskuld). Ef það finnur
ekkert þar heldur þá sýnir spjaldið „—" fyrir markmiðið og KPI-ið
fellur aftur í söguleg meðaltöl fyrir vikuna.

**Q: Get ég haft mismunandi stillingar fyrir mismunandi leikmenn?**
A: Nei, stillingin er á **liðinu**. En spjaldið sjálft styður leikmanns-view
(„Player" hnappur) þar sem hver leikmaður er borinn saman við sín eigin
meðaltöl.

**Q: Breytir þetta neinu um sögulegu gögnin mín?**
A: Nei, engin gögn eru snert. Þetta er bara _hvernig markmiðið er reiknað_.
Þú getur skipt á milli aðferða eins oft og þú vilt án þess að neitt
eyðileggist.

**Q: Hvað gerist í „day 1 of 7" þegar ég hef ekki æft enn?**
A: Kerfið sýnir 0% af markmiði (eðlilegt) og liturinn verður blár
(undir áætlun), sem er rétt svo snemma vikunnar.

**Q: Telur Leikálag með varamenn sem komu inn síðustu mínúturnar?**
A: Nei. Sjálfgefin sía er **75 mín lágmark** — aðeins leikmenn sem
spiluðu a.m.k. 75 mín teljast með í meðaltalinu. Þetta er til þess
að meðaltalið endurspegli raunverulega kröfu fyrir leikmann sem
spilar allan leikinn, en ekki blandað saman varamönnum og byrjunarliði.
Þú getur lækkað þennan þröskuld (eða stillt á 0 til að slökkva) í
stillingaglugganum.

**Q: Hvernig veit kerfið hvað leikmaðurinn spilaði lengi?**
A: Úr Catapult GPS gögnum — annaðhvort `fmp_total_duration_s`
(þegar FMP er virkt) eða reiknað út frá `total_player_load`
deilt í `player_load_per_minute`. Ef hvorugt er til staðar er
leikmaðurinn útilokaður frá útreikningnum.

---

## Innandyra notkun (Indoor / FMP hamur)

Mörg lið á Íslandi spila og æfa innandyra stóran hluta vetrar, þar sem GPS
merki virka ekki. Til að álagsmarkmiðið virki líka þá þarf **Innandyra-ham**
(Indoor mode) að vera virk á liðinu. Þegar kveikt er á innandyra-ham
skiptir kerfið sjálfkrafa yfir í **Football Movement Profile (FMP)** mælingar
úr Catapult skynjaranum, sem virka án GPS.

### Hvar á að kveikja?

Fer í **Stillingar liðs** (`/coach/settings`) og kveikir á `Innandyra-ham`
rofann. Þetta stýrir bæði ákvarðanavél kerfisins (readiness, burden score)
OG álagsmarkmiðinu — þú þarft ekki að stilla neitt sérstaklega á GPS síðunni.

Körfuboltalið eru alltaf sjálfkrafa á innandyra-ham (stillt út frá
íþróttategund).

### Hvaða KPI notar kerfið þegar innandyra-ham er virk?

Í stað GPS-tengdra KPI (Total Distance, Vel Band 5/6) notar kerfið þessa:

| KPI | Hvað mælir | Einingar |
|-----|------------|----------|
| **Player Load** | Heildarálag — samsett úr hröðun í öllum áttum | stig |
| **FMP Dynamic High** | Tími í háum, kvikum hreyfingum (sprint, COD) | sekúndur |
| **FMP Dynamic Medium** | Tími í miðlungs kvikum hreyfingum | sekúndur |
| **FMP Running High** | Tími í háu hlaupi (línulegu) | sekúndur |
| **IMA Total** | Heildarfjöldi hraðra hreyfinga (áreiti) | fjöldi |

Player Load er notað í báðum hömum og er því stöðugur þráður milli
úti- og inni-æfinga.

### Virkar allar þrjár aðferðirnar?

Já, allar þrjár aðferðir virka nákvæmlega eins og í úti-ham:

- **Söguleg meðaltöl:** Kerfið reiknar 8 vikna rolling average af FMP KPI-unum.
- **Leikálag:** Kerfið finnur síðustu innandyra-leiki (futsal, hall-leikir)
  og reiknar meðaltal úr FMP mælingum leikmanna sem stóðust FULL síuna.
  Sjálfgefna MD-dagur prósentutaflan er þegar útfyllt með FMP-gildum,
  svo kerfið virkar strax út úr kassanum.
- **Markmið þjálfara:** Þú slærð inn vikuleg markmið fyrir FMP KPI-in í
  stillingaglugganum (t.d. Player Load: 2500 stig, FMP Dynamic High: 180 s).

Stillingaglugginn sér sjálfkrafa hvort liðið sé í innandyra-ham og sýnir
réttu KPI-in. Þú sérð líka lítinn **„Innandyra"** merkimiða á Vikuálag
spjaldinu svo augljóst sé að kerfið sé í FMP-ham.

### Hvað ef liðið skiptir milli úti og inni á sama tímabili?

Þegar þú slekkur á innandyra-ham skiptir kerfið aftur á GPS KPI-in.
Sögulegu gögnin eru ekki snert — Player Load-gildin eru sömu, en þú
færð að auki Total Distance, Vel Band o.fl. aftur í spjaldið.
Sama `match_demand_template` jsonb geymir bæði úti- og inni-prósentur
samhliða, svo ekkert týnist við skiptingu.

### Hvernig finnur kerfið leikina innandyra?

Forgangsröð leik-detection er sú sama og úti:

1. **`team_schedule_events.event_type = 'match'`** — besta leiðin, þú merkir
   leikinn beint í áætlun liðsins.
2. **`week_plans.day_type = 'GAME'`** — önnur leiðin, ef þú ert að nota
   vikuplan-borðið.
3. **Player Load fallback** — ef hvorugt ofangreint er til staðar, leitar
   kerfið að dögum þar sem meðaltals Player Load fer yfir þröskuld
   (default 550). Úti-ham notar Total Distance í staðinn (default 8000 m),
   en innandyra er GPS ≈ 0 svo Player Load er eina leiðin.

Þú getur stillt Player Load þröskuldinn í stillingaglugganum — hann birtist
sjálfkrafa þegar liðið er í innandyra-ham, í stað TD inntakisins. Viðmið:

- Dæmigerður innandyra-leikur (90 mín, 11v11): **550–850 PL**
- Dæmigerð innandyra-æfing (60–90 mín): **250–500 PL**

Ef þú finnur að of margar æfingar eru flokkaðar sem leikir, hækkaðu
þröskuldinn í t.d. 650. Ef leikir eru að sleppa undir radarnum, lækkaðu
í 450.

### Viðvörun þegar engir leikir finnast

Ef Leikálag-aðferðin er virk en kerfið finnur enga leiki á síðustu
lookback-dögum (default 120), birtir Vikuálag-spjaldið gula viðvörun efst
með tengli beint í stillingar. Þetta gerist oft í upphafi nýs tímabils
eða þegar þjálfari nýtti ekki áætlunina — þá veistu strax að þú þarft
annaðhvort að merkja leikina eða lækka þröskuldinn.

### Ráð fyrir innandyra-lið

- Ef þú ert bara með eina hall-æfingu á viku og restin er úti, haltu
  kerfinu á **úti-ham**. Innandyra-hamurinn er fyrir lið sem eru _aðallega_
  innandyra (t.d. yfir veturinn þegar öll heimaleikir og æfingar eru
  í höll).
- **FULL sían (75 mín)** virkar sömuleiðis fyrir innandyra-fótbolta þar sem
  leikir eru enn 90 mín — engin breyting þörf.
- Default MD-prósenturnar eru útsprettur af útigildunum. Player Load er
  þægilegur stöðugur þráður — hann er mældur eins úti og inni — en
  FMP-prósenturnar eiga við um hreyfingarmynstur og ættu að vera nálægt
  réttu. Ef þú finnur að markmiðin eru kerfisbundið of há eða lág,
  aðlagaðu `match_demand_template` í gagnagrunninum.
- Gættu þess að merkja innandyra-leikina í áætlun (`week_plans` eða
  `team_schedule_events`). Ef þú gerir það ekki lítur kerfið á Player Load
  fallback-inn — en beint áætlunar-hit er nákvæmara.

---

## Vísindaleg heimild — hvers vegna Leikálag aðferðin?

Leikálag aðferðin er byggð á þessum rannsóknum:

- **Martin-Garcia o.fl. (2018)** — Barcelona B gögnin sem sýndu dæmigerða
  prósentudreifingu á MD-5 → MD+1. Sjálfgefnu prósenturnar í kerfinu
  koma þaðan.
- **Akenhead o.fl. (2016)** — Training-to-match ratio frameworkið sem
  rökstyður að æfingar ættu að vera hlutfall af leik, ekki sjálfstætt
  meðaltal.
- **Stevens o.fl. (2017)** — Sýndi að mismunandi KPI hafa ólíka prósentu
  (t.d. Velocity Band 6 er mun hærra prósentu af leik en heildarvegalengd)
  og þess vegna notar kerfið sér prósentu fyrir hvert KPI.
- **Impellizzeri, Bornn, Lolli (ACWR critiques)** — Þess vegna er ACWR
  ekki eina viðmið kerfisins heldur er leikálagsaðferðin sjálfstæð.

---

Ef eitthvað er óljóst eða þú vilt aðra sjálfgefna töflu (t.d. fyrir
þinn aldursflokk) þá er hægt að aðlaga MD-dags prósenturnar beint í
gagnagrunninum eða ég get sett upp annan preset.
