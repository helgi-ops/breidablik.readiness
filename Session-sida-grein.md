# Session síðan — hvað hún gerir fyrir þjálfara

## Inngangur

Session síðan er miðlægi vinnustaður þjálfara í Breiðabliks kerfinu. Hún sameinar tvö aðskilin en samtengd verkfæri: drill library (æfingasafn) þar sem þjálfari geymir og leitar að drillum, og session builder (æfingabyggjara) þar sem hann raðar þeim saman í æfingu. Markmiðið er einfalt: gera það auðvelt að plana vísindalega studdar æfingar sem passa við álagsstöðu liðsins þann daginn.

Síðan er byggð á GPS/Catapult gögnum frá eigin æfingum liðsins og samþættir niðurstöður úr stórum systematískum yfirlitum (Hill-Haas 2011), beinum application rannsóknum (Lacome 2018, López-Fernández 2019) og metabolic power líkaninu (Osgnach 2010). Þjálfarinn þarf ekki að lesa sjálfur þessar rannsóknir — þær eru bakaðar inn í viðmót síðunnar sem litakóðaðar ábendingar, mælieiningar og viðvörunar.

## Tvær meginsíður sem vinna saman

Fyrri helmingurinn er drill library. Þarna á þjálfari öll sín æfingabrot: SSG (small-sided games), possession drills, transition drills, running drills, finishing drills, warm-up og "annað". Hver drilla inniheldur ítarleg GPS álagsmælingu sem var annaðhvort seed-uð úr Excel, flutt inn handvirkt eða sjálfkrafa reiknuð út frá eigin Catapult gögnum. Það er hægt að bæta við nýjum drillum, afrita þær, breyta þeim og eyða.

Seinni helmingurinn er session builder. Þarna er drillum dregið inn í raðaða sessioning þar sem þjálfari tiltekur fjölda setta og endurtekninga. Byggjarinn leggur saman allar álagsmælingar í rauntíma og ber saman við sögulegt álag fyrir þennan æfingadag (MD-saga) sem reiknast úr gagnagrunninum. Þegar sessionning er rauntilbúin er hún flutt út sem PDF sem hægt er að prenta út eða deila.

## Drill Library í þaula

### Flokkar og sía

Drillur eru flokkaðar í sjö kategóríur: possession, SSG, transition, running, finishing, warm-up og annað. Í efsta röð síðunnar er flokkarsía sem þrengir útlitið og leitarreitur sem leitar bæði í nafni og lýsingu drillunnar. Player Load síur gera þjálfara kleift að þrengja niður í ákveðið álagsbil, til dæmis "sýndu mér bara drillur með PL á milli 60 og 120" — mjög handhægt þegar hann er að byggja léttari MD-1 session.

### Drill spil

Hvert drill spjald sýnir sex lykilmælingar í grid: Player Load, PL/mín, Duration, Distance, HIR og völlur. Undir þeim eru fjórir mælikvarðar til viðbótar: m² per leikmann, fjöldi leikmanna, HMLD (high metabolic load distance) og metabolic power. Ef metabolic gildin eru estimated frá player_load (sem þau eru í flestum drillum þar til raunveruleg Catapult mæling kemur) er HMLD merkt "HMLD (est)" svo þjálfarinn viti að þetta sé proxy en ekki mæling.

Efst á hverju spili eru þrjú litakóðuð badges sem koma úr rannsóknum. **Intensity** badge sýnir áætlaða HRmax prósentu og hvaða MD-daga drillan passar við — byggt á Hill-Haas töflum I–IV sem mappa player count × area per player yfir í %HRmax. **Stimulus** badge flokkar drilluna í Mechanical (mikið accel/decel, lítið hraðaspretti), Locomotive (mikið v5+v6, lítið mechanical), Mixed eða Technical. **Format** badge sýnir format (4v4, 6v6 o.s.frv.) og tengir það við Lacome 2018 fitness-markmið: strength-focus við minni fjölda, aerobic við 5v5-6v6, match-like við 7v7-8v8 og endurance við 9v9+.

### Detail modal

