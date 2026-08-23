# Fusion-lag — stefnu-nóta (samtvinnun physical × tactical)

**Spurningin:** kerfið er nú með mikið af bæði GPS/IMA (líkamlegt) og tölfræði/atburðum (taktík/tækni). Hvernig
samtvinnum við það betur — og er decision layer nóg?

**Kjarna-afstaða:** decision layer (readiness-verdikt) er **gólfið, ekki loftið**. Hann svarar „er hann klár í
dag" (álagsstjórnun). Hann svarar EKKI „hvers konar íþróttamaður er þetta og passar vélin við hlutverkið"
(frammistaða/þroski/skátun). Samtvinnun physical × tactical er **stærsta aðgreiningin** og það sem fáir gera —
af því flest kerfi halda Catapult (álag) og StatsBomb/InStat/FIBA (atburðir) í aðskildum sílóum. MicroPulse
hefur bæði á einum stað; það er vígið. Rannsóknar-grunnur: Ju o.fl. 2022 („integrated approach"), Bradley & Ade,
Modric 2019 (staða-sértækt), sem eru þegar í research-möppunni.

**Meginregla (svo þetta drepi ekki explainability):** ekki óendanleg sérhæfing — **eitt vel valið fusion-lag per
spurningu**, hvert enn með lagskipta lestrinum (verdikt → 2–3 einfaldar staðreyndir → details/jargon á bak við
toggle), confidence alltaf, og **aldrei snerta readiness-litinn** (allt descriptive/advisory). Dýpt þar sem hún
breytir ákvörðun (val í lið, hlutverk, æfingaáhersla, meiðsla-viðvörun) — ekki dýpt dýptarinnar vegna.

---

## Staða — hvað er komið (uppfært 2026-08-23)

Þessi nóta er **lifandi vegvísir**; hér er raunstaðan eftir vinnu síðustu lotu:

- **#1 Role-demand fit — ✅ KOMIÐ og validað.** `roleModel.ts` (staða × undirhlutverk demand-vægi, cituð:
  Modric 2019 / Ju 2022 / Bradley & Ade) + `roleDemandFit.ts` (engine-fit × driver × output × watch-item) +
  `/api/coach/role-demand-fit` + `RoleDemandFitCard` á Power Curve Intelligence. Validað á 23 raun-Breiðabliks-
  leikmönnum (`scripts/validate-role-demand-fit.ts`): dreifing/röðun/watch-items standast; kvarðað (squad-
  relative frame, output mínútu-normaliserað). Stöðu-viðmiða-taflan varð `ROLE_DEMAND_FIT` (kóða-gögn, coach-
  tunable — engin ný DB-tafla). Sjá `role-demand-fit-spec.md` + `role-demand-fit-validation-plan.md`.
- **#2 Contextualised peak period — 🟡 HÁLFNAÐ.** Research-benchmark lagið er komið: `peakBenchmark.ts`
  (Ju 2022 Tafla 2 stöðu-viðmið, topphraði **litað**, HSR/sprettir samhengi) + **peak-period SHAPE** (1→3→5-mín
  fall-off, heildarvegalengd, á Match Movement OG Total Player Analysis). EFTIR = sjálft flaggskipið: taktísku
  aðgerðirnar í peak-glugganum (Recovery Run/Support Play…), sem þarf (a) peak-period HSR per glugga [**hörð
  læsing núna** — MII gefur bara distance + Player Load] og (b) event-time alignment GPS↔atburðir. Sjá
  `football-peak-period-context-vs-research.md`.
- **#4 Readiness-adjusted output — ✅ KOMIÐ + V2 DÝPKAÐ.** „Form vs State" spjaldið + `formVsState` engine.
  V2 samhengis-leiðrétt væntinga-band (readiness × úti/heima × andstæðingur, per-leikmanns effect gated á
  n≥3, residual skerpir dóminn) shippað (eb61bf1). Virkjast fyrir 21/25 Breiðabliks-leikmenn. Eftir: per-stöðu/
  deildar norm + Modric metric-val.
- **#3 Signature/archetype — ⬜ ekki byrjað.** Bíður nægra gagna fyrir stöðuga klasa (n-viðvörun skylda).
- **#5 Robustness / meiðsla-snemmviðvörun — ⬜ ekki byrjað.** Síðast, mesta validation; sér-labelað „trend
  alert", aldrei liturinn.

**Mælt næsta skref:** #1 er búið að staðfesta nálgunina. Fljótasta næsta gildið er (4) **dýpkun Readiness-
adjusted output** (nánast til); stærsta aðgreiningin er (2) **flaggskipið**, sem byrjar á að leysa event-time
alignment + peak-HSR gatið.

---

## Áttirnar fimm (raðað eftir gildi × gerleiki núna)

### 1. Role-demand fit  ⭐ byrja hér
- **Spurning:** mætir vélin (engine/driver) hans líkamlegu kröfum hlutverksins sem hann spilar — og hvar er gap?
- **Gögn:** GPS/IMA leikmanns (til) × stöðu-viðmið (deildar-meðaltal eftir stöðu úr eigin gögnum, eða elite-viðmið
  eins og Ju 2022 Tafla 2). Allt til nema stöðu-viðmiða-taflan (lítil ný tilvísunar-tafla).
- **Gerleiki:** hár. Byggir beint á Game-Plan Fit specinu (`docs/tasks/game-plan-fit-spec.md`) sem er þegar til.
- **Explainability:** verdikt „vél á elite-stigi fyrir kant, en aerobic endurance undir" → 2–3 staðreyndir →
  radar (Engine/Driver) + viðmiðatafla + tilvitnun á bak við toggle. Confidence = signal coverage.

