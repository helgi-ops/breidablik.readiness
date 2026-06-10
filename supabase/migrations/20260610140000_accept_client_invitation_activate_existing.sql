-- Fix: when a client accepts their PT invite, a players row may ALREADY exist
-- (created PENDING/is_active=false by the new-user signup trigger that runs a
-- couple of seconds earlier). The old function only created an ACTIVE player
-- when none existed, so the pre-created pending row was never promoted — the
-- client stayed invisible to the trainer (the client list filters is_active).
-- Now: promote the existing row to ACTIVE on accept too.
CREATE OR REPLACE FUNCTION public.accept_client_invitation(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_invite  record;
  v_player  record;
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  -- Find valid invitation
  select * into v_invite
  from public.client_invitations
  where token = p_token
    and status = 'pending'
    and expires_at > now();

  if v_invite is null then
    return jsonb_build_object('success', false, 'error', 'invalid_or_expired_invitation');
  end if;

  -- Check if player record already exists for this user+team
  select * into v_player
  from public.players
  where user_id = v_user_id and team_id = v_invite.team_id;

  if v_player is null then
    -- Create player record (active)
    insert into public.players (
      full_name, user_id, team_id, sport, status, is_active
    ) values (
      coalesce(v_invite.client_name, ''),
      v_user_id,
      v_invite.team_id,
      'general',
      'ACTIVE',
      true
    )
    returning * into v_player;
  else
    -- Promote an existing (possibly pending/inactive, e.g. created by the
    -- new-user trigger) row to active on accept, and fill the name if blank.
    update public.players
    set is_active = true,
        status = 'ACTIVE',
        full_name = coalesce(nullif(trim(full_name), ''), v_invite.client_name, full_name)
    where id = v_player.id
    returning * into v_player;
  end if;

  -- Mark invitation as accepted
  update public.client_invitations
  set status = 'accepted',
      player_id = v_player.id,
      accepted_at = now()
  where id = v_invite.id;

  return jsonb_build_object(
    'success', true,
    'player_id', v_player.id,
    'team_id', v_invite.team_id,
    'message', 'Welcome'
  );
end;
$function$;
