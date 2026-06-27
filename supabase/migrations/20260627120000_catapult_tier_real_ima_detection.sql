-- Fix Catapult data-tier auto-detection so Core/Lite clubs are never classified as
-- Pro/Vector Pro S7.
--
-- Root cause: get_catapult_data_tier used B2-3 accel/decel effort counts
-- (accel_b2_3_tot_effs_gen2 / decel_b2_3_tot_effs_gen2) as the "full" marker. But
-- those fields get populated on Core imports too — Keflavík (a Core club) had 149
-- B2-3 rows and ZERO genuine IMA, yet was detected as full.
--
-- Fix: distinguish full by GENUINE IMA sensor data only — jumps, change-of-
-- direction, IMA accel/decel events + bands, force-running (FMP). Core clubs don't
-- have these. Verified: Breiðablik (real_ima 301) → full, Keflavík (real_ima 0,
-- B2-3 149) → lite. The override + plan_type precedence is unchanged.

create or replace function public.get_catapult_data_tier(p_team_id uuid)
 returns text language plpgsql stable as $function$
declare
  v_override   text;
  v_plan       text;
  v_ima_count  int;
begin
  select catapult_data_tier_override, catapult_plan_type
    into v_override, v_plan
    from teams where id = p_team_id;

  if v_override in ('lite', 'full') then return v_override; end if;
  if v_plan = 'lite' then return 'lite'; end if;
  if v_plan in ('pro', 'premium') then return 'full'; end if;

  -- Genuine IMA (S7) markers only — NOT B2-3 effort counts (Core has those too).
  select count(*) into v_ima_count
    from player_external_load_daily
   where team_id = p_team_id
     and date >= current_date - interval '30 days'
     and ( coalesce(jumps,0) > 0
        or coalesce(ima_accel,0) > 0 or coalesce(ima_decel,0) > 0
        or coalesce(ima_cod_left_high,0) > 0 or coalesce(ima_cod_left_medium,0) > 0 or coalesce(ima_cod_left_low,0) > 0
        or coalesce(ima_cod_right_high,0) > 0 or coalesce(ima_cod_right_medium,0) > 0 or coalesce(ima_cod_right_low,0) > 0
        or coalesce(ima_band2_accel_count,0) > 0 or coalesce(ima_band3_accel_count,0) > 0
        or coalesce(ima_fr_band58_total_distance,0) > 0 );

  if v_ima_count >= 5 then return 'full'; else return 'lite'; end if;
end;
$function$;
