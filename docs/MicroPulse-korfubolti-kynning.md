---
title: "MicroPulse fyrir körfubolta"
subtitle: "Álagsstýring sem virkar innanhúss"
---

# MicroPulse fyrir körfubolta

*Álagsstýring sem virkar innanhúss · Júlí 2026*

---

## Vandinn sem enginn hefur leyst fyrir ykkur

Nánast öll álagsstýring í hópíþróttum er byggð á GPS. Vegalengd, háhraðahlaup, spretti,
hámarkshraði — allt sem álagskerfi mæla byggir á því að vita hvar leikmaðurinn er á vellinum.

Körfubolti er spilaður innanhúss. GPS virkar ekki.

Afleiðingin er sú að körfuboltafélög fá annaðhvort ekkert, eða — sem er verra — kerfi sem sýnir
núll og lætur harða æfingu líta út eins og leikmaðurinn hafi setið hjá. Það er ekki tæknilegt
smáatriði. Það er ástæðan fyrir því að körfuboltinn hefur setið eftir á meðan fótboltinn hefur
haft álagsstýringu í tuttugu ár.

MicroPulse leysir þetta á öfugan hátt: í stað þess að reyna að laga GPS innanhúss hendum við
því vísvitandi og reiknum álagið úr því sem virkar — hröðunarmælum, PlayerLoad og stökkum.

---

## Vikan í körfubolta er ekki eins og í fótbolta

Fótboltavika hefur einn leik og byggist upp í kringum hann: MD-3 er þyngsti dagurinn, MD-1 er
léttur, MD+1 er endurheimt. Öll fótboltakerfi byggja á þessari uppbyggingu.

Körfuboltavika hefur núll til þrjá leiki í óreglulegri röð, og álagsmynstrið er þveröfugt við
það sem flestir búast við.

**Rannsóknirnar segja þetta skýrt.** Salazar og félagar fylgdu EuroLeague-liði í tvö heil
tímabil og fundu að ytra álag raðast **þrír leikir > enginn leikur > tveir leikir > einn
leikur**. Innra álagið — hvað þetta kostar leikmanninn — var hins vegar hæst í vikum **án
leiks**. Conte fann sömu öfugsnúnu niðurstöðu hjá bandarísku háskólaliði: vikur með einum leik
báru **hærra** heildarálag en vikur með tveimur.

Power og félagar mældu hálfatvinnumannalið og sýndu að í þéttum vikum minnka þjálfarar
æfingaálagið milli leikja — og að **þriðji leikurinn í vikunni er þyngsti einstaki atburðurinn**
sem leikmaðurinn upplifir.

Kerfi sem er byggt fyrir fótbolta getur ekki séð neitt af þessu. Það leitar að MD-3 sem er ekki
til.

---

## Hvernig þetta lítur út í kerfinu

### Vikan er skilgreind eftir leikjafjölda

![](img-korfubolti/bb-2-week-setup.jpg){width=100%}

Þú velur hversu margir leikir eru í vikunni og kerfið segir þér við hverju má búast. Þegar þrír
leikir eru valdir kemur skýringin strax: þetta er hæsta ytra-álags vikan, minnka skal æfingaálag
milli leikja, og þriðji leikurinn verður þyngsti atburðurinn.

Takið eftir heimildunum neðst í reitnum. Hver einasta regla í kerfinu vísar í ritrýnda rannsókn,
sýnilega á skjánum sjálfum — ekki falda í handbók. Þjálfari sem er ósammála getur flett upp
hvaðan talan kemur.

### Dagleg ákvörðun á þrjátíu sekúndum

![](img-korfubolti/bb-1-today.jpg){width=100%}

Efst er niðurstaðan í einni setningu. Við hliðina á henni stendur hversu mikið kerfið veit —
hér „hátt traust, 11 af 12 skráðir". Fyrir neðan er samantekt á mannamáli og skipting hópsins.

Þetta er eina skjámyndin sem þjálfari þarf ef allt er í lagi.

### Hver leikmaður fær ákvörðun, ekki bara tölu

![](img-korfubolti/bb-4-decision-summary.jpg){width=100%}

Hvert kort sýnir stöðu leikmannsins, breytinguna frá því síðast, og hvað á að gera — orðað sem
aðgerð en ekki sem einkunn. Hér er einn leikmaður merktur fyrir léttari æfingu og hinir tíu
hreinsaðir í fulla æfingu.

Undir hverju korti eru líðanartölurnar sem lágu til grundvallar. Ekkert er falið.

### Álag innanhúss, án GPS

![](img-korfubolti/bb-3-indoor-load.jpg){width=100%}

