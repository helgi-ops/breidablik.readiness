# Brief: Hvernig OsteoSport hreyfigreiningarkerfið er byggt — og hvernig á að yfirfæra það á MicroPulse

*Höfundur: teknískt yfirlit tekið beint úr OsteoSport-kóðanum (app.osteosport.is), til að endurbyggja greiningarkerfið í MicroPulse. Skrifað sem uppskrift, ekki bara lýsing.*

---

## 0. TL;DR — af hverju OsteoSport-greiningin virkar

Flest „AI-greiningarkerfi" verða léleg af sömu ástæðu: þau henda hráum gögnum (skjal, tafla, tölfræðidump) inn í módel og biðja um „greiningu" í frjálsum texta. Útkoman er almenn, ótengd restinni af kerfinu og ekki hægt að treysta.

OsteoSport gerir fjögur atriði öðruvísi, og **það eru þau fjögur sem þú þarft að afrita í MicroPulse**:

1. **Grundun í KYRRÐU, vélrænt-athuganlegu þekkingarsafni** — ekki blind RAG yfir hrá PDF. Módelið fær curated „engine" (svæði + próf-reitir) og curated protókóla sem linsu, ekki bókasafn.
2. **Þröngt, fast JSON-skema með leyfðum lyklum** — ekki frjáls texti. Svörin eru wired við restina af appinu (svæðislyklar, reit-ID).
3. **Varnar-normalísering á server** — allt sem módelið skilar er síað gegn þekkta-gilda listanum. Ef módelið finnur upp lykil, er honum hent.
4. **Lokað hringrás inn í workflow-ið** — greiningin *sáir* næsta skrefi (svæði + forgangspróf fara beint inn í matið), í stað þess að vera lesin og gleymt.

Allt annað (myndir, myndbönd, fjölpróf) er útfærsluatriði. Þessi fjögur eru kjarninn.

---

## 1. Hvað kerfið gerir (OsteoSport)

Osteopati hleður inn myndum/myndbandi af hreyfiskimun (overhead squat, single-leg squat, göngulag…). Claude vision les hreyfinguna **sjónrænt** og skilar: samantekt, athugunum per svæði, mynstrum/kompensasjónum, **svæði sem á að meta næst**, **forgangs-prófum af því svæði**, leiðréttandi tillögum (grundaðar í protókólum), heimildum, rauðum flöggum og mati á myndgæðum. Niðurstaðan er „decision support" — leiðbeinir, greinir ekki.

Lykilatriði: úttakið er ekki bara texti heldur **tengt við klíníska vélina** — það velur `region`-lykil og `priorityFieldIds` sem eru raunverulegir reitir í matsforminu, svo hægt er að ýta á „Taka með í mat →" og formið opnast á réttu svæði með réttu prófin stjörnumerkt.

---

## 2. Arkitektúrinn í lögum

Fjögur lög, hvert með eina ábyrgð. (Skrár í OsteoSport-appinu í sviga.)

### Lag 1 — Client: söfnun + forvinnsla (`assessment/movement.tsx`)
- Notandi bætir við **mörgum nefndum prófum**, hvert með eigin myndum/myndbandi.
- **Myndir eru smækkaðar í vafranum** (canvas → JPEG, lengsta hlið 1024px) áður en nokkuð er sent — minni payload + **fullupplausn sjúklingamyndir fara aldrei úr vafranum** (persónuvernd).
- **Myndband → rammar í vafranum**: Claude vision tekur ekki myndband, svo klippa er brotin í 4 jafndreifða ramma (`videoToFrames`). (iOS-krókur: verður að spila `muted` í DOM og grípa ramma með `requestVideoFrameCallback` — seek eitt og sér virkar ekki í iOS Safari/PWA.)
- Ekkert er vistað varanlega. Payload = listi af `{ label, images[] }`.

### Lag 2 — Server action: hlið + varsla (`assessment/movement-actions.ts`)
- `"use server"`. **Auth-gate** (`supabase.auth.getUser()`).
- **Validering**: leyfðar media-tegundir, hámark 32 rammar samtals, sleppir tómum prófum.
- **IP-hlið**: sækir licensed protókóla-markdown **aðeins** ef `practitioners.resources_enabled` er satt fyrir þennan notanda — og textinn fer aldrei í vafrann, bara inn í model-kallið á server.
- Kallar í AI-lagið, skilar `{ ok, data } | { ok:false, error }`.

