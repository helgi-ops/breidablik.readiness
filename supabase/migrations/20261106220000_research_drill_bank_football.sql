-- Football research drill bank: pair each drill to a training day type, and record how each row was
-- checked against its paper. The week plan and block PDFs print these under "From research"; they print
-- no drill from a coach's or a team's own library (a personal library follows the coach across teams).
--
-- A row prints only when `verified_from` is set:
--   full_text = read in the paper itself          abstract = confirmed by the paper's abstract
--   excerpt   = confirmed by an excerpt of the paper's own table, surfaced by a search
--   null      = not checked; never prints
--
-- `day_fit` = the day types a drill is paired to (mechanical | mixed | locomotive | activation | topup),
-- plus an optional MD token ("MD-1") when the study ties the drill to one day of its own week. The rule,
-- applied to every row the same way:
--   1. Where the study places the drill on a day of its own microcycle, that day wins (Martín-García 2018).
--   2. Otherwise by game size and pitch size per player (Hill-Haas 2011; Riboli 2020):
--        up to 5v5 on 30–90 m² per player                      → mechanical
--        mid-size games on 100–170 m² per player               → mixed
--        large games with goalkeepers on 150+ m², or interval runs → locomotive
--
-- What the check found in the 29 rows that were already here (no migration ever inserted them):
--   * Rampinini 2007: the 3v3 and 6v6 pitch sizes match the paper's Table I. The two heart-rate cells the
--     abstract gives (3v3 large pitch with encouragement 91%; 6v6 small pitch without 84%) match. The RPE
--     column did NOT match the abstract in either cell (8.5 here vs 7.2; 5.9 here vs 4.8), so RPE is cleared
--     on all 24 rows. The 4v4 and 5v5 pitch sizes and the bout count could not be confirmed and stay unchecked.
--   * Fradua 2013: the abstract recommends 65–110 m² per player and a 1:1 to 1:1.3 pitch; it does not give the
--     per-format pitch sizes or durations these 5 rows carry. They stay unchecked, and one row that states
--     only what the abstract states is added.

alter table public.drill_library_public
  add column if not exists day_fit text[],
  add column if not exists drill_name_is text,
  add column if not exists finding_en text,
  add column if not exists finding_is text,
  add column if not exists verified_from text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'drill_library_public_verified_from_check') then
    alter table public.drill_library_public
      add constraint drill_library_public_verified_from_check check (verified_from is null or verified_from in ('full_text', 'abstract', 'excerpt'));
  end if;
end $$;

comment on column public.drill_library_public.day_fit is 'Day types the drill is paired to (mechanical|mixed|locomotive|activation|topup) plus an optional MD token when the study ties it to one day.';
comment on column public.drill_library_public.finding_en is 'One measured fact from the paper, with the players it was measured on. Printed beside the drill.';
comment on column public.drill_library_public.verified_from is 'How the row was checked against its paper: full_text | abstract | excerpt. Null = unchecked, never printed.';

-- ── Rampinini et al. 2007 (24 rows already here) ─────────────────────────────────────────────────────
update public.drill_library_public set
  drill_name = drill_format || ' small-sided game, '
    || case when drill_name ilike '%small pitch%' then 'small' when drill_name ilike '%medium pitch%' then 'medium' else 'large' end || ' pitch'
    || case when coach_encouragement is false then ' (no coach encouragement)' else '' end,
  drill_name_is = drill_format || ' fámennur leikur, '
    || case when drill_name ilike '%small pitch%' then 'lítill' when drill_name ilike '%medium pitch%' then 'miðlungs' else 'stór' end || ' völlur'
    || case when coach_encouragement is false then ' (án hvatningar)' else '' end,
  reps = '4 min',
  rpe_cr10 = null,
  day_fit = case
    when area_per_player_m2 between 30 and 90 and drill_format in ('3v3', '4v4', '5v5') then array['mechanical']
    when area_per_player_m2 between 100 and 170 then array['mixed']
    else null end,
  finding_en = case when drill_format = '3v3' and drill_name ilike '%large pitch%' and coach_encouragement is true
    then 'about 91% of max heart rate with the coach encouraging (amateur players)'
    else 'amateur players; fewer players, a bigger pitch and coach encouragement each raised heart rate' end,
  finding_is = case when drill_format = '3v3' and drill_name ilike '%large pitch%' and coach_encouragement is true
    then 'um 91% af hámarkspúls með hvatningu þjálfara (áhugamenn)'
    else 'áhugamenn; færri leikmenn, stærri völlur og hvatning þjálfara hækkuðu hvert um sig púlsinn' end,
  verified_from = case
    when drill_format = '3v3' and drill_name ilike '%large pitch%' and coach_encouragement is true then 'abstract'
    when drill_format in ('3v3', '6v6') then 'excerpt'
    else null end