Hver æfing er metin úr PlayerLoad, háálags-hröðunarmælingum og stökkfjölda, borið saman við
leikmannsins **eigin** 28 daga meðaltal. Hundrað þýðir venjuleg æfing fyrir hann.

Takið sérstaklega eftir bláa reitnum efst: *„Bráðabirgða-líkan — bíður raun-kvörðunar. Ekkert
körfuboltalið hefur næga IMA-sögu enn til að kvarða vægin."*

Þetta er viljandi. Við erum ekki búin að kvarða líkanið á körfuboltagögnum því engin slík gögn
eru til enn, og kerfið segir það sjálft frekar en að láta eins og það viti meira en það veit.
Fyrsta félagið sem kemur inn hjálpar okkur að kvarða það — og fær að vita nákvæmlega hvar
óvissan liggur á meðan.

---

## Þið þurfið ekki vélbúnað til að byrja

Þetta er mikilvægasta atriðið fyrir félag sem er að velta þessu fyrir sér.

**Dag eitt** þarf ekkert nema símana sem leikmennirnir eiga þegar. Líðanarskráning tekur fimmtán
sekúndur á mann, og upp úr henni fæst umferðarljósið, persónulegi samanburðurinn,
þróunargreiningin og daglega ákvörðunin. Æfingaálag er skráð með RPE eftir æfingu — ein tala frá
þjálfara eða leikmanni.

**Seinna**, ef félagið kaupir eða leigir Catapult-einingar, bætast PlayerLoad, hröðunarmælingar
og stökkin við sjálfkrafa. Ekkert þarf að setja upp aftur og sagan tapast ekki.

Öfugt við flest kerfi er hér ekki krafa um að fjárfesta fyrst og sjá gagnið seinna.

---

## Hvað kerfið gerir ekki

Það spáir ekki fyrir um meiðsli. Ekkert kerfi gerir það, og öll sem segjast gera það eru að
ofselja tölfræði sína. MicroPulse sýnir hvenær leikmaður víkur frá sínu eigin mynstri, tengir
það við þekkta áhættuþætti úr rannsóknum, og gerir þjálfaranum kleift að bregðast við fyrr.

Það kemur ekki í staðinn fyrir sjúkraþjálfara. Endurkomueiningin gefur álagsramma, ekki
læknisfræðilega heimild til að spila.

Og það hefur ekki viðmiðunargildi fyrir körfubolta til að bera ykkur saman við. Power og félagar
reyndu að taka saman 32 rannsóknir á kvennakörfubolta og gátu ekki sameinað nema eina einustu
breytu vegna ósamræmis í aðferðum. Þess vegna berum við hvern leikmann saman við sjálfan sig —
það er ekki bara betri leið hér, hún er eina verjandi leiðin.

---

## Að byrja

Fyrsta vikan fer í að stofna hópinn og fá leikmenn til að skrá sig. Næstu fjórar vikur byggjast
persónulegar grunnlínur upp, og á meðan segir kerfið sjálft að öryggi þess sé lágt frekar en að
þykjast vita meira.

Það sem félagið þarf að leggja til er lítið en það er ekki ekkert: einhver þarf að minna
leikmenn á að skrá sig fyrstu vikurnar. Reynslan okkar úr fótboltanum er afdráttarlaus — félagið
með bestu skráninguna hjá okkur er ekki það sem er með flestar sjálfvirkar áminningar, heldur
það þar sem þjálfarinn minnir á í upphafi dags.

---

## Heimildir

Reglurnar í kerfinu byggja á eftirfarandi, og tilvísunin er sýnileg á skjánum þar sem hún á við.

| Svið | Heimild |
|---|---|
| Vikugerð eftir leikjafjölda | Salazar o.fl. (2020), *Int J Environ Res Public Health* 17(8):2812 |
| Þétt vika og þriðji leikurinn | Power o.fl. (2024), *Int J Sports Physiol Perform* 19(12):1455 |
| Álag eftir leikjafjölda og spilamínútum | Conte o.fl. (2018), *Int J Sports Physiol Perform* 13(8):1067 |
| Stöðugleiki langtímaálags | Paulauskas o.fl. (2019), *Int J Sports Physiol Perform* 14(7):941 |
| Álag og endurheimt vikuna á eftir | Sansone o.fl. (2020), *J Strength Cond Res* 34(10):2929 |
| Þröskuldar fyrir hröðunarmælingar | Tuttle o.fl. (2024), *Sports Medicine* 54(10):2571 |
| Takmarkanir viðmiðunargilda | Power o.fl. (2022), *Sports Med Open* 8(1):107 |

*Greinar sóttar í gegnum PubMed.*

---

*Skjámyndir eru úr sýniliði með tilbúnum leikmönnum og tilbúnum gögnum. Engin raunveruleg
leikmannagögn eru í þessu skjali.*
