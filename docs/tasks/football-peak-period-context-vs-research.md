# Setja líkamlegu tölurnar í samhengi — fótbolti vs elite-rannsókn

Getum við gert það sem körfuboltinn fékk — sett peak-period / hlaupatölur leikmanns í samhengi? **Já**, og
það er meira að segja rannsókn sem gefur beinu viðmiðin: **Ju o.fl. (2022), „Contextualised peak periods of
play in the English Premier League"** (Biology of Sport 39(4):973–983, DOI 10.5114/biolsport.2022.112083).
50 EPL-leikir, peak 1/3/5-mín gluggar, háákafahlaup (>19,8 km/klst) sett í samhengi við taktískar aðgerðir.

## Elite-viðmiðið (Tafla 2) — peak-period háákafahlaup eftir stöðu

Meðaltal ± SD, **m/mín** (hraði í ákafasta glugganum). Heildarvegalengd = hraði × mínútur.

| Staða | Peak 1-mín | Peak 3-mín | Peak 5-mín |
|---|---|---|---|
| Miðvörður (CDP) | 55 ± 17 | 24 (≈72 m) | 17 (≈85 m) |
| **Bakvörður (WDP)** | **76 ± 18** | 35 (≈105 m) | 26 (≈130 m) |
| Miðjumaður (CMP) | 68 ± 17 | 32 (≈96 m) | 23 (≈116 m) |
| **Kantmaður (WOP)** ← Ágúst | **76 ± 16** | 36 (≈107 m) | 27 (≈134 m) |
| Sóknarmaður (COP) | 71 ± 14 | 32 (≈96 m) | 25 (≈126 m) |
| **Öll lið (meðaltal)** | **67 ± 19** | 31 (≈94 m) | 23 (≈116 m) |

**Lykil-lærdómar úr greininni (nothæf sem viðmið/regla):**

- **Breiðir leikmenn (kantar + bakverðir) hlaupa mest á ákafa í peak-gluggum; miðverðir minnst.** Staða
  ræður miklu — always bera saman við sömu stöðu.
- Í peak-glugga fer **~20–35% af háákafahlaupinu í „Recovery Run" + „Covering"** (án bolta) og **~10% í
  „Support Play"** (með bolta). Kantmaður (WOP) einkennist af: *Move to Receive/Exploit Space, Run in
  Behind/Penetrate, Support Play, Run with Ball*.
- **Eftir ákafasta glugga dettur háákafahlaup ~48% í næstu mínútu** (transient decrement) — en það er blanda
  af þreytu OG pacing/taktík, ekki bara þreyta.
- Þröskuldur: **>19,8 km/klst**, 1 s lágmarks-dvöl.

## Hvernig þjálfari/skátur les MicroPulse-leikmann á móti þessu

Fyrir kantmann (Ágúst, RW = WOP) er spurningin einföld: **er vélin (engine) á elite-stigi fyrir stöðuna?**
Það sem er beint samanburðarhæft núna:

- **Topphraði 34,4 km/klst** → elite (>34 km/klst er á meðal þeirra hæstu; þröskuldur greinarinnar 19,8 er
  löngu farinn fram úr). ✅ Sterkt.
- **HSR í leik ~1.261 m/leik, sprettir ~349 m/leik** → hátt fyrir kantmann. (Greinin mælir peak-glugga, ekki
  leikjaheildir, svo þetta er samhengi við almenna elite-viðmiðun frekar en beint við Töflu 2.)
- **Athletic profile:** speed 100th, mechanical power 100th, anaerobic reserve 100th percentile innan stöðu
  — sem rímar við að vera „breiður leikmaður með háa peak-kröfu".

## Heiðarlegi fyrirvarinn — eitt gagna-gat

Til að bera Ágúst **beint** við Töflu 2 (t.d. „peak 1-mín 76 m háákafahlaup") þarf **peak-period háákafahlaup
per glugga** (m > 19,8 km/klst í ákafasta 1/3/5-mín). Catapult **MII-export-ið sem MicroPulse les gefur bara
heildarvegalengd + Player Load** per glugga (skjalfest takmörkun) — ekki háhraða-hlutann per glugga. Þess
vegna er dossier-tala Ágústar „peak 1-mín 223 m" **heildarvegalengd**, ekki háákafahlaup, og má **ekki** setja
beint á móti 76 m viðmiðinu.

Tvær leiðir að hreinum samanburði:
1. **Ná peak-period HSR** — annað hvort í Catapult (custom period/parameter með háhraða-þröskuldi, ekki MII), eða
   reikna úr hráum GPS. Þá er 76 m viðmiðið beint nothæft.
2. Í millitíðinni: nota **leikjaheildir (HSR/sprettir/topphraða)** + **peak-period SHAPE** (fall milli 1→3→5
   mín) sem samhengi, með fyrirvara.

## Stóra myndin: MicroPulse gerir nú þegar það sem greinin boðar

Kjarninn í greininni er að **peak-period líkamleg output eigi að setja í samhengi við taktískar aðgerðir**
(hvað leikmaðurinn er að gera í ákafasta glugganum: Recovery Run, Support Play, Run in Behind…). MicroPulse
hefur báða þættina: **Engine (GPS, hversu mikið)** + **Driver (IMA, hvernig hann hreyfist)** — sem er einmitt
„contextualised peak period". Þessi rannsókn **staðfestir hönnunina** og gefur elite-viðmiðin til að lita hana.

## Tillaga fyrir kerfið (ef v/þegar Code fer í þetta)

Lítið „research-benchmark" lag: geyma stöðu-viðmiðin úr Töflu 2 sem tilvísunar-gildi og lita peak-period kort
leikmanns (elite / meðal / undir) **eftir stöðu**, með tilvitnun (Ju 2022) og confidence. Fylgir explainability-
first: verdict („peak-vél á elite-stigi fyrir kant") → 2–3 staðreyndir → viðmiðatafla + þröskuldar á bak við
„Sýna details". Byrja á topphraða/HSR (samanburðarhæft strax); bæta við beinum peak-HIR þegar háhraða-per-glugga
gögnin fást. Descriptive — snertir aldrei readiness-litinn.

## Tilvísun
Ju W, Doran D, Hawkins R, Gómez-Díaz A, Martín-Garcia A, Ade JD, Laws A, Evans M, Bradley PS. *Contextualised
peak periods of play in English Premier League matches.* Biol Sport. 2022;39(4):973–983. Tafla 2 = stöðu-viðmið.
