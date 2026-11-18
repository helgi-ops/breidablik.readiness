-- Send log for the automatic strength send (2026-11-18, review item C). See docs/session-delivery-model.md.
--
-- What the 09:00 auto-send did, per team per day (subject_key = 'team') and per player (subject_key = player id):
-- sent, skipped with a reason, or failed. A check-in rebuild of the automatic session stamps the player's row.
-- Descriptive only: it never touches the readiness colour or Today's session.
--
-- Access: written only by the server (service role: the cron and the check-in route). The browser may only READ
-- its own team's rows (coaches of the team and admins), through can_read_team_coach_prefs (20261114170000).

create table if not exists public.strength_send_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  send_date date not null,
  -- 'team' for the team's run, else the player's id (text, so one plain unique key covers both).
  subject_key text not null,
  player_id uuid references public.players(id) on delete cascade,
  -- team: 'sent' = the run happened, 'not_sent' = the whole team was skipped (reason says why).
  -- player: 'sent' | 'skipped' | 'failed'.
  status text not null check (status in ('sent', 'skipped', 'failed', 'not_sent')),
  -- team: no_week_plan | off_day. player skipped: already_sent | injured | no_session | standard_no_programme;
  -- player sent: null or custom_programme. failed: a short error text.
  reason text,
  -- The check-in colour the session was built with (null = before any check-in).
  readiness_level text check (readiness_level in ('GREEN', 'YELLOW', 'RED')),
  -- Set when the player's check-in rebuilt the automatic session.
  rebuilt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint strength_send_log_subject check (
    (subject_key = 'team' and player_id is null) or (subject_key <> 'team' and player_id is not null and subject_key = player_id::text)
  ),
  unique (team_id, send_date, subject_key)
);

create index if not exists strength_send_log_team_date on public.strength_send_log (team_id, send_date desc);

revoke all on public.strength_send_log from public, anon, authenticated;
grant select on public.strength_send_log to authenticated;
grant select, insert, update, delete on public.strength_send_log to service_role;

alter table public.strength_send_log enable row level security;

drop policy if exists strength_send_log_read on public.strength_send_log;
create policy strength_send_log_read on public.strength_send_log
  for select to authenticated
  using (public.can_read_team_coach_prefs(team_id));
