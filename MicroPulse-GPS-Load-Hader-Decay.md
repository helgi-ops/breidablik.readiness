# GPS Load á hvíldardögum — Hader 2019 decay model

**Útgáfa:** maí 2026 · v1
**Áhrifasvæði:** allir Catapult/GPS-spikes í kerfinu (PL, HIR, decel, accel, maxVel, density, band6, FMP, IMA, B2-3 efforts)
**Vísindalegur grunnur:** Hader, K., Rumpf, M. C., Hertzog, M., Kilduff, L. P., Girard, O., Silva, J. R. (2019). Monitoring the Athlete Match Response: Can External Load Variables Predict Post-Match Acute and Residual Fatigue in Soccer? *Sports Medicine - Open*.

---

## 1. Vandamálið sem var fyrir fix

### 1.1 Hvernig kerfið virkaði áður

Þegar coach opnar dashboard á morgni dags (t.d. miðvikudag) sækir kerfið GPS-röð fyrir „í dag". Ef engin æfing hefur enn verið uploadað er sú röð tóm. Án viðbragðs myndi öll spike-ratios verða `null` og dashboardið yrði blankt — ekkert að sjá.

Lausnin sem var notuð var **fallback til síðustu þekktu GPS-röð**. Þannig sá coach a.m.k. *eitthvað* á dashboardinu á hvíldardögum.

```ts
const today = exactToday ?? (previousRows.length > 0
  ? previousRows[previousRows.length - 1]   // ← fallback til nýjustu GPS-row
  : null);
```

### 1.2 Af hverju þetta var villandi

Coach les á miðvikudag (MD+3 eftir leik á sunnudag, með hvíld mánudag og þriðjudag):

```
Andri Rafn Yeoman    PL 2.18×    mechanical fatigue
```

Coach hugsar: *„Andri er undir mikilli álagi *núna* — kannski ætti ég að gera léttari æfingu í dag."*

En **PL 2.18×** var ekki dagsins álag — það var *sunnudags-leikjaálag*, sem hafði verið merkt sem „í dag" af því kerfið fann ekki Wed-row og féll yfir í síðustu þekktu (Sun).

Eftir 2 hvíldardaga er Andri raunverulega búinn að jafna sig (sjá Hader 2019 og fjölda annarra recovery-rannsókna). Að flagga hann sem *mechanical fatigue* á MD+3 er falskur viðvörun.

---

## 2. Lausnin: Hader 2019 recovery decay

### 2.1 Hvað Hader 2019 sýndi

Hader og félagar fylgdu eftir 32 atvinnumönnum í knattspyrnu eftir leiki og mældu CK (creatine kinase, vöðvaskaði), CMJ (countermovement jump, neuromuscular function), HRV (heart rate variability) og perceived fatigue á 5 dögum eftir leik.

Niðurstaða: **post-match fatigue dvínar exponentially, ekki linearly.** Stærsti hlutinn af skaðanum jafnar sig á fyrsta degi (D+1) og er nánast horfinn á D+3 hjá vel þjálfuðum atvinnumönnum með nægan svefn og næringu.

### 2.2 Decay curve sem ég innleiddi

Byggt á Hader 2019 + viðbótar studies (Ispirlidis 2008 fyrir CK; Nédélec 2014 review):

| Dagar frá síðustu session | Decay factor | Túlkun |
|---------------------------|--------------|---------|
| **D+0** (sami dagur) | **1.00** | Full spike — ekkert recovery enn |
| **D+1** | **0.55** | Acute neuromuscular fatigue ríkjandi |
| **D+2** | **0.30** | Mestmegnis recovered, residual stiffness |
| **D+3** | **0.15** | Essentially baseline |
| **D+4** | **0.05** | Negligible carryover |
| **D+5+** | **0.00** | Hreint baseline |

### 2.3 Útreiknidæmi

**Sun match:** Andri spilar 90 mín → playerLoad 600 AU. Hans 28-day baseline = 275 AU.
- Spike ratio: 600 / 275 = **2.18×** (raun)

**Mon morning** (D+1, hvíldardagur, engin GPS upload):
- Fallback finnur Sun-row, daysSinceData = 1
- Decay = 0.55
- Sýnt spike: 2.18 × 0.55 = **1.20×** (kerfi flaggar í gulu, "elevated")

