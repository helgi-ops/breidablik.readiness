-- New coaches join an EXISTING team only by invitation (coach's decision, 2026-11-08).
--
-- Before: handle_new_user trusted signup metadata, which the caller writes. `{role:'ADMIN'}` gave a full admin
-- account and `{role:'COACH', team_id:X}` gave coach access to any team, from the public /signup page.
-- Now:
--   * role is whitelisted to PLAYER / COACH. Elevated roles are only ever granted server-side.
--   * a COACH gets a team only through a valid coach_invitations token (matching email) or a coach
--     team_invite_links token; the team comes from the invitation, never from metadata.
--   * creating a NEW team (club_team_new) and the personal-trainer flow are unchanged.
--   * a PLAYER signing up to a team still lands PENDING / inactive until a coach approves.
-- Existing accounts are not touched.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role      text;
  v_team_id   uuid;
  v_full_name text;
  v_player_id uuid;
  v_team_type text;
  v_team_name text;
  v_sport     text;
  v_gender    text;
  v_club_short text;
  v_first_player_name text;
  v_plan      text;
begin
  v_role := upper(trim(coalesce(new.raw_user_meta_data->>'role', 'PLAYER')));
  if v_role not in ('PLAYER', 'COACH') then
    v_role := 'PLAYER';
  end if;

  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'display_name',
    ''
  );
  v_team_type := new.raw_user_meta_data->>'team_type';

  if v_role = 'COACH' then
    -- Metadata never grants a coach access to a team: only a live invitation does.
    v_team_id := null;

    select ci.team_id into v_team_id
      from public.coach_invitations ci
     where ci.token = new.raw_user_meta_data->>'coach_invite_token'
       and ci.status = 'pending'
       and (ci.expires_at is null or ci.expires_at > now())
       and lower(ci.coach_email) = lower(new.email);

    if v_team_id is null then
      select l.team_id into v_team_id
        from public.team_invite_links l
       where l.token = new.raw_user_meta_data->>'team_invite_token'
         and upper(l.target_role) = 'COACH'
         and l.is_active is true
         and (l.expires_at is null or l.expires_at > now());
    end if;
  else
    begin
      v_team_id := (new.raw_user_meta_data->>'team_id')::uuid;
    exception when others then
      v_team_id := null;
    end;
  end if;

  if v_role = 'COACH' and v_team_id is null and v_team_type = 'club_team_new' then
    v_team_name  := trim(coalesce(new.raw_user_meta_data->>'team_name', ''));
    v_sport      := coalesce(new.raw_user_meta_data->>'sport', 'football');
    v_gender     := new.raw_user_meta_data->>'gender';
    v_club_short := new.raw_user_meta_data->>'club_short_name';

    v_plan := upper(coalesce(new.raw_user_meta_data->>'product_plan', 'PRO'));
    if v_plan not in ('FREE', 'LITE', 'PRO', 'ELITE') then
      v_plan := 'PRO';
    end if;

    if v_team_name <> '' then
      insert into public.teams (
        name, sport, gender, team_type,
        club_short_name, plan_tier,
        trial_ends_at, subscription_status
      )
      values (
        v_team_name,
        v_sport,
        nullif(v_gender, ''),
        'club_team',
        nullif(v_club_short, ''),
        v_plan,
        now() + interval '14 days',
        'trial'
      )
      returning id into v_team_id;

      if v_team_id is not null then
        insert into public.team_settings (
          team_id, sport_type, indoor_mode, uses_wellness_features
        )
        values (
          v_team_id,
          case when lower(v_sport) = 'basketball' then 'basketball' else 'football' end,
          (lower(v_sport) = 'basketball'),
          true
        )
        on conflict (team_id) do nothing;
      end if;
    end if;
  end if;

  insert into public.profiles (id, display_name, role, team_id, player_id, full_name)
  values (
    new.id,
    v_full_name,
    v_role,
    case when v_role = 'COACH' then v_team_id else null end,
    null,
    v_full_name
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        role         = excluded.role,
        team_id      = case when upper(excluded.role) = 'COACH' then excluded.team_id else profiles.team_id end,
        full_name    = excluded.full_name;

  if v_role = 'COACH' then
    insert into public.coaches (user_id, display_name)
    values (new.id, v_full_name)
    on conflict (user_id) do nothing;

    if v_team_id is not null then
      insert into public.coach_teams (coach_id, team_id, is_primary)
      values (new.id, v_team_id, true)
      on conflict do nothing;
    end if;

    if v_team_type = 'club_team_new' and v_team_id is not null then
      v_first_player_name := trim(coalesce(new.raw_user_meta_data->>'first_player_name', ''));
      if v_first_player_name <> '' then
        insert into public.players (full_name, team_id, status, is_active)
        values (v_first_player_name, v_team_id, 'ACTIVE', true)
        on conflict do nothing;
      end if;
    end if;
  end if;

  if v_role = 'PLAYER' and v_team_id is not null then
    insert into public.players (user_id, full_name, team_id, status, requested_at, is_active)
    values (
      new.id,
      v_full_name,
      v_team_id,
      'PENDING',
      now(),
      false
    )
    on conflict do nothing
    returning id into v_player_id;

    if v_player_id is not null then
      update public.profiles
         set player_id = v_player_id,
             team_id   = v_team_id
       where id = new.id;
    end if;
  end if;

  return new;
end;
$function$;

-- Invitations are the gate now, so nobody may mint or re-point one from the browser. A coach could insert an
-- invitation to their own email (`or is_staff()`, 33 coaches qualify) or update team_id on their own invitation,
-- then accept it and join any team. Every app reader and writer of this table is a service-role route.
drop policy if exists coach_inv_insert on public.coach_invitations;
drop policy if exists coach_inv_update on public.coach_invitations;
drop policy if exists coach_inv_select on public.coach_invitations;
revoke all on public.coach_invitations from anon, authenticated;

-- staff_users.role='coach' must not be able to redeem someone else's invitation.
create or replace function public.accept_coach_invitation(p_token text)
returns table(team_id uuid, role text)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  select * into v_invite
    from public.coach_invitations
    where token = p_token
    for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending' using errcode = 'P0001';
  end if;

  if v_invite.expires_at < now() then
    update public.coach_invitations set status = 'expired' where id = v_invite.id;
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  if lower(v_invite.coach_email) <> coalesce(v_email, '')
     and not public.is_elevated_staff()
  then
    raise exception 'invite_email_mismatch' using errcode = 'P0001';
  end if;

  insert into public.coach_teams (coach_id, team_id, is_primary)
  values (v_uid, v_invite.team_id, false)
  on conflict (coach_id, team_id) do nothing;

  insert into public.coaches (user_id, display_name)
  values (v_uid, coalesce(v_invite.coach_name, v_email))
  on conflict (user_id) do nothing;

  update public.coach_invitations
     set status = 'accepted',
         accepted_at = now(),
         accepted_by = v_uid
   where id = v_invite.id;

  return query select v_invite.team_id, v_invite.role;
end
$function$;

-- A coach row in staff_users could otherwise promote itself to role='staff' or add anyone. No browser writer exists.
drop policy if exists staff_users_write_staff on public.staff_users;
create policy staff_users_write_staff on public.staff_users
  for all to authenticated
  using (public.is_elevated_staff())
  with check (public.is_elevated_staff());