Þegar smellt er á drillu opnast detail modal með fjórum panelum. **Intensity panel** sýnir áætlaða %HRmax fyrir ákveðna drill-stærð (m²/leikmann × fjöldi leikmanna), ásamt litakóðuðu bandi (grænn / gulur / appelsínugulur / rauður) og ábendingu um hvaða MD-dögum þessi drilla passar fyrir.

**Stimulus panel** sýnir hvers vegna drillan er flokkuð eins og hún er. Hún sýnir HSR (v5+v6 samanlagt) í metrum og Accel+Decel B2-3 sem tala. Flokkunarlogíkin er einföld: Locomotive ef HSR ≥ 75m og AccDec < 12, Mechanical ef HSR < 25m og AccDec ≥ 6, Technical ef bæði eru undir viðmiðum, Mixed annars. Þetta hjálpar þjálfara að velja drillur sem passa við hvað liðið þarf að leggja áherslu á þann daginn.

**Format panel** gefur concrete recommendations byggð á Lacome og López-Fernández. Hún segir þér fitness-markmiðið (strength, aerobic, match-like, endurance), hvaða positionir liðsins þessi drill overloadar vs underloadar, hvað ákjósanleg bout duration er (til dæmis 3–5 mín fyrir 4v4 með 90–120s rest), og birtir viðvaranir ef völlurinn er of stór (plateau warning ef m²/leikmann > 110 og perTeam ≤ 5) eða of lítill.

**Metabolic panel** sýnir Osgnach-tengdar metrics: avg MetPwr, peak MetPwr, HMLD (>25.5 W/kg) og tíma yfir þröskuldi. Ef values eru estimated frá player_load er title merkt "áætlað frá PL" svo þjálfarinn viti staðreyndina.

Á botni hverrar drillu er ítarlegur álagslisti sem sýnir öll Catapult fields: Player Load, PL/mín, HIR total, Vel B5, Vel B6, Accel total, Decel total, Accel B2-3, Decel B2-3. Þetta gerir þjálfara kleift að bera saman drillur sem líta eins út á yfirborðinu.

### Breyta og afrita

Þjálfari getur opnað "Breyta" á þeim drillum sem hann á sjálfur (eða öllum ef hann er admin) og breytt öllu: nafni, flokki, lýsingu, vellinum, fjölda leikmanna, duration, og öllum GPS gildunum. Áhugaverðara: þjálfari getur breytt metabolic gildunum handvirkt. Ef hann hefur fengið raunveruleg Catapult metabolic gögn fyrir þessa ákveðnu drillu (t.d. frá drill-segment sync) þá slær hann inn og slekkur á estimated-flagginu, og þá stoppar kerfið að meðhöndla þessi gildi sem proxy.

"Afrita" skapar nýja drillu með sama nafni og "(afrit)" í enda, sem þjálfari getur svo breytt og aðlagað. Þetta er gagnlegt þegar þú vilt gera litla breytingu á existing drillu án þess að tapa upprunalegri.

## Session Builder í þaula

### Grunn flow

Þjálfari velur dagsetningu, MD-dag (MD-1 til MD-5 eftir því hversu langt í næsta leik), og gefur session-inu nafn. Síðan dregur hann drillur inn úr drill library (í hliðarsafni) og setur inn fjölda setta fyrir hverja. Drillur er hægt að endurraða með drag-and-drop.

### Totals strip

Efst á session-inu er strip með átta samanlögðum mælingum: Player Load, Duration, Distance, PL/mín, Vel B5, Vel B6, Accel B2-3 og Decel B2-3. Þær eru reiknaðar í rauntíma og margfaldaðar með fjölda setta. Þetta gefur þjálfara strax yfirlit yfir hvernig sessionning hleður sig upp.

Undir aðal-strippinum er nýr metabolic totals strip (indigo bakgrunnur) sem birtist aðeins ef einhver drilla hefur metabolic data: HMLD samanlagt, time > HML, duration-weighted average MetPwr og peak MetPwr. Þetta gefur þjálfara sýnileika yfir metabolic kostnað sessioningsins — sem er mikilvægt af því að mikil accel/decel work getur haft lágan distance score en háan metabolic cost.

### MD-saga samanburður