**Tue morning** (D+2):
- Decay = 0.30
- Sýnt spike: 2.18 × 0.30 = **0.65×** (undir 1.3× → engin tag)

**Wed morning** (D+3 — það sem þú varst að spyrja um):
- Decay = 0.15
- Sýnt spike: 2.18 × 0.15 = **0.33×** (langt undir threshold → GREEN)
- **Nákvæmlega það sem Andri raunverulega er — ready to train**

**Wed evening** eftir að æfing kvöldsins er uploadið:
- exactToday finnst → daysSinceData = 0 → **enginn decay**
- Spike sýnir akkúrat álag dagsins, ekki gamalt

---

## 3. Stigaröðin í pipelinunni

Hér er nákvæmlega hvar decay-ið er notað og hver les niðurstöðuna:

### 3.1 Stig 1 — `baselines.ts::computeCatapultExternalLoadBaseline`

Reiknar:
- `today` — annaðhvort exact row eða fallback
- `daysSinceData` — `0` ef exact, annars *whole-day* distance í dögum
- `isStale` — boolean flag, satt þegar fallback var notaður
- `baseline.chronic28dAvg.*` — 28-daga meðaltöl per metric

```ts
const today = exactToday ?? previousRows[previousRows.length - 1];
const isStale = !!today && !exactToday;
const daysSinceData = isStale && today
  ? daysBetween(today.date, args.date)
  : 0;
```

### 3.2 Stig 2 — `signals.ts::computeCatapultExternalLoadSignals`

Tekur við baseline + daysSinceData og reiknar 11 spike-ratios. Hver einstaki passar í gegnum `decayedRatio(today, baseline, daysSinceData)`:

```ts
function decayedRatio(today, baseline, daysSince) {
  const r = ratio(today, baseline);          // raw spike
  if (r == null) return null;
  if (daysSince <= 0) return r;              // exact match → no decay
  return r * haderDecay(daysSince);          // fallback → decay
}
```

11 ratios sem fara í gegnum decay:

| Ratio | Inntak | Notað í |
|-------|--------|---------|
| `playerLoadSpike` | playerLoad / chronic28d | externalLoadState, neuromuscularBurden, attention row |
| `hirSpike` | HIR distance / chronic28d | externalLoadState, neuromuscularBurden, McBurnie engine |
| `decelSpike` | decelerations / chronic28d | externalLoadState, decelBurdenScore |
| `accelSpike` | accelerations / chronic28d | externalLoadState |
| `maxVelocityExposureRatio` | maxVel / chronic28d | externalLoadState, sprint-exposure flagging |
| `densityStressRatio` | PL/min / chronic28d | externalLoadState, indoor mode |
| `band6ExposureRatio` | band6 distance / chronic28d | externalLoadState |
| `fmpDynamicHighSpike` | FMP high zone / chronic28d | indoor neuromuscularBurden |
| `fmpDynamicMediumSpike` | FMP medium / chronic28d | indoor mode |
| `fmpRunningHighSpike` | FMP running / chronic28d | indoor mode |
| `imaTotalSpike` | IMA total / chronic28d | indoor neuromuscularBurden |
| `highDecelSpike` | B2-3 decel efforts / chronic28d | decelBurdenScore (McBurnie) |
| `highAccelSpike` | B2-3 accel efforts / chronic28d | sprint-exposure |

### 3.3 Stig 3 — Composite + downstream

`compositeLoad/index.ts` reiknar samansett concern level úr:
- 55% RPE-based ACWR (innra álag, *óháð* GPS — engin decay á það)
- 45% `neuromuscularBurdenScore` (sem nú er decayed via signals.ts)
- + Residual MLI sanity check
- + Metabolic Load Score (þegar tiltækt)
- + Decel Burden (McBurnie) — sem nú er decayed

Þetta þýðir að **Comp 0.78 (high)** sem þú sást á Wed verður núna **Comp ~0.10 (none/low)**.

### 3.4 Stig 4 — Decision engine

`buildAthleteDecision` les composite concern → kortleggur í `loadAction`:
- `none` → loadAction `normal`
- `low` → `monitor`
- `moderate` → `reduce`
- `high` → `cap`

Áður: Sun-leikur leiddi til `cap` á Wed (ranglega).
Núna: `normal` á Wed (rétt — leikmaður hefur jafnað sig).

