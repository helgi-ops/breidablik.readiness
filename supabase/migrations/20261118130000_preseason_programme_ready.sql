-- Pre-season readiness (2026-11-18): the right team programme on the player's Today.
--
-- 1. Breiðablik's main programme active again. All three Breiðablik team-level Custom Programme sets had been
--    switched off, so "newest wins" picked the partial "Lower body program" (4 rows, MD-4 in season, no English
--    column). Its read failed on Today and the main programme — the only one with pre-season sessions — was never
--    shown. Same correction as 20261012220000_custom_template_sets_is_active.sql (the coach can switch it off again
--    in Custom Programmes). No-op in environments without this team / these rows.
update public.custom_template_sets set is_active = false
where team_id = '94b52a06-0b83-48da-8664-639ec3486a0c' and player_id is null;
update public.custom_template_sets set is_active = true
where team_id = '94b52a06-0b83-48da-8664-639ec3486a0c' and player_id is null
  and table_name = 'breidablik_football_karlar_microdose_templates';

-- 2. The English column on every programme table that lacks it. Today reads
--    "title, description, structure, structure_en, …"; a table without structure_en makes that read fail and the
--    programme silently disappear. Empty column only (Today shows `structure` when `structure_en` is empty);
--    no content changes. Tables created since 2026-11-09 already have it.
do $$
declare t text;
begin
  foreach t in array array[
    'lower_body_program_football_karlar_microdose_templates',
    'hk_football_karlar_microdose_templates',
    'hk_football_karlar_microdose_templates_player_07b04f1a_20260728',
    'keflavik_football_karlar_microdose_templates'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists structure_en jsonb', t);
    end if;
  end loop;
end $$;