Þegar þjálfari velur MD-dag (t.d. MD-4) kallar kerfið í planning metrics úr sögulegum gögnum: meðalfjöldi session fyrir þessa MD á fortíð, meðalfjöldi leikmanna, og planning band (lágt-hátt) fyrir Player Load, duration, distance, HSR o.s.frv. Síðan ber það saman rauntíma session-gildi við þessi bönd. Ef totals falla utan bandsins (t.d. PL er of lágt) birtist orange-lit viðvörun; ef innan er græn OK-merki.

### PL band bar

Þetta er sjónræn slabbar sem sýnir núverandi Player Load vs markmið (target) eða vs MD-sögu band. Slabbarinn er litaður eftir því hvort session er í bandinu (grænn), undir (appelsínugulur), eða yfir (rauður). Þjálfari getur stillt target beint eða látið kerfið nota MD-sögu bandið sjálfvirkt. Þetta er líklega mest noteð UI elementið á síðunni: það sýnir á einni svipstundu hvort sessionning er "rétt" hvað varðar álag.

### Stimulus distribution bar

Undir PL band-barnum er stimulus dreifibar. Hann sýnir hvaða hlutfall session-álagsins kemur úr Mechanical, Locomotive, Mixed og Technical stimulus drillum. Vægin eru byggð á sets (setti × drillu). Þetta hjálpar þjálfara að átta sig á því hvort sessioning er balanseruð eða ekki. Ef sessioning er 80% mechanical og 0% locomotive, þá veit hann að hún er mjög einhliða og vantar running/sprint work.

### PDF export

Þegar session er klár er hægt að sækja PDF. Hann er snyrtilega formatted og inniheldur alla drillu, álagssamanburð og MD-saga. Þetta er það sem er prentað út og deilt með aðstoðarþjálfurum, leikmönnum eða hengt upp í klefanum.

## Vísindagrunnur baki síðunnar

Síðan vísar í fjórar grundvallarannsóknir sem gera hana vísindalega.

**Hill-Haas et al. (2011)** er systematískt yfirlit um SSG þjálfun í fótbolta, Sports Med 41(3):199–220. Úr þessari rannsókn eru notaðar Tables I–IV sem mappa player count (1v1, 2v2, 3v3, 4v4, 5v5, 6v6, 8v8) × area per player yfir í %HRmax. Í kerfinu er þetta notað til að áætla HR intensity fyrir hverja drillu út frá stærð vallarins og fjölda leikmanna. Þetta er grunnurinn fyrir intensity-badge og MD-daga recommendations.

**Lacome et al. (2018)** skoðaði SSG formats hjá PSG í IJSPP og skildi þau niður eftir fitness-markmiðum. Samkvæmt þeim passa minni formats (2v2–4v4) fyrir strength/mechanical þróun, 5v5–6v6 fyrir aerobic, 7v7–8v8 fyrir match-like conditioning og 9v9+ fyrir endurance. Lacome fann líka position-specific overload pattern: í 5v5 overloadast CDs mikið vs CMs, í 7v7 overloadast CDs á HS work en CMs á mechanical work. Þetta er kóðað inn í format-panelið.

**López-Fernández et al. (2019)** í Journal of Strength and Conditioning Research 33(3) fann plateau í álagsviðbrögðum þegar m²/leikmann fer yfir ~110. Þar fyrir ofan hættir áframhaldandi stærðaukning að auka HR-response hjá litlum leikmannafjölda (5v5 og neðar). Þessi niðurstaða er bakuð inn sem viðvörun í format-panel: "plateau warning — area per player > 110 m² gefur ekki meiri álagsávinning í svona lítilli drill".

**Osgnach et al. (2010)** í Med Sci Sports Exerc 42(1) skilgreindi Metabolic Power líkanið. Metabolic power er framlenging á einföldum hraða-mælingum sem er útrikið með því að bæta accelerations inn. Formúlan gefur W/kg tölu sem sýnir raunverulegt metabolic kostnað hvers augnabliks. HMLD er distance sem leikmaður fer yfir þegar metabolic power er yfir 25.5 W/kg þröskuldi. Þetta er mikilvægt af því að drillur með mikil accelerations en litla hraða (eins og 4v4 possession) sýna lágan Vel B5/B6 en geta haft mjög hátt HMLD. Kerfið sýnir nú HMLD fyrir hverja drillu og fyrir heila sessioning.

