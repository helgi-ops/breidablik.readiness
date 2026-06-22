# MicroPulse — drög að umsókn í Tækniþróunarsjóð (Rannís)

> Vinnudrög. Fylltu inn [hornklofa]. Sniðið er hugsað fyrir **Sproti**-flokk Tækniþróunarsjóðs (vara komin í notkun, markmið að koma henni á markað). Ef þú ert nær hugmyndastigi á tilteknum hluta, skoðaðu **Fræ**; ef þú ert lengra með sölu/tekjur, skoðaðu **Vöxt**.

---

## 0. Eitt-línu lýsing (the hook)

MicroPulse er skýranlegt (e. *explainable*) álags- og þjálfunarkerfi fyrir íþróttalið og einkaþjálfara: það breytir GPS-/styrktargögnum í daglega, rökstudda ákvörðun um hvað hver iðkandi á að gera — og útskýrir alltaf *af hverju*, með vísun í rannsóknir.

---

## 1. Samantekt verkefnis

MicroPulse er íslenskt sport-tæknikerfi sem þegar er í daglegri notkun hjá [Breiðabliki] (knattspyrnu) og einkaþjálfunar­viðskiptavinum. Kerfið sameinar tvennt sem í dag er dreift á dýr, aðskilin erlend verkfæri: (1) **álagsvöktun og viðbragð** (GPS/IMA, ACWR, readiness check-in í grænt/gult/rautt) og (2) **þjálfunarforskrift** (vikuplön, æfingakerfi, sjálfvirk framvinda á þyngdum, markmiðamiðaðar tillögur).

Sérstaða MicroPulse er **skýranleiki**: hver litur, hvert flagg og hver tillaga ber með sér rökstuðning og heimild (t.d. Gabbett 2017 um ACWR, Buchheit 2024, McBurnie 2022 um stefnubreytingar). Reglur taka ákvarðanir, gervigreind útskýrir — aldrei öfugt. Þetta gerir kerfið nothæft fyrir þjálfara *án* sérmenntunar í styrktar- og þrekþjálfun, sem er stærsti flöskuhálsinn í greininni.

Markmið verkefnisins með stuðningi Tækniþróunarsjóðs er að taka MicroPulse úr „virkar fyrir okkar lið/viðskiptavini" yfir í **sölulega vöru fyrir íslenskan og norrænan markað**, með (a) vísindalegri sannprófun aðferðafræðinnar, (b) þróunaraðstoð til að herða vöruna, (c) markaðssetningu og sölu, og (d) tíma stofnanda í fullu starfi um afmarkað tímabil.

**Stefna verkefnis:** liðs-/klúbba-varan er **sannaði kjarninn** (í notkun hjá Breiðabliki, sterkasta case study og validation), og einkaþjálfunar-varan er **skalanleg útvíkkun á sömu tækni** (sama readiness-, álags- og forskriftarvél, miklu stærri og sjálfsafgreiðslu-vænni markaður). Umsóknin leiðir með liðunum og notar PT sem vaxtarvél.

---

## 2. Vandamálið

Álagsstýring og gagnadrifin þjálfun er orðin staðalbúnaður í afreksíþróttum, en:

- **Verkfærin eru dýr og dreifð.** Lið borga fyrir GPS-kerfi (t.d. Catapult), aðskilin readiness-/wellness-kerfi, og enn önnur kerfi fyrir styrktaræfingar. Kostnaður og flækjustig útilokar minni lið, yngri flokka og einkaþjálfara.
- **Gögnin eru ekki skýranleg.** Flest kerfi sýna tölur og gröf en segja þjálfaranum ekki *hvað hann á að gera* né *af hverju*. Það krefst S&C-sérfræðings að túlka — sem flest lið og einkaþjálfarar hafa ekki.
- **Engin tenging frá mælingu yfir í forskrift.** Readiness-mæling og æfingaplan lifa í sitthvoru kerfinu; enginn lokar lykkjunni („þreyttur í dag → minnka session um 15%").
- **Öryggi ungra iðkenda.** Háþróaðar aðferðir (t.d. French Contrast) eru oft skammtaðar á unglinga/byrjendur án viðeigandi varnagla.

## 3. Lausnin og nýnæmi

MicroPulse leysir þetta í einu, samþættu, vef-/PWA-kerfi (Next.js + Supabase). Nýnæmið felst í:

1. **Skýranleiki-fyrst (e. explainability-first).** Hver ákvörðun ber eigin uppruna og heimild; sami litur sem þjálfarinn sér er það sem skýrslan og gervigreindin sjá. Þetta er kjarnaeiginleiki, ekki viðbót.
2. **Lokuð lykkja mæling → forskrift.** Readiness-litur stillir session dagsins sjálfkrafa (t.d. −15% magn á gulum degi), sýnt iðkanda með skýringu.
3. **Sjálfvirk framvinda (working 1RM).** Kerfið hækkar þyngdir út frá skráðum lyftum innan öruggra marka, með endurprófs-flöggun.
4. **Markmiðamiðaður tillöguvél með öryggis-hliði.** Þjálfari skráir markmið + aldur + reynslu; kerfið mælir með æfingakerfi og **lokar á aðferðir sem henta ekki** (t.d. French Contrast fyrir <18 ára byrjanda) með rökstuðningi.
5. **Sönnuð aðferðafræði innbyggð.** Triphasic (Dietz), contrast/French contrast, plyometrics — hvert með heimild og réttri skömmtun.
6. **Tvítyngt (IS/EN) og aðgengilegt** í síma sem PWA, með tilkynningum.

## 4. Sérstaða / samkeppnisforskot

| Þáttur | Erlendir keppinautar (Catapult, Kitman, TeamBuildr, VALD o.fl.) | MicroPulse |
|---|---|---|
| Verð / aðgengi | Hátt, fyrir afrekslið | Lágt, líka fyrir minni lið, unglinga, einkaþjálfara |
| Skýranleiki | Tölur/gröf, þarf S&C-sérfræðing | Rökstudd ákvörðun + heimild, fyrir alla þjálfara |
| Mæling → forskrift | Aðskilið | Lokuð lykkja |
| Öryggi ungra | Lítið innbyggt | Aldurs/reynslu-hlið innbyggt |
| Tungumál | Enska | Tvítyngt (IS/EN) |

Forskotið er ekki ein eining heldur **samþættingin + skýranleikinn** — erfitt að líkja eftir án þess að endurhugsa alla vöruna.

## 5. Markaður og viðskiptamódel

Tvær samtengdar leiðir á sömu tækni — **beachhead fyrst, svo útvíkkun**:

- **Beachhead (kjarninn): lið og klúbbar.** Knattspyrnu-/handbolta-/körfuboltalið (afreks + yngri flokkar) á Íslandi, svo Norðurlöndum. Heimavöllur, sterk tengsl, Breiðablik sem tilvísun, KSÍ-skýrslur þegar studdar. *Markaðsstærð:* [fylltu inn — fjöldi liða í efstu deildum + yngri flokkum á Íslandi/Norðurlöndum].
- **Útvíkkun (vaxtarvél): einkaþjálfarar og litlar þjálfunarstöðvar.** Sama readiness-/álags-/forskriftarvél, en miklu fjölmennari og sjálfsafgreiðslu-vænni markaður — lægri sölukostnaður per notanda. *Markaðsstærð:* [fylltu inn — fjöldi starfandi einkaþjálfara á Íslandi/Norðurlöndum].
- **Viðskiptamódel:** SaaS áskrift — verð per lið / per þjálfara, þrep eftir fjölda iðkenda og einingum (GPS-vöktun vs. PT-pakki). [Verðhugmynd: kr. X/mán per lið, kr. Y/mán per þjálfara].
- **Söluleið:** (1) bein sala til liða gegnum tengslanet + KSÍ/ÍSÍ-leiðir (Breiðablik „case study"); (2) sjálfsafgreiðslu-innkoma einkaþjálfara gegnum PT-vöruna þegar kjarninn er sannaður.

## 6. Staða verkefnis (traction — þetta er styrkleikinn þinn)

- **Vara í daglegri notkun**, ekki frumgerð: tvær hliðar (lið + einkaþjálfun), vef + PWA, raunverulegir notendur ([Breiðablik] + [X] einkaþjálfunar­viðskiptavinir).
- Virkar einingar þegar í notkun: GPS/IMA-álagsvöktun, ACWR, readiness check-in með rökstuðningi, pre-session álagsáætlun, sjálfvirk 1RM-framvinda, markmiða-tillöguvél með öryggis-hliði, æfingakerfi (Triphasic, Contrast, French Contrast, plyo), KSÍ-skýrslur, tilkynningar.
- Byggt á nútíma stafla (Next.js, Supabase, Vercel) — skalanlegt.
- [Tekjur/áskriftir hingað til: fylltu inn ef einhverjar].

## 7. Markmið styrks og afurðir

Stuðningurinn fer í fjögur samtengd verkefni:

1. **Vísindaleg sannprófun (validation).** Sannprófa lykilaðferðafræði (readiness-litun, ACWR-flögg, Triphasic-/contrast-skömmtun) — t.d. samanburðarmæling, samstarf við háskóla/sérfræðing, eða gagnagreining á eigin notendum. *Afurð:* sannprófuð aðferðafræði + trúverðugleiki gagnvart liðum.
2. **Þróunaraðstoð.** Ráða forritara/hönnuð til að herða vöruna fyrir markað (stöðugleiki, on-boarding, fjölnotenda-stjórnun, greiðslukerfi). *Afurð:* markaðstilbúin útgáfa.
3. **Markaðssetning og sala.** Vefur, kynningarefni, „case study" með Breiðabliki, sölu til fyrstu greiðandi liða/þjálfara. *Afurð:* [X] greiðandi áskrifendur.
4. **Tími stofnanda.** Laun/tími til að vinna í verkefninu í [fullu/hálfu] starfi í [N] mánuði. *Afurð:* hröðun á öllu ofangreindu.

## 8. Verk- og tímaáætlun (drög — aðlagaðu)

| Áfangi | Tímabil | Lýsing | Afurð |
|---|---|---|---|
| 1 | Mán. 1–3 | Vísindaleg sannprófun + on-boarding/greiðslukerfi | Sannprófuð aðferð, sjálfsafgreiðsla |
| 2 | Mán. 3–6 | Herða vöru + „case study" Breiðablik | Markaðstilbúin útgáfa + tilvísun |
| 3 | Mán. 6–9 | Sala til fyrstu liða/þjálfara á Íslandi | [X] greiðandi áskrifendur |
| 4 | Mán. 9–12 | Undirbúa Norðurlanda-markað | Útrásaráætlun + fyrstu erlendu notendur |

## 9. Kostnaðaráætlun (drög — fylltu inn tölur)

| Liður | Kostnaður | Athugasemd |
|---|---|---|
| Laun stofnanda | [kr.] | [N] mán í [fullu/hálfu] starfi |
| Þróunaraðstoð (forritari/hönnuður) | [kr.] | Verktaki/hlutastarf |
| Vísindaleg validation | [kr.] | Samstarf háskóla / sérfræðingur / mælingar |
| Markaðssetning og sala | [kr.] | Vefur, efni, kynningar |
| Innviðir (hýsing, GPS-tæki o.fl.) | [kr.] | |
| **Samtals** | **[kr.]** | Athugaðu mótframlags-reglur sjóðsins |

## 10. Teymi

- **[Helgi Guðfinnsson]** — stofnandi, [bakgrunnur: einkaþjálfun / sport-vísindi / Breiðablik-tengsl]. Hefur byggt vöruna og á tengsl við notendur.
- [Ráðgjafar / samstarfsaðilar: háskóli, S&C-sérfræðingur, Breiðablik — fylltu inn].
- [Plön um ráðningu: forritari/hönnuður með styrk].

> Ábending: sjóðir meta teymi þungt. Ef þú getur bætt við einum ráðgjafa með akademískan/viðskiptalegan bakgrunn styrkir það umsóknina verulega.

## 11. Áhættur og mótvægi

- **Einn stofnandi (lykilmanns-áhætta).** Mótvægi: þróunaraðstoð + skjölun.
- **Sala/markaðsnám.** Mótvægi: byrja á heimavelli með sterka tilvísun (Breiðablik), lágt verð, einkaþjálfara-innkoma.
- **Samkeppni frá stórum erlendum aðilum.** Mótvægi: skýranleiki + verð + tvítyngi + nálægð við markað — þeir keppa illa á þeim ásum.
- **Tæknileg sönnun.** Mótvægi: validation-hlutinn beinlínis hannaður til að loka þessu gati.

## 12. Áhrif (samfélagsleg / efnahagsleg)

- Lýðheilsa og meiðslavarnir: gerir gagnadrifna, örugga þjálfun aðgengilega yngri flokkum og minni liðum — ekki bara afreksliðum.
- Öryggi barna/unglinga: innbyggt aldurs/reynslu-hlið dregur úr óviðeigandi álagi.
- Útflutningstækifæri: íslensk hugbúnaðarvara með Norðurlanda-/alþjóðamarkað.

---

## Viðauki A — Gátlisti: það sem umsóknin mun spyrja um

Hafðu svör tilbúin við þessu (Tækniþróunarsjóður spyr í þessa veru):

1. Hvert er vandamálið og hver er lausnin? *(kafli 2–3)*
2. Hvað er nýtt/frumlegt (nýnæmi)? *(kafli 3)*
3. Tæknileg útfærsla og staða þróunar (TRL-stig)? *(kafli 6)*
4. Markaður, markhópur og stærð? *(kafli 5)*
5. Viðskiptamódel og verð? *(kafli 5)*
6. Samkeppni og samkeppnisforskot? *(kafli 4)*
7. Verk- og tímaáætlun með mælanlegum áföngum? *(kafli 8)*
8. Kostnaðaráætlun og fjármögnun (mótframlag?) *(kafli 9)*
9. Teymi og hæfni? *(kafli 10)*
10. Áhættur og mótvægi? *(kafli 11)*
11. Samfélagsleg/efnahagsleg áhrif og útflutningsmöguleikar? *(kafli 12)*
12. Mælanleg markmið og afurðir styrksins? *(kafli 7)*

## Viðauki B — Næstu skref fyrir þig

1. Athugaðu **umsóknarfresti og flokka** Tækniþróunarsjóðs á rannis.is (Fræ / Sproti / Vöxtur) og veldu réttan miðað við stöðu.
2. Skoðaðu hvort þörf sé á **ehf.** og **mótframlagi** fyrir valinn flokk.
3. Fylltu inn tölur (kostnaður, markaðsstærð, tekjur, fjöldi notenda).
4. Fáðu **einn ráðgjafa/samstarfsaðila** (háskóli eða S&C-sérfræðingur) — styrkir validation og teymi.
5. Búðu til stutt **„case study"** með Breiðabliki (mælanlegur ávinningur) — sterkasta sölu- og umsóknargagnið.
6. Íhugaðu líka: **Erasmus+ Sport / Nordic Innovation** (unglinga-/íþróttavinkill) og **akademískt samstarf** sem viðbótarleiðir.

> Fyrirvari: þetta eru drög til að vinna úr, ekki fjármála- eða lögfræðiráðgjöf. Lokaákvörðun og tölur eru þínar.
