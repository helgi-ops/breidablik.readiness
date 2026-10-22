# MicroPulse — safn skilaboða

Uppköst að tölvupóstum og skilaboðum. Skiptu út `[nafn]` og aðlagaðu tón eftir þörf.

---

## 1. Þakkir til þjálfara — hópur

Kæru þjálfarar,

Mig langar að byrja á að þakka ykkur kærlega fyrir að hafa prófað MicroPulse með okkur á tímabilinu. Það hefur skipt öllu að fá ykkur til að nota kerfið í alvöru og segja mér hvað virkar og hvað ekki — þannig verður þetta betra.

Nú er tímabilið að klárast, og mér finnst upplagt að við tökum bara gott spjall þegar því er lokið um hvernig ykkur fannst þetta og hvort þið hafið áhuga á að halda áfram að nota kerfið. Engin pressa af minni hálfu — mig langar fyrst og fremst að heyra reynsluna ykkar.

Á meðan hef ég haldið áfram að þróa kerfið og bætt við nokkrum hlutum síðustu vikurnar sem gætu haft áhuga:

- Nýtt lag sem sýnir hvað ákafustu mínútur leikmanns eru í raun gerðar úr — hvort ákafinn er sóknar-sprettir fram á við eða endurheimtar-hlaup til baka.
- Snemm-merki um álag og ójafnvægi (hægri/vinstri ósamhverfa, endurteknir sprettir, þróun í stökkkrafti) sem geta gefið vísbendingu um aukna álags- eða meiðslahættu — alltaf sem viðvörun við hliðina á dómnum, aldrei í staðinn fyrir hann.
- Ný Catapult-gögn að flæða inn (endurteknir háákefðar-sprettir og hlaupa-samhverfa).
- Einfaldara viðmót — ég er að færa lykil-merkin fram á forsíðuna svo það sé minna flakk milli síðna.

Ég heyri í ykkur þegar tímabilið er búið og við finnum tíma. Takk aftur fyrir samstarfið — það hefur verið virkilega gaman.

Kveðja,
Helgi Jónas Guðfinnsson

---

## 2. Þakkir til þjálfara — einstaklingur

Sæll [nafn],

Mig langar að þakka þér kærlega fyrir að hafa prófað MicroPulse með okkur á tímabilinu. Það hefur skipt öllu að fá þig til að nota kerfið í alvöru og segja mér hvað virkar og hvað ekki — þannig verður þetta betra.

Nú er tímabilið að klárast, og mér finnst upplagt að við tökum bara gott spjall þegar því er lokið um hvernig þér fannst þetta og hvort þú hafir áhuga á að halda áfram að nota kerfið. Engin pressa af minni hálfu — mig langar fyrst og fremst að heyra þína reynslu.

Á meðan hef ég haldið áfram að þróa kerfið og bætt við nokkrum hlutum síðustu vikurnar sem gætu haft áhuga:

- Nýtt lag sem sýnir hvað ákafustu mínútur leikmanns eru í raun gerðar úr — hvort ákafinn er sóknar-sprettir fram á við eða endurheimtar-hlaup til baka.
- Snemm-merki um álag og ójafnvægi (hægri/vinstri ósamhverfa, endurteknir sprettir, þróun í stökkkrafti) sem geta gefið vísbendingu um aukna álags- eða meiðslahættu — alltaf sem viðvörun við hliðina á dómnum, aldrei í staðinn fyrir hann.
- Ný Catapult-gögn að flæða inn (endurteknir háákefðar-sprettir og hlaupa-samhverfa).
- Einfaldara viðmót — ég er að færa lykil-merkin fram á forsíðuna svo það sé minna flakk milli síðna.

Ég heyri í þér þegar tímabilið er búið og við finnum tíma. Takk aftur fyrir samstarfið — það hefur verið virkilega gaman.

Kveðja,
Helgi Jónas Guðfinnsson

---

## 3. Póstur til Frans — MicroPulse × VALD

**Efni: MicroPulse × VALD — hvernig þetta er tengt og hvað er hægt**

Sæll Frans,

Þú nefndir að þið væruð að spá í VALD — mig langaði að segja þér frá því hvernig MicroPulse er tengt við VALD núna, því það gæti breytt myndinni fyrir ykkur.