## Workflow dæmi

Taktu þjálfara sem er að plana MD-4 (hörð æfing, mið á milli leikja). Hann opnar Session Builder, velur MD-4, og kerfið fyllir inn MD-4 sögu-band (t.d. PL 350–420, duration 75–90 mín, HSR ≥ 200m). Hann byrjar með warm-up drillu (10 mín), síðan tekur 4v4 possession (mechanical stimulus, 3×5 mín) til að hækka accel/decel load, svo 8v8 match-play (aerobic stimulus, 2×12 mín) til að bæta við HSR og HRmax exposure. Á milli sér hann að PL band-barinn fer frá appelsínugulum undir yfir í grænan í bandinu, og stimulus distribution er balanseruð (~30% mechanical, 40% mixed, 25% locomotive, 5% technical). Hann sér líka að HMLD samanlagt er kringum 850m, sem er í MD-4 bandinu fyrir metabolic kostnað. Hann smellir á "Sækja PDF" og deilir með assistant-um.

Einn klst síðar, á MD-1 degi, opnar hann nýja session, velur MD-1, fær PL target 80–120. Hann dregur inn tvær léttar possession drillur og eitt activation running, PL fer upp í 95 — grænn. Stimulus distribution sýnir 60% technical, 30% mixed — passar MD-1 þar sem þjálfarar vilja halda leikmönnum skörpum en ekki hlaða upp mekaníska álagi. PDF er sóttur.

## Aðgangskerfi og team-scoping

Drill library er team-scoped. Þjálfarar sjá bara drillur fyrir sitt eigið lið, nema þeir séu admin eða staff. Coach getur breytt/eytt bara þeim drillum sem hann bjó til sjálfur, en getur afritað hvaða drillu sem er í sitt eigið safn. Seed drillur (úr Excel), Catapult drillur (úr sync) og public templates eru allar læstar nema admin geti breytt þeim. Þetta gerir það mögulegt að hafa sameiginlegt grunn-sett af drillum sem allir þjálfarar samgangast við, en ennþá persónulegt rými fyrir sérsniðin variation.

## Framtíðarvinna

Kerfið er tilbúið fyrir næstu stig. Stigi 2 væri að bæta við HMLD vs MD-saga band-panelum í session builder, svipað og PL band sem þegar er virkur — þá myndi þjálfari sjá hvort metabolic kostnaður sessionings er innan MD-4 metabolic-bands. Stigi 3 væri að tengja við player-specific fatigue flags: ef ákveðnir leikmenn eru með "metabolic fatigue" merkingu úr metabolicLoad.ts, birtist banner í session builder sem segir "Jón og Anna eru í metabolic risk — íhugaðu að slökkva á þeim í hæstu drillum".

Stærri vegferðin: Catapult drill-segment sync. Í dag eru drillur handvirkar eða seed-aðar frá Excel. Framtíðin er að Catapult sync dragi út drillu-segment-merki sem þjálfari bjó til í Openfield á æfingu, og skrifi þau sjálfvirkt inn í drill_library með raunverulegum metabolic fields. Þá munu estimated gildin víkja fyrir raunverulegum mælingum, og kerfið verður með margar kalíbrunarpunkta.

## Samantekt

Session síðan er ekki bara verkfæri til að byggja æfingar — hún er þýðingatæki milli rannsóknargagna og praktískrar þjálfunar. Hún tekur Hill-Haas töflur, Lacome position-findings, López-Fernández plateau viðmið og Osgnach metabolic líkanið, og þýðir þau yfir í badges, bars og viðvaranir sem þjálfari les á einni svipstundu. Hún ber saman rauntíma session við eigin sögu liðsins, flaggar ójafnvægi, og skilar PDF sem hægt er að nota beint. Markmiðið er að spara þjálfara tíma og tryggja að hver æfing sé studd af bæði vísindum og sögulegum gögnum liðsins sjálfs.
