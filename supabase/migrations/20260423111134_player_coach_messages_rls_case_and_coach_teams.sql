-- Recreate player_coach_messages policies to handle:
--   (1) Mixed-case role values (DB has both 'COACH' and 'coach', 'PLAYER' and 'player')
--   (2) Coaches whose team_id lives in coach_teams, not profiles.team_id
-- Same systemic fix as login + week-setup + broadcast.

drop policy if exists coach_select_messages       on public.player_coach_messages;
drop policy if exists coach_insert_messages       on public.player_coach_messages;
drop policy if exists coach_update_read           on public.player_coach_messages;
drop policy if exists player_select_own_messages  on public.player_coach_messages;
drop policy if exists player_insert_own_messages  on public.player_coach_messages;
drop policy if exists player_update_read          on public.player_coach_messages;

create policy coach_select_messages on public.player_coach_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('coach','admin','staff')
        and (
          p.team_id = player_coach_messages.team_id
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid()
              and ct.team_id = player_coach_messages.team_id
          )
        )
    )
  );

create policy coach_insert_messages on public.player_coach_messages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('coach','admin','staff')
        and (
          p.team_id = player_coach_messages.team_id
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid()
              and ct.team_id = player_coach_messages.team_id
          )
        )
    )
    and sender_id = auth.uid()
    and lower(sender_role) in ('coach','admin','staff')
  );

create policy coach_update_read on public.player_coach_messages
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('coach','admin','staff')
        and (
          p.team_id = player_coach_messages.team_id
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid()
              and ct.team_id = player_coach_messages.team_id
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) in ('coach','admin','staff')
        and (
          p.team_id = player_coach_messages.team_id
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid()
              and ct.team_id = player_coach_messages.team_id
          )
        )
    )
  );

create policy player_select_own_messages on public.player_coach_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) = 'player'
        and p.player_id = player_coach_messages.player_id
    )
  );

create policy player_insert_own_messages on public.player_coach_messages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) = 'player'
        and p.player_id = player_coach_messages.player_id
    )
    and sender_id = auth.uid()
    and lower(sender_role) = 'player'
  );

create policy player_update_read on public.player_coach_messages
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) = 'player'
        and p.player_id = player_coach_messages.player_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(p.role) = 'player'
        and p.player_id = player_coach_messages.player_id
    )
  );