where sport = 'football' and source_doi = '10.1080/02640410600811858';

-- ── Fradua et al. 2013 (5 rows already here): unchecked; paired for when they are ───────────────────
update public.drill_library_public set day_fit = array['mixed'], verified_from = null
where sport = 'football' and source_doi = '10.1080/02640414.2012.746722' and field_length_m is not null;

-- ── New rows ─────────────────────────────────────────────────────────────────────────────────────────
insert into public.drill_library_public
  (sport, category, drill_name, drill_name_is, drill_format, field_length_m, field_width_m, total_players, reps,
   source_citation, source_doi, tags, day_fit, finding_en, finding_is, verified_from)
select v.* from (values
  -- Martín-García et al. 2018 (full text): the content of each day of FC Barcelona B's week, with the
  -- session's load relative to a match (Figure 1A, all positions).
  ('football', 'ssg', 'Small-sided game with goalkeepers, 25–50 m² per player', 'Fámennur leikur með markvörðum, 25–50 m² á leikmann', 'SSG + GK', null::numeric, null::numeric, null::int, null,
   'Martín-García et al. 2018 — J Strength Cond Res 32(12):3511-3518', '10.1519/JSC.0000000000002816', array['microcycle','md-4'], array['mechanical'],
   'part of the MD-4 session at FC Barcelona B, which reached 71–72% of a match''s accelerations and decelerations',
   'hluti af MD-4 æfingu hjá FC Barcelona B, sem náði 71–72% af hröðunum og hemlunum í leik', 'full_text'),
  ('football', 'possession', 'Positional game, 70–100 m² per player', 'Stöðuleikur, 70–100 m² á leikmann', 'positional game', null, null, null, null,
   'Martín-García et al. 2018 — J Strength Cond Res 32(12):3511-3518', '10.1519/JSC.0000000000002816', array['microcycle','md-3'], array['mixed'],
   'moderate intensity; opens the MD-3 session at FC Barcelona B, the one closest to a match in distance (57%)',
   'miðlungs ákefð; upphaf MD-3 æfingar hjá FC Barcelona B, þeirrar sem komst næst leik í vegalengd (57%)', 'full_text'),
  ('football', 'ssg', '11v11 on a shortened pitch', '11v11 á styttum velli', '11v11', 72, 65, null, null,
   'Martín-García et al. 2018 — J Strength Cond Res 32(12):3511-3518', '10.1519/JSC.0000000000002816', array['microcycle','md-3'], array['mixed'],
   'closes the MD-3 session at FC Barcelona B', 'lokar MD-3 æfingu hjá FC Barcelona B', 'full_text'),
  ('football', 'possession', 'Passing sequences, a small positional game, then tactical work', 'Sendingaraðir, lítill stöðuleikur og svo taktísk vinna', 'MD-2 session', null, null, null, null,
   'Martín-García et al. 2018 — J Strength Cond Res 32(12):3511-3518', '10.1519/JSC.0000000000002816', array['microcycle','md-2'], array['activation','MD-2'],
   'the MD-2 session at FC Barcelona B: accelerations and decelerations at 56–61% of a match',
   'MD-2 æfingin hjá FC Barcelona B: hraðanir og hemlanir 56–61% af leik', 'full_text'),
  ('football', 'other', 'Activation drills that rehearse match situations, then set pieces', 'Virkjunaræfingar sem líkja eftir leikaðstæðum, svo föst leikatriði', 'MD-1 session', null, null, null, null,
   'Martín-García et al. 2018 — J Strength Cond Res 32(12):3511-3518', '10.1519/JSC.0000000000002816', array['microcycle','md-1'], array['activation','MD-1'],
   'the MD-1 session at FC Barcelona B: about an hour, the lowest load of the week',
   'MD-1 æfingin hjá FC Barcelona B: um klukkustund, minnsta álag vikunnar', 'full_text'),
  ('football', 'ssg', 'Compensatory session: technical circuit, positional game, small-sided game with goalkeepers (30–60 m² per player)', 'Uppbótaræfing: tæknihringur, stöðuleikur og fámennur leikur með markvörðum (30–60 m² á leikmann)', 'MD+1 compensatory', null, null, null, null,
   'Martín-García et al. 2018 — J Strength Cond Res 32(12):3511-3518', '10.1519/JSC.0000000000002816', array['microcycle','md+1'], array['topup'],
   'players with under 60 minutes at FC Barcelona B: 86% of a match''s accelerations but little high-speed running; the authors suggest testing a mix with running drills',
   'leikmenn með undir 60 mínútur hjá FC Barcelona B: 86% af hröðunum í leik en lítið háhraðahlaup; höfundar leggja til að prófa blöndu með hlaupaæfingum', 'full_text'),
  ('football', 'other', 'Recovery: low-impact activity and regeneration exercises', 'Endurheimt: létt hreyfing og endurheimtaræfingar', 'MD+1 recovery', null, null, null, null,
   'Martín-García et al. 2018 — J Strength Cond Res 32(12):3511-3518', '10.1519/JSC.0000000000002816', array['microcycle','md+1'], array['topup'],
   'players with over 60 minutes at FC Barcelona B, the day after a match',
   'leikmenn með yfir 60 mínútur hjá FC Barcelona B, daginn eftir leik', 'full_text'),

  -- Riboli et al. 2020 (full text): the space per player at which a game matched official-match running
  -- (Serie A, 25 players; high-intensity running > 15 km/h, sprint > 24 km/h).
  ('football', 'ssg', 'Game with goalkeepers on a big pitch, about 260 m² per player', 'Leikur með markvörðum á stórum velli, um 260 m² á leikmann', '5v5–10v10 + GK', null, null, null, null,
   'Riboli et al. 2020 — PLoS One 15(9):e0229194', '10.1371/journal.pone.0229194', array['area-per-player','running'], array['locomotive'],
   'Serie A players matched a match''s running above 15 km/h at about 260 m² per player, and its sprinting at about 315 m²',
   'leikmenn í Serie A náðu hlaupum leiks yfir 15 km/klst við um 260 m² á leikmann, og sprettum við um 315 m²', 'full_text'),
  ('football', 'ssg', 'Small-sided game without goalkeepers, about 115 m² per player', 'Fámennur leikur án markvarða, um 115 m² á leikmann', '3v3–10v10', null, null, null, null,
   'Riboli et al. 2020 — PLoS One 15(9):e0229194', '10.1371/journal.pone.0229194', array['area-per-player'], array['mixed'],
   'Serie A players matched a match''s total distance at about 115 m² per player (about 190 m² with goalkeepers)',
   'leikmenn í Serie A náðu heildarvegalengd leiks við um 115 m² á leikmann (um 190 m² með markvörðum)', 'full_text'),

  -- Abstract-level rows.
  ('football', 'running', 'Interval runs', 'Interval hlaup', 'running', null, null, null, '4 × 4 min',
   'Helgerud et al. 2001 — Med Sci Sports Exerc 33(11):1925-1931', '10.1097/00005768-200111000-00019', array['aerobic','interval'], array['locomotive'],
   'at 90–95% of max heart rate with a 3-minute jog between; twice a week for 8 weeks raised match distance by 20% (elite juniors)',
   'á 90–95% af hámarkspúls með 3 mínútna skokki á milli; tvisvar í viku í 8 vikur jók vegalengd í leik um 20% (úrvals unglingar)', 'abstract'),
  ('football', 'ssg', 'Large-sided game, 9v9 to 11v11', 'Stór leikur, 9v9 til 11v11', '9v9–11v11', null, null, null, '3 × 5 min',
   'Owen et al. 2014 — Int J Sports Med 35:286-292', '10.1055/s-0033-1351333', array['large-sided'], array['locomotive'],
   'more high-intensity running and sprint distance than 4v4 (Scottish Premier League players)',
   'meira ákaft hlaup og meiri sprettvegalengd en í 4v4 (leikmenn í skosku úrvalsdeildinni)', 'abstract'),
  ('football', 'ssg', '4v4 with goalkeepers', '4v4 með markvörðum', '4v4 + GK', null, null, null, null,
   'Lacome et al. 2018 — Int J Sports Physiol Perform 13(5):568-576', '10.1123/ijspp.2017-0214', array['peak-demands'], array['mechanical'],
   'more mechanical work (speed changes) than a match''s hardest 1–4 minutes, less running (elite players)',
   'meira vélrænt álag (hraðabreytingar) en á erfiðustu 1–4 mínútum leiks, minna hlaup (úrvalsleikmenn)', 'abstract'),
  ('football', 'ssg', '5v5 with goalkeepers, big pitch (about 275 m² per player)', '5v5 með markvörðum, stór völlur (um 275 m² á leikmann)', '5v5 + GK', null, null, null, '8 min',
   'Casamichana & Castellano 2010 — J Sports Sci 28(14):1615-1623', '10.1080/02640414.2010.521168', array['pitch-size'], array['locomotive'],
   'youth players: the biggest of three pitches gave the most running, the highest heart rate and the hardest effort',
   'ungir leikmenn: stærsti völlurinn af þremur gaf mest hlaup, hæstan púls og mesta áreynslu', 'abstract'),
  ('football', 'ssg', '5v5 with goalkeepers, small pitch (about 75 m² per player)', '5v5 með markvörðum, lítill völlur (um 75 m² á leikmann)', '5v5 + GK', null, null, null, '8 min',
   'Casamichana & Castellano 2010 — J Sports Sci 28(14):1615-1623', '10.1080/02640414.2010.521168', array['pitch-size'], array['mechanical'],
   'youth players: the smallest of three pitches gave the least running, and some ball actions came more often',
   'ungir leikmenn: minnsti völlurinn af þremur gaf minnst hlaup, og sumar boltaaðgerðir urðu tíðari', 'abstract'),
  ('football', 'possession', 'Tactical game on a pitch sized from match play, 65–110 m² per player', 'Taktískur leikur á velli sem er stilltur eftir leik, 65–110 m² á leikmann', 'tactical game', null, null, null, null,
   'Fradua et al. 2013 — J Sports Sci 31(6):573-581', '10.1080/02640414.2012.746722', array['tactical','match-area'], array['mixed'],
   'sized from four La Liga matches; the pitch square, or up to 1.3 times as long as it is wide',
   'stillt eftir fjórum leikjum í La Liga; völlurinn ferningur, eða allt að 1,3 sinnum lengri en hann er breiður', 'abstract')
) as v(sport, category, drill_name, drill_name_is, drill_format, field_length_m, field_width_m, total_players, reps,
       source_citation, source_doi, tags, day_fit, finding_en, finding_is, verified_from)
where not exists (
  select 1 from public.drill_library_public p where p.sport = 'football' and p.source_doi = v.source_doi and p.drill_name = v.drill_name
);