### Lag 3 — AI-lagið: grunduð beiðni + fast skema (`src/lib/ai/movement.ts`)
- `import "server-only"` (má aldrei bundlast client-side).
- Byggir **system-prompt** dýnamískt úr vélinni:
  - `REGIONS` → listi af leyfðum svæðislyklum.
  - Reit-katalog (`region → fields[]`) → leyfð `priorityFieldIds`.
  - Valfrjáls protókóla-markdown sem **linsa** (chain reaction, 3 plön) með fyrirmælum um að **vitna í titla** í `references`.
- Sendir Anthropic **vision content blocks**: einn `=== Próf: <heiti> ===` textablokk + myndblokkir per próf, svo módelið les hvert próf saman OG samþættir milli prófa.
- `claude-sonnet-5`, `max_tokens: 16000`, `thinking: { type: "adaptive" }`.
- Krefst **eingöngu gilds JSON** á föstu formi (skema skrifað út í promptinu).

### Lag 4 — Varnar-normalísering (sama skrá, eftir `JSON.parse`)
Þetta er lagið sem flestir sleppa og það er ástæðan fyrir að úttakið er nothæft:
```ts
const validKeys = new Set(REGIONS.map(r => r.key));
const fieldsByRegion = new Map(REGIONS.map(r => [r.key, new Set(r.fields.map(f => f.id))]));
const region = parsed.region && validKeys.has(parsed.region) ? parsed.region : null;
// priorityFieldIds: aðeins ID sem tilheyra RAUNVERULEGA valda svæðinu
priorityFieldIds: regionFields
  ? parsed.priorityFieldIds.map(String).filter(id => regionFields.has(id))
  : [],
severity: (s === "notable" || s === "mild" || s === "normal") ? s : "mild",
```
Allt sem módelið skilar er þvingað gegn þekkta-gilda heiminum. Fundinn-upp lykill → hent. Þannig getur restin af appinu treyst úttakinu 100%.

### Lokun hringsins — carry-over (`carryOver()` í `movement.tsx`)
Niðurstaðan er sett í `sessionStorage` (`{ region, text, priority }`) og notandi fluttur í matsformið á réttu svæði með forgangsreitina stjörnumerkta. **Greiningin verður að aðgerð, ekki bara skýrslu.**

---

## 3. Sjö hönnunarreglur (með MicroPulse-þýðingu)

