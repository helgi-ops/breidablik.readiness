# Readiness flag-rate validation — cross-club run (31 Aug 2026)

Read-only verdict-accuracy pass across every active club, extending the 31 Aug Breiðablik
validation. Simulates the now-live SD-floor colour engine against the actual stored colours,
and profiles each club's check-in variance. **Nothing was written — pure analysis.**

- Colour engine: `mp_apply_hybrid_readiness` — baseline = trailing **28-day** window of the
  player's prior REAL check-ins (`is_imputed = false`), up to 60 rows, `stddev_samp`;
  `z = (total − mean) / greatest(sd, 1.5)` (SD floor **live**).
- Harness "floored" model = the simplified z-band re-simulation from the Breiðablik findings:
  green > −0.5 / yellow > −1.0 / else red. It measures the **direction** of the floor's effect,
  not the exact live colours (the live engine adds abs bands, points floors, safety floors and
  overrides on top). Compared like-for-like on mature-baseline rows (n ≥ 10) over the last 60 days.

## 1. The SD floor is safe and consistent at every club
Same pattern everywhere as on Breiðablik — **yellow roughly halves, red barely moves** (reds
preserved = the floor removes noise, not real signal).

| Club | mature rows | Red actual → floored | Yellow actual → floored |
|---|---|---|---|
| Breiðablik (ref) | 859 | 12.0 → 10.7 | 16.3 → **7.6** |
| HK | 768 | 14.5 → 13.7 | 27.7 → **11.7** |
| Þór | 314 | 12.4 → 10.8 | 30.3 → **12.4** |
| Keflavík | 167 | 25.7 → 25.1 | 24.6 → **9.6** |
| Grindavík | 100 | 21.0 → 17.0 | 23.0 → **7.0** |
| Afturelding | 46 | 19.6 → 21.7 | 15.2 → 8.7 |

*Afturelding's small (46-row) sample makes the red figure noisy; ignore the +2.1pt wobble.*
*Demo/test teams excluded (see §4).*

**Verdict: keep the floor squad-wide. No per-club threshold change is warranted — it behaves
identically across the client base, and no club shows it over-correcting reds.**

## 2. Residual over/under-flagging is on HIGH-variance reporters — universal
The floor can't help players whose real SD already exceeds 1.5. Every real multi-player club has
them; these are exactly who the now-live two-tailed **check-in-reliability note** flags
(`checkCheckinVariability`, surfaced in the Decision Summary drawer).

| Club | players judged (≥10 real check-ins / 28d) | low-var (SD < 1.0) | high-var (SD > 2.5) | max SD |
|---|---|---|---|---|
| Breiðablik | 24 | 3 | **6** | 3.51 |
| HK | 20 | 1 | **4** | 2.92 |
| Þór | 5 | 1 | **2** | 3.59 |
| Keflavík | 3 | 0 | 1 | 2.94 |
| Grindavík | 2 | 1 | 0 | 1.28 |

## 3. Two real signals this run surfaced
1. **Keflavík red rate (25.7%) barely moves with the floor.** Its reds come from *low absolute
   scores* (safety floor `total < 12`, chronic-low cap `mean < 16`), not tight-norm noise — so the
   floor leaves them. Either a genuinely fatigued squad or a reporting pattern; worth a direct look,
   but it is not a threshold problem.
2. **The bigger residual lever at smaller clubs is check-in COVERAGE, not thresholds.** Only 5 (Þór),
   3 (Keflavík), 2 (Grindavík), 1 (Afturelding) players have ≥10 *real* check-ins in 28 days — most
   players there aren't logging consistently, so their norms lean on imputation and the reliability
   note can't even judge them. This is an **adoption** lever (`/coach/usage-analytics` + check-in
   reminders), consistent with the findings' "data-reliability, not more thresholds" conclusion.

## 4. Demo / test teams (excluded from conclusions)
- **MicroPulse Sýnislið (Lite)** — 24 players at SD 0.00 (synthetic seeded check-ins); its
  floored-yellow 38.3 → 1.4 is an artifact of identical entries, not signal.
- **MicroPulse Körfubolta-sýnilið** — synthetic basketball demo.
- **Helgi Gudfinnsson** — personal test team (4 players).

## 5. Bottom line
- Phase 0 SD floor is **validated across the whole client base** — safe, consistent, no further
  threshold work.
- The two-tailed **reliability note (now live)** is relevant at every club with high-SD reporters.
- The next accuracy lever is **check-in adoption at the smaller clubs**, not the colour engine.
- Re-run this harness before/after any future threshold change.

## Reusable harness queries

### A — actual vs floored colour mix per club (mature-baseline rows, 60d)
```sql
with base as (
  select re.team_id, re.total_score, lower(re.color) actual, st.n, st.mu, st.sd
  from readiness_entries re
  cross join lateral (
    select count(*)::int n, avg(h.total_score)::numeric mu, stddev_samp(h.total_score)::numeric sd
    from readiness_entries h
    where h.player_id = re.player_id and h.entry_date < re.entry_date
      and h.entry_date >= re.entry_date - interval '28 days'
      and h.total_score is not null and coalesce(h.is_imputed,false)=false
  ) st
  where re.entry_date >= current_date - 60 and re.is_imputed = false and re.total_score is not null
),
scored as (
  select team_id, actual,
    case when (total_score - mu)/greatest(sd,1.5) > -0.5 then 'green'
         when (total_score - mu)/greatest(sd,1.5) > -1.0 then 'yellow' else 'red' end as floored
  from base where n >= 10 and sd is not null
)
select t.name, count(*) n_mature,
  round(100.0*count(*) filter (where actual='red')/count(*),1)     actual_red,
  round(100.0*count(*) filter (where floored='red')/count(*),1)    floored_red,
  round(100.0*count(*) filter (where actual='yellow')/count(*),1)  actual_yellow,
  round(100.0*count(*) filter (where floored='yellow')/count(*),1) floored_yellow
from scored s join teams t on t.id = s.team_id
group by t.name order by n_mature desc;
```

### B — check-in variance profile per club (28d, real check-ins)
```sql
with s as (
  select re.team_id, re.player_id, count(*) n, stddev_samp(re.total_score) sd
  from readiness_entries re
  where re.is_imputed = false and re.entry_date >= current_date - 28
  group by re.team_id, re.player_id
  having count(*) >= 10
)
select t.name, count(*) players_judged,
  count(*) filter (where sd < 1.0) low_var,
  count(*) filter (where sd > 2.5) high_var,
  round(avg(sd)::numeric,2) mean_sd, round(max(sd)::numeric,2) max_sd
from s join teams t on t.id = s.team_id
group by t.name
order by (count(*) filter (where sd > 2.5) + count(*) filter (where sd < 1.0)) desc;
```

Ref: `mp_apply_hybrid_readiness` / `mp_set_baseline_z_before_pi` (colour engine, SD floor live),
`checkCheckinVariability` + `/api/coach/team/checkin-reliability` (two-tailed reliability note),
`readiness-low-variance-oversensitivity-fix-brief.md` (superseded).