### 2. Contextualised peak period (Ju 2022)  ⭐⭐ flaggskip, meiri vinna
- **Spurning:** hvað er leikmaðurinn taktískt að gera í ákafustu 1/3/5-mín gluggunum (Recovery Run, Support Play,
  Run in Behind…)? Samtvinnar „hversu mikið/hvernig" (GPS/IMA) við „hvað" (atburðir) á sama tíma-glugga.
- **Gögn:** peak-period gluggar (til, `player_load_peak_period`) × **tíma-stimplaðir atburðir** (StatsBomb/InStat
  hafa tímastimpil). **Gagna-gat:** (a) peak-period gluggarnir úr Catapult MII gefa bara heildarvegalengd +
  Player Load, ekki háhraða-hlutann per glugga; (b) þarf tíma-samstillingu GPS-klukku ↔ atburða-klukku.
- **Gerleiki:** miðlungs → þarf peak-period HSR (custom Catapult-parameter eða úr hráum GPS) OG event-time
  alignment. Mesta aðgreiningin ef það tekst — enginn í smærri deildum gerir þetta.
- **Explainability:** „peak-glugga hlaðið stacked bar" eins og í greininni (Recovery Run/Support Play…), verdikt
  „ákafi hans er drifinn af sóknar-endurteknum sprettum" → details.

### 3. Player signature / archetype
- **Spurning:** hvers konar leikmaður er þetta þegar physical + tactical eru sett saman? („háanaeróbur beinn
  kantmaður" vs „lág-álags spilandi kantmaður").
- **Gögn:** samsett fingrafar = engine (GPS) × driver (IMA) × output (OBV/atburðir), klasagreining innan stöðu.
- **Gerleiki:** miðlungs. Þarf nóg af leikmönnum fyrir stöðugar klasa (confidence-mál); n-viðvörun mikilvæg.
- **Explainability:** archetype-merki + „líkastir" leikmenn; verdikt í einni setningu, klasa-vídd á bak við toggle.
  Frábært fyrir skátun/leikmannakaup.

### 4. Readiness-adjusted output  (spec #2, þegar til)
- **Spurning:** heldur taktísk framleiðsla (OBV/stig) þegar readiness dettur — eða er hann „state-háður"?
- **Gögn:** readiness-litur á leikdegi × per-leik output. Allt til.
- **Gerleiki:** hár — `docs/tasks/readiness-adjusted-output-spec.md` er skrifað og „Form vs State" spjaldið byggt.
- **Explainability:** til staðar. Aðeins að dýpka (per-stöðu, fleiri leikir).

### 5. Robustness / meiðsla-snemmviðvörun
- **Spurning:** er samsett merki (álag GPS + mechanical IMA decel/CoD + output-fall + CMJ-fall) að spá auknu
  meiðsla-/þreytu-áhættu?
- **Gögn:** GPS + IMA + VALD CMJ + output — allt til, en dreift.
- **Gerleiki:** lægri — viðkvæmast, þarf sterka confidence/validation og má ALLS EKKI verða falskt readiness-merki.
  Sér-labelað „trend alert", aldrei liturinn. Hæsta virði en mestur agi.

---

## Röðun sem ég mæli með

1. **Role-demand fit** (byggir á Game-Plan Fit) — fljótt, hátt gildi, staðfestir nálgunina.
2. **Readiness-adjusted output** dýpkun — nánast til.
3. **Contextualised peak period** — flaggskipið; byrja á event-time alignment + leysa peak-HSR gatið.
4. **Signature/archetype** — þegar nóg gögn eru komin fyrir stöðuga klasa.
5. **Robustness** — síðast, með mestri validation.

## Gagna-göt sem þarf að leysa (heiðarleiki fyrst)
- **Peak-period HSR** (fyrir #2): Catapult MII gefur bara distance + player load per glugga. Þarf háhraða-þröskuld
  per glugga (custom parameter eða raw GPS).
- **Event-time alignment** (#2): samstilla GPS-klukku við StatsBomb/InStat/FIBA tímastimpil.
- **Sample/confidence** (#3,#5): lítið deildar-úrtak → confidence-merki skylda, ekki oftúlka.

## Guardrails (manifestó)
- Allt fusion-lag er **descriptive/advisory** — snertir aldrei readiness-litinn né daglega ákvörðun.
- Lagskiptur lestur á hverju korti: verdikt (5 sek) → 2–3 einfaldar staðreyndir (án hrognamáls) → details/jargon
  + tilvitnun (Ju 2022, Modric 2019, Bradley & Ade…) á bak við toggle.
- Confidence (signal coverage + n) við hvert verdikt.
- AI (ef notað) merkir sig sem AI og vitnar í undirliggjandi merki; **reglur ákveða, AI útskýrir**.
- Provenance + English default / IS toggle, bæði coach-readable.

## Svarið við „er decision layer nóg?"
Nei. Decision layer = álagsstjórnun (nauðsynleg). Fusion-lögin = frammistaða + þroski + skátun (aðgreiningin).
Rétta varan er **decision layer + eitt sterkt fusion-lag per spurningu**, hvert með lagskipta lestrinum. Það er
kerfi sem gerir það sem samkeppnin gerir ekki — án þess að drukkna í hrognamáli.

*(Andstæða sjónarmiðið, vísvitandi: fyrir minnstu klúbba sem nýta ekki einu sinni grunninn getur „decision layer +
hrein grunn-framsetning" verið réttari vara en djúp sérhæfing. Val fer eftir markhópi.)*