| # | Regla (OsteoSport) | Þýðing yfir á MicroPulse |
|---|---|---|
| 1 | **Grunda í curated þekkingu, ekki hráum gögnum.** Módelið fær engine + protókóla sem linsu. | Ekki henda öllu Wyscout/StatsBomb/InStat-dumpinu inn. Byggðu curated „football engine": hlutverk (role) skilgreiningar, viðmið (per-90 percentlar per stöðu), leikheimspeki Breiðabliks, lykil-metrík per stöðu. Módelið fær **linsuna**, ekki bókasafnið. |
| 2 | **Þröngt JSON-skema með leyfðum lyklum.** `region ∈ REGIONS`, `priorityFieldIds ∈ fields`. | Skilgreindu skema: `{ role, strengths[], gaps[], keyMetrics[{metricId, percentile, verdict}], recommendedFocus[], drills[{drillId}], confidence }`. `metricId` og `drillId` verða að vera raunverulegir lyklar úr þínum töflum (t.d. `drill_library`). |
| 3 | **Varnar-normalísering á server.** Sía allt gegn þekkta listanum. | Eftir `JSON.parse`: hentu hverjum `metricId`/`drillId`/`role` sem er ekki til í þínum enum/töflum. Þá getur dashboardið treyst úttakinu og linkað beint í drill_library. |
| 4 | **Decision support, ekki dómur.** „Tillögur til íhugunar — þú velur." Eigindlegt, vitnar í heimildir. | Þjálfarinn á ákvörðunina. Skilaðu „focus areas" + „to consider", ekki „þessi leikmaður er slæmur". Sýndu **af hverju** (hvaða metrík, hvaða percentil) svo þjálfari geti vegið það. |
| 5 | **Samþætta mörg input, ekki eitt.** Hvert próf lesið sér OG saman. | Leikmaður hefur margar heimildir: Wyscout season-stats, StatsBomb per-90, InStat, Catapult-álag, leikskýrslur. Merktu hverja heimild (eins og `=== Próf: X ===`) og biddu módelið að lesa hverja sér OG finna sameiginlega þráðinn (t.d. „lágt high-intensity í Catapult + fækkun sprint í Wyscout"). |
| 6 | **Loka hringnum inn í workflow.** Úttak sáir næsta skrefi. | Greining á leikmanni á að **sá** næsta skrefi: leggja til þjálfunar-fókus sem fer inn í prógrammið, eða linka beint í drill_library-æfingar (þú ert nú þegar með `micropulse-drill-diagram` skill fyrir þær). Ekki skýrsla sem er lesin og gleymt. |
| 7 | **Gata IP/leyfisefni á server.** Licensed markdown fer aldrei í client. | Sama hjá þér: leikheimspeki, scouting-viðmið, samningsupplýsingar — haltu því server-side, sendu aðeins inn í model-kallið, aldrei í bundle-ið sem fer í vafrann. |

---

## 4. Hvað þýðir „nógu gott" — checklist fyrir MicroPulse-greininguna

Núverandi greiningarkerfi er líklega veikt á 1–3 (grundun + skema + normalísering). Farðu í gegnum:

- [ ] **Er til „engine"?** Curated skrá(r) með: stöður/hlutverk, lykil-metrík per stöðu, viðmiðunar-percentlar, leikheimspeki. (Í OsteoSport eru þetta `src/lib/engine/regions/*`.) Ef greiningin fær bara hráar tölur án þessarar linsu → þarna er vandinn.
- [ ] **Er úttakið fast JSON-skema með raunverulegum lyklum?** Eða frjáls texti? Ef frjáls texti → engin leið að wira það við dashboardið eða drill_library.
- [ ] **Er varnar-normalísering eftir parse?** Ef ekki → módelið finnur upp metrík/æfingar og kerfið treystir þeim.
- [ ] **Sáir greiningin næsta skrefi?** Eða er hún blindgata? Tengdu við prógramm/drill_library.
- [ ] **Er rétt módel + thinking?** OsteoSport notar `claude-sonnet-5` með `thinking:{type:"adaptive"}` fyrir vandaða greiningu. (Athugaðu nýjustu módel-ID í `claude-api` skill áður en þú festir.)
- [ ] **Grundun sýnir heimildir?** Hver fullyrðing á að vísa í metrík/viðmið, svo þjálfari sjái *af hverju*.

---

## 5. Konkret uppskrift (endurbygging í MicroPulse)

1. **Skrifaðu engine-lagið fyrst** (`src/lib/football-engine/` eða álíka): TypeScript-skrár með stöðum, lykil-metrík per stöðu, viðmiðunar-percentlum, og (server-only) leikheimspeki-linsu. Þetta er 80% af gæðunum.
2. **Skilgreindu skemað** sem TypeScript-interface (eins og `MovementAnalysisResult`). Hver reitur wired við raunverulegan lykil.
3. **AI-lagið** (`server-only`): byggðu system-prompt dýnamískt úr engine-inu (leyfðar stöður, leyfð metricId, leyfð drillId úr drill_library), sendu inn merktar heimildir per leikmann, krefstu eingöngu gilds JSON.
4. **Server action**: auth-gate, validering, gatað leyfisefni, kall, `{ ok, data } | { ok:false, error }`.
5. **Varnar-normalísering**: síaðu allt gegn engine-inu + drill_library. Hentu ógildu.
6. **Loka hringnum**: úttak → tillaga um þjálfunar-fókus / link í drill_library / inn í prógramm.

Byrjaðu á 1 og 5 — grundun og normalísering — það er þar sem „ekki nógu gott" verður „nothæft".

---

## 6. Skrár til að lesa í OsteoSport-appinu (sem fyrirmynd)

`Desktop/OsteoSport/app/`:
- `src/lib/ai/movement.ts` — grundaði prompt-byggirinn + fast skema + varnar-normalísering. **Lykilskrá.**
- `src/lib/ai/differential.ts` — sama mynstur fyrir texta-input (differential diagnosis); styttri, gott til að sjá kjarnann.
- `src/app/app/patients/[id]/assessment/movement-actions.ts` — server action, gating, IP-varsla.
- `src/app/app/patients/[id]/assessment/movement.tsx` — client: fjölpróf, myndsmækkun, myndband→rammar, carry-over.
- `src/lib/engine/index.ts` + `src/lib/engine/regions/*` — curated „engine" (fyrirmynd að football-engine).
- `src/lib/resources.ts` — curated protókólar (server-only, gataðir) — fyrirmynd að leikheimspeki-linsu.

*Lykilsetningin: gæði AI-greiningar liggja ekki í promptinu heldur í **curated þekkingunni sem þú grundar hana í** og **skemanu + normalíseringunni sem gera úttakið treystanlegt**. Allt hitt er skraut.*
