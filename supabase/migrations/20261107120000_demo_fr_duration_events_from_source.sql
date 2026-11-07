-- Demo – Full and Demo – GPS Pro: copy the IMA Free Running columns from the Breiðablik rows they were cloned from.
--
-- The demo teams are clones of Breiðablik (20261030080151). Breiðablik's Catapult re-sync (Nov 2026) filled the
-- Free Running duration / event-count / band 1–4 distance / raw columns back to 2026-03-31, and corrected the
-- stride counts (V2 total_strides only); the clones still carry the October values. Each demo row is matched to
-- its source row by its fingerprint (source player, player load, distance, IMA accelerations, session minutes),
-- which survives the date shifts the demo seeds apply. Rows that match exactly one source row take every
-- ima_fr_* column from it; the rest are left as they are. Demo – GPS Core is a Core-tier clone and has no FR.
-- Idempotent: re-running copies the same values again.

do $$
declare
  v_cols text; v_set text; v_team uuid; v_n int;
  v_map text := $m$(values
    (1,'d9f1e2a0-2d3a-4624-b5c3-6e1039a0723f'::uuid),(2,'d372a2ea-a0c4-4a0b-9492-e9f04a091975'),
    (3,'debd8c5d-a70f-4d2a-a274-72dabf349010'),(4,'02b6a94e-9386-496e-b3dc-7d7b989fb409'),
    (5,'90aef56f-1f6e-4c73-b00c-44369ec5d22d'),(6,'0eef76b8-1aed-4bb0-926d-528f0e8010bc'),
    (7,'f8196567-0329-4edb-ad81-ed4af8bd91a8'),(8,'65cb3004-0c06-4806-a9ff-28ee77d43fef'),
    (9,'6429def5-7816-47c3-bbd5-47b2fe822602'),(10,'b1eed779-69c6-4e46-9403-f2358cb2ac3d'),
    (11,'67ebee97-2194-4edd-adfc-389636001860'),(12,'73a1c9ec-2ba2-408a-9aed-ec6c523ed507'),
    (13,'c67e779a-e0e5-4428-9de5-3ec6e668c152'),(14,'4a6d7211-e9ad-4ba5-a921-2829aea8eb5d')
  ) m(rn, src)$m$;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(format('%1$I = s.%1$I', column_name), ', ' order by ordinal_position)
  into v_cols, v_set
  from information_schema.columns
  where table_schema = 'public' and table_name = 'player_external_load_daily'
    and is_generated = 'NEVER' and column_name like 'ima\_fr\_%';

  foreach v_team in array array['de300001-0000-4000-8000-000000000001','de300002-0000-4000-8000-000000000002']::uuid[] loop
    execute format($f$
      with demo as (
        select d.player_id, d.date, d.player_load, d.total_distance, d.ima_accel, d.session_duration_minutes
        from player_external_load_daily d where d.team_id = %1$L
      ),
      matched as (
        select demo.player_id as demo_player_id, demo.date as demo_date, min(s.player_id::text)::uuid as src_player_id, min(s.date) as src_date, count(*) as n
        from demo
        join %2$s on true
        join player_external_load_daily s
          on s.team_id = '94b52a06-0b83-48da-8664-639ec3486a0c' and s.player_id = m.src
         and s.player_load = demo.player_load
         and coalesce(s.total_distance, -1) = coalesce(demo.total_distance, -1)
         and coalesce(s.ima_accel, -1) = coalesce(demo.ima_accel, -1)
         and coalesce(s.session_duration_minutes, -1) = coalesce(demo.session_duration_minutes, -1)
        where demo.player_id = md5(%1$L || ':' || m.rn)::uuid
          and s.ima_fr_band5_total_duration is not null
        group by 1, 2
        having count(*) = 1
      )
      update player_external_load_daily d set %3$s
      from matched x join player_external_load_daily s on s.player_id = x.src_player_id and s.date = x.src_date
      where d.player_id = x.demo_player_id and d.date = x.demo_date and d.team_id = %1$L
    $f$, v_team, v_map, v_set);
    get diagnostics v_n = row_count;
    raise notice 'demo team % : % rows updated from source', v_team, v_n;
  end loop;
end $$;