Tengingin sjálf virkar á þrjá vegu, allir enda í sömu gögnum:

- Bein tenging við VALD Hub (API + webhook) — prófin flæða sjálfkrafa inn um leið og þau eru tekin, ekkert handvirkt.
- CSV-innflutningur ef þið viljið hlaða inn í hópum.
- PDF-skýrslur — hægt að staðfesta tölur úr VALD-skýrslu og fá þær inn á sama stað.

Tækin þrjú eru öll studd: ForceDecks (CMJ, IMTP, drop jumps, single-leg próf), NordBord (aftanlæri) og ForceFrame (nári/aðleiðarar). Kerfið geymir alla mælikóða sem VALD sendir, svo ekkert glatast og ný próf þurfa ekki uppfærslu.

Það sem er svo hægt að gera — og þetta er punkturinn, því VALD-gögnin sitja við hliðina á GPS/álagi og líðan á sama stað:

- CMJ lesið sem taugavöðva-þreyta og endurheimt — við horfum á þróun yfir daga, ekki eina mælingu, með áminningum þegar próf vantar.
- Snemm-viðvaranir um meiðslahættu: hægri/vinstri ósamhverfa í aftanlæri (NordBord) og nára (ForceFrame) + taugavöðva-merki flæða inn í readiness/álags-merkin — alltaf sem viðvörun við hliðina á dómnum, aldrei í staðinn fyrir hann.
- Return-to-play kraftplötu-batterí (CMJ/ForceDecks) með viðmiðum fyrir ákvarðanir um endurkomu.
- Ferskleiki hverrar mælingar (nýtt / gamalt / vantar) svo þið sjáið hverjir eru komnir í próf og hverjir ekki.

Stóri kosturinn er ekki VALD eitt og sér heldur að fá VALD, GPS/Catapult og líðan leikmanna á einn stað þar sem þau tala saman.

Ef þú vilt sýni ég þér þetta bara á skjánum, tekur svona 15 mínútur. Láttu mig vita hvað hentar.

Kveðja,
Helgi Jónas Guðfinnsson

---

## 4. Kynningarpóstur til klúbba (kalt)

**Efni: MicroPulse — að nýta álags- og heilsugögn leikmanna án þess að drukkna í þeim**

Sæl/sælir,

Ég biðst fyrst velvirðingar á að senda ykkur þennan póst óumbeðið — ég vona að ég sé ekki að trufla. Ég heiti Helgi Jónas Guðfinnsson og hef undanfarið verið að þróa kerfi sem heitir MicroPulse, og mig langaði að heyra hvort þið hefðuð áhuga á stuttri kynningu.

Vandamálið sem ég sé hjá flestum klúbbum er ekki skortur á gögnum — það er hið gagnstæða. Tækin eru til staðar: GPS/Catapult, VALD kraftplötur, tölfræði úr leikjum, líðan leikmanna. En gögnin safnast upp mun hraðar en nokkur hefur tíma til að vinna úr þeim. Starfsmenn eru fáir, tíminn lítill, og oft er enginn sérstakur styrktar- eða álagsþjálfari til að breyta töflunum í ákvarðanir. Útkoman er dýr kerfi sem eru vannýtt og gögn sem enginn kemst yfir að lesa.

MicroPulse er byggt til að leysa einmitt þetta. Það tekur gögnin sem þið eruð nú þegar að safna og breytir þeim í einfaldan daglegan dóm fyrir hvern leikmann — er hann klár í fullt álag í dag, eða þarf að stilla af — með skýrri ástæðu á bak við, ekki svörtum kassa. Þjálfari fær eina yfirlitssíðu á morgnana í stað þess að opna fimm ólík kerfi. Það vinnur með tækin sem þið hafið nú þegar (Catapult, VALD, StatsBomb/Wyscout) og sparar þann tíma sem þið hafið ekki.

Í stuttu máli, hvað það getur gert fyrir ykkur:

- Sameinar álag, heilsu og líðan leikmanna á einn stað.
- Daglegur readiness-dómur með skýringu og öryggisstigi — hjálpar við að stýra álagi og draga úr meiðslahættu.
- Snemm-viðvaranir um álag og ójafnvægi áður en þau verða að vandamáli.
- Sparar þjálfurum og teymi tíma — kerfið vinnur úr gögnunum, þið takið ákvarðanir.

Ég myndi glaður sýna ykkur þetta í 20–30 mínútna kynningu, á staðnum eða á fjarfundi, án nokkurra skuldbindinga. Hefðuð þið áhuga?

Kveðja,
Helgi Jónas Guðfinnsson

---

## 5. FB-skilaboð til Antons

Sæll Anton! Hvernig hefurðu það?

Datt í hug að heyra í þér — ég er búinn að vera að þróa kerfi sem heitir MicroPulse og held að það gæti alveg átt erindi við ykkur.

Í stuttu máli: flestir klúbbar eru komnir með nóg af gögnum (Catapult, VALD, tölfræði úr leikjum, líðan leikmanna) en enginn hefur tíma eða mannskap til að vinna úr þeim — fáir starfsmenn, lítill tími. MicroPulse tekur það sem þið eruð nú þegar að safna og breytir því í einfaldan daglegan dóm á hvern leikmann: klár í fullt álag í dag eða þarf að stilla af, með skýrri ástæðu á bak við. Ein yfirlitssíða á morgnana í stað þess að opna fimm ólík kerfi.

Væri gaman að sýna þér þetta ef þú hefur áhuga — tekur svona 20 mín, á fjarfundi eða yfir kaffi. Ertu til? 🙂

---

## 6. Skilaboð til Eysteins Lárussonar (framkvæmdastjóra KSÍ)

Sæll Eysteinn,

Vona að allt leiki í lyndi hjá þér. Mig langaði að deila með þér verkefni sem ég hef verið að vinna að og heyra þín sjónarmið — ekki til að reyna að selja þér neitt, heldur af því að þú hefur betri yfirsýn en flestir yfir íslenska boltann.

Ég hef verið að þróa kerfi sem heitir MicroPulse. Það sprettur af vandamáli sem ég sé víða hjá klúbbum: tækin og gögnin eru til staðar (GPS/Catapult, VALD, tölfræði úr leikjum, líðan leikmanna) en fáir starfsmenn og lítill tími gera það að verkum að gögnin nýtast illa. MicroPulse tekur það sem klúbbar eru nú þegar að safna og breytir því í einfaldan daglegan readiness-dóm á hvern leikmann, með skýrri ástæðu á bak við — hjálpar við álagsstjórnun og að draga úr meiðslahættu, án þess að þurfa heilt greiningarteymi.

Mér þætti vænt um að heyra hvað þér finnst — hvort þú sjáir að svona nokkuð eigi erindi í íslenskan fótbolta, og hvort þetta sé eitthvað sem KSÍ hefði áhuga á að fylgjast með eða spjalla um. Engin pressa af minni hálfu; ég met einfaldlega sjónarhornið þitt mikils.

Kveðja,
Helgi Jónas Guðfinnsson

---

## 7. Skilaboð til Davíðs

Sæll Davíð,

Ég biðst velvirðingar á að senda þér þessi skilaboð svona upp úr þurru — vona að ég sé ekki að trufla. Mig langaði bara að heyra í þér.

Ég hef undanfarið verið að þróa kerfi sem heitir MicroPulse og held að það gæti átt erindi við ykkur. Í stuttu máli: flestir klúbbar eru komnir með nóg af gögnum (Catapult, VALD, tölfræði úr leikjum, líðan leikmanna) en fáir starfsmenn og lítill tími gera það að verkum að gögnin nýtast illa. MicroPulse tekur það sem þið eruð nú þegar að safna og breytir því í einfaldan daglegan dóm á hvern leikmann — klár í fullt álag í dag eða þarf að stilla af, með skýrri ástæðu á bak við. Ein yfirlitssíða á morgnana í stað þess að opna fimm ólík kerfi, og sparar þann tíma sem enginn hefur.

Væri gaman að sýna þér þetta ef þú hefur áhuga — tekur svona 20 mínútur, á fjarfundi eða yfir kaffi. Alls engin pressa.

Kveðja,
Helgi Jónas Guðfinnsson
