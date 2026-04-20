# OFF-dags bias fix — 2026-04-15

## Vandamálið
Þegar lið er með OFF dag (ekkert æfing, enginn check-in) þá keyrir `impute_off_day_checkins()` fyrir alla leikmenn og fyllir inn "gervi" entries. Gamla útfærslan var bjöguð:

1. **`+0.5` bias í rest-day greininni** – leikmenn fengu hærri metric-tölur en median úr sögunni benti til.
2. **Baseline var ekki hreint** – median var reiknað úr 7 daga sögu sem innihélt:
   - Aðrar imputed færslur (sem voru líka með +0.5 bias).
   - GAME daga og MD+1 / MD+2 (þar sem tölur eru eðlilega lágar vegna endurheimtu).
3. **Compounding** – næsti OFF dagur notaði fyrri bjagaðar færslur sem baseline og bjögnin bættist ofan á.

Niðurstaðan: OFF dagar skiluðu stöðugt `total_score` 23–25/25 og allir leikmenn urðu GREEN. Rauntölur næsta dags sýndu þá falskt "Team Pulse declining" – því raunveruleg 20/25 innskráning leit út fyrir að vera lakari en gervi-25 úr gær.

## Hvað breyttist (þrjár migrations í dag)

### 1. `fix_impute_off_day_checkins_remove_bias`
`public.impute_off_day_checkins(target_date)`:
- **Fjarlægði `+0.5` bias** á öllum fimm metric-um í rest-day greininni. Nú notuð median beint.
- **Víkkaði baseline glugga** úr 7 dögum í **21 dag**.
- **Breytti default gildi** (þegar engin saga) úr `4` í `3`.
- **Baseline query útilokar núna:**
  - `is_imputed = true` færslur
  - GAME daga (NOT EXISTS fyrir GAME í 2 dögum á undan)
  - MD+1 og MD+2 daga (join á `week_plans`)
- `notes` innihalda núna `baseline n=%s` svo hægt sé að rekja.
- MD+1 og MD+2 greinarnar nota áfram sömu rökfræði (soreness/fatigue -1 frá median á MD+1), en fá hreina baseline.

### 2. `fix_hybrid_readiness_exclude_imputed`
`public.mp_apply_hybrid_readiness()` (trigger function) — `hist` CTE sem byggir z-score baseline fékk:
```sql
and coalesce(r.is_imputed, false) = false
```
`computed_auto_reason` og `coach_message` innihalda núna `excl_imputed` svo frontend sér skýrt af hverju baseline gæti verið styttri en 60 dagar.

### 3. `fix_mp_deviation_level_exclude_imputed`
`public.mp_deviation_level(...)` fékk sömu viðbót – hún er kölluð frá `mp_set_baseline_z_before_pi` trigger.

## Retroaktífa leiðréttingin á gærdeginum
Öllum 29 imputed færslum fyrir 2026-04-14 var eytt og `impute_off_day_checkins('2026-04-14')` keyrð aftur með nýju lógíkinni. Niðurstaða:

| Mæling | Fyrir | Eftir |
|---|---|---|
| Meðaltal total_score | ~24 | 19,55 |
| Bil | 22–25 | 15–25 |
| Allir GREEN? | já | nei – 11 YELLOW |

Raunverulegar færslur (Andri, Anton Ari) voru ekki snertar.

Á sama hátt var gerð snertu-update á öllum 10 færslum dagsins (2026-04-15) þannig að hybrid flag og z-score voru endurreiknuð með nýju baseline lógíkinni. Ívar Örn (20) og Aron Bjarnason (18) fá t.d. núna réttilega YELLOW þar sem baseline-ið er ekki lengur uppblásið.

## Frontend ábending – Team Pulse "declining vs yesterday"
Þessi logík er í Next.js frontend (ekki í DB view) og þarf aðlögun:

1. **Sleppa OFF dögum úr samanburði.** Ef gærdagurinn var OFF (allar færslur `is_imputed = true`) á ekki að sýna "Team Pulse declining" – við ættum að bera saman við **síðasta raundag**.
   - SQL dæmi til að finna síðasta raundag:
     ```sql
     select max(entry_date)
     from readiness_entries
     where team_id = :team_id
       and entry_date < :today
       and is_imputed is not true;
     ```
2. **Útiloka imputed færslur úr Team Pulse reikningi.** Þegar "gærdagurinn" er blandaður (sumir raunverulegir, sumir imputed) er öruggast að taka AVG eingöngu af `is_imputed = false` færslum – eða birta tvær tölur (raun vs imputed).
3. **Merkja OFF daga sérstaklega í UI.** Ef allar færslur dagsins eru imputed ætti að sýna t.d. badge "OFF – áætluð gögn" svo þjálfari skilji af hverju samanburður er öðruvísi.
4. **Label fyrir baseline-building leikmenn.** Leikmenn með fáar raunverulegar færslur (`n < 7 excl_imputed`) fá núna `Baseline building` í `computed_auto_reason`. Væri hjálplegt að sýna þetta í tooltip.

## Staðfesting
- DNS: micropulse.is, www, app, breidablik allir með rétt CNAME/A records (sjá sameiginlegt Cloudflare zone).
- Dashboard sýnir núna heilbrigðari dreifingu (gær: avg 19,55 / blanda af YELLOW/GREEN; í dag: Aron, Höskuldur, Ívar Örn YELLOW).
- Allar 3 migrations applied sem `supabase migrations`.