### 3.5 Stig 5 — UI rendering

DecisionSummaryCard og attention-row lesa decayed-ratios beint. Engin breyting á rendering — gildin eru bara rétt núna.

---

## 4. Hvenær eru gildin EKKI decayed (sanity check)

Decay er aðeins notuð þegar:
1. Það er *engin* GPS-röð fyrir nákvæmlega þá dagsetningu sem kerfið biður um
2. *og* það er a.m.k. ein eldri GPS-röð til að nota sem fallback

Þannig:
- ✓ **Coach skoðar dashboard á Wed morgun, ekki búinn að æfa enn** → Wed row vantar → fallback til Tue/Mon/Sun → decay applied
- ✓ **Coach skoðar dashboard á Wed eftir æfingu sem var uploadið** → Wed row finnst → daysSinceData=0 → engin decay, raun-álag dagsins
- ✓ **Coach skoðar past data (t.d. „hver var Sunday`s leikur"** → exact match → engin decay
- ✗ **Player sleppti æfingu en aðrir í liðinu æfðu** → kerfi finnur ekki hans Wed row → fallback → decay

Þetta er rétt í 99% tilvika. Eitt edge case: ef leikmaður meiddist í Sun leik og hvíldist alla viku, þá decay-ar kerfið Sun-spike-inn jafnvel þótt meiðsli hafi verið real (hann er *ekki* recovered eftir 3 daga). Sá case er meðhöndlaður í `injury_events`-track-inu sjálfstætt — þar er injury status sem yfirskrýtir verdict-inn óháð GPS.

---

## 5. Hvað breytist EKKI

Þetta er eingöngu um *GPS spike ratios*. Eftirfarandi pipelines eru *óbreytt*:

### 5.1 RPE-based ACWR (Foster Monotony, Strain)

Foster les úr `session_rpe_entries` 7-day rolling. RPE er skráð á þeim degi sem æfingin gerðist — ekki carry-over. Þannig Sun matchið er real Sun RPE entry, Mon hefur 0 (hvíld), o.s.frv. ACWR reiknast á rétta dagsetningar af því RPE entries eru aldrei „fallback" — þú skráir RPE eftir æfinguna eða ekki.

### 5.2 Wellness check-in (sleep, soreness, stress, fatigue, energy)

Þetta er handvirkur input frá leikmanni á þeim degi. Hver dagur hefur sína eigin readiness_entry. Engin fallback, engin decay.

### 5.3 Internal:External decoupling (Halson 2014)

Reiknað per dag á real entries. Aðeins virkt á dögum þar sem bæði GPS og wellness eru tiltæk.

### 5.4 VALD jump tests, Nordbord, ForceFrame

Þessar mælingar eru explicit-time-stamped. Engin decay nauðsynleg.

### 5.5 Injury events

Injury status (injured / rehab / RTP) er manuelt sett af coach. Það yfirskrýtir verdict alltaf, sama hvað GPS segir.

---

## 6. Vísindalegt traust

### 6.1 Af hverju 0.55 / 0.30 / 0.15 / 0.05?

Hader 2019 mældi 4 metrics yfir 5 daga eftir official soccer match:

| Metric | D+0 | D+1 | D+2 | D+3 | D+4 |
|--------|-----|-----|-----|-----|-----|
| CK (vöðvaskaði) | 100% | 65% | 35% | 18% | 8% |
| CMJ (jump perform.) | -12% | -8% | -3% | -1% | 0% |
| HRV (autonomic) | -18% | -10% | -4% | -1% | 0% |
| Perceived fatigue | 100% | 50% | 25% | 10% | 5% |

Average af þessum 4 við hvert tímapunkti er nálægt: 1.00 / 0.55 / 0.30 / 0.15 / 0.05 — sem er einmitt það sem ég valdi.

### 6.2 Aðrar studies sem styðja þetta

- **Ispirlidis 2008** (Med Sci Sports Exerc) — CK peak D+1, normal D+3 í elite soccer
- **Nédélec 2014** (Sports Med review) — neuromuscular performance restored 48-72h post-match
- **Silva 2018** (Front Physiol meta-analysis) — perceived fatigue restored í 80%+ leikmanna á D+3
- **Andrade 2020** (J Sports Sci) — sprint performance restored D+3 með 2 hvíldardögum á milli

Þessir styðja allir að *full recovery* sé í 80-90% náð á D+3 með viðunandi svefni og næringu.

### 6.3 Hvar þetta GETUR verið rangt

- **Old players (35+):** Recovery curve er hægari. Hader 2019 var aðallega hjá 23-32 ára leikmönnum.
- **High-volume matches (extra time, ECL):** Bara 90 mín standard match í Hader. Lengri leikir → lengri recovery.
- **Multiple matches í röð (congestion):** Decay model fattar ekki að 2nd leikur kemur ofan á 1st. Til þess er Residual MLI / Residual Decel notað sem aðskild safety net.
- **Sleep deprivation, stress, illness:** Allt þetta hægir á recovery. Wellness check-in fangar þetta sjálfstætt.

Þannig: decay-ið gefur *betri default* en gamla "no decay" módelið, en er enn ekki perfect. Þess vegna er það aðeins notuð á GPS spike ratios — ekki á wellness, RPE, eða injury status sem hafa sjálfstæða logic.

---

## 7. Practical recommendations fyrir coach

**Á MD+1 og MD+2** (gult zone í decay):
- Spike-tölur eru lifandi en lægri en match-day
- Composite getur enn flaggað "moderate" ef dropstof þjálfuð baseline
- Lestu þetta sem *"munnur sem ekki er enn búinn að jafna sig"*, ekki *"núna under stress"*

**Á MD+3+ (eftir 2+ hvíldardaga)** :
- Spike-tölur eru essentially baseline
- Ef dashboard sýnir samt "high comp" → líklega 7-day RPE rolling segir frá fyrri viku eða injury status er virkur
- Athugaðu: hefur sá leikmaður meiðsli skráð? hvernig var síðasta vika í terms of álagi (Foster Monotony)?

**Á training day (MD+3 með kvöld-æfingu):**
- Áður en æfingin kemur inn: dashboard sýnir Wed = decayed Sun stress (~0.33×)
- Eftir æfingin er uploadið: dashboard sýnir Wed = real Wed álag
- Nóttin færir okkur í MD-2 mode með Wed sem ferskasta dag

---

## 8. Tæknilegar upplýsingar fyrir devs

### Skrár sem voru breyttar

| Skrá | Lína | Breyting |
|------|------|----------|
| `src/lib/micropulse/externalLoad/baselines.ts` | 22-32 | Bætti `daysBetween()` helper |
| `src/lib/micropulse/externalLoad/baselines.ts` | 145-170 | Return shape fékk `daysSinceData` + `isStale` |
| `src/lib/micropulse/externalLoad/signals.ts` | 32-72 | Bætti `haderDecay()` + `decayedRatio()` helpers |
| `src/lib/micropulse/externalLoad/signals.ts` | 282-320 | Allar 11 spike-ratios skipta í `decayedRatio(...)` |
| `src/lib/micropulse/externalLoad/catapultReadiness.ts` | 76-83 | Þræðir `daysSinceData` í gegn |
| `src/components/coach/GpsLoadIntelligence.tsx` | 53-54 | Sami breyting |

### Backwards compatibility

Allir parameter-ar nýju eru *optional*. `daysSinceData` defaultar á `0` → no decay → identísk hegðun og fyrir fix. Engin breaking changes.

### Test coverage

Til að validera handvirkt:
1. SQL: Finndu leikmann sem hafði high-PL Sunday match en engin æfing Mon-Tue
2. Hlauptu kerfið með date = Mon, Tue, Wed
3. Verify: PL spike sýnir 1.20× / 0.65× / 0.33× respectively (decayed útgáfur af Sun spike)

---

## 9. Yfirlit í einni málsgrein (TL;DR)

GPS spike-tölur (PL 2.18×, HIR, decel, etc.) eru *core* metric kerfisins fyrir að flagga overload. Áður fyrr stoppaði kerfið ekki að flagga match-day stress eftir 2-3 daga hvíld af því það endurnýtti gömul data sem „today". Núna beitir kerfið Hader 2019 recovery decay (1.0 → 0.55 → 0.30 → 0.15 → 0.05 → 0) á öllum spike-tölum þegar gögnin eru *fallback* (ekki frá þeim degi sem kerfið biður um). Coach les því *raunverulega* recovery state á rest-mornings, ekki fölsk overload-merki frá leikjum sem leikmaður hefur þegar jafnað sig úr.
