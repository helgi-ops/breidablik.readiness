-- RPE reminder compliance logging + dedupe safety

create extension if not exists pgcrypto;

create table if not exists public.rpe_notification_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid null references public.teams(id) on delete set null,
  reminder_date date not null,
  scheduled_slot text not null check (char_length(scheduled_slot) between 4 and 24),
  channel text not null default 'push' check (channel in ('push')),
  status text not null default 'sent' check (status in ('sent', 'skipped', 'failed')),
  notification_type text not null default 'session_rpe_missing',
  metadata jsonb not null default '{}'::jsonb,
  provider_message_id text null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists rpe_notification_log_dedupe_uq
  on public.rpe_notification_log (player_id, reminder_date, scheduled_slot, notification_type);

create index if not exists rpe_notification_log_player_id_idx
  on public.rpe_notification_log (player_id);

create index if not exists rpe_notification_log_team_id_idx
  on public.rpe_notification_log (team_id);

create index if not exists rpe_notification_log_reminder_date_idx
  on public.rpe_notification_log (reminder_date);

create index if not exists rpe_notification_log_team_date_idx
  on public.rpe_notification_log (team_id, reminder_date);

create or replace view public.rpe_compliance_daily as
select
  e.player_id,
  e.team_id,
  e.session_date,
  (count(*) > 0) as has_submission,
  count(*)::int as total_entries,
  coalesce(sum(e.session_load), 0)::int as total_load,
  max(e.submitted_at) as latest_submission_at
from public.session_rpe_entries e
group by e.player_id, e.team_id, e.session_date;

alter table public.rpe_notification_log enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rpe_notification_log'
      and policyname = 'rpe_notification_log_server_only_select'
  ) then
    create policy rpe_notification_log_server_only_select
      on public.rpe_notification_log
      for select
      using (false);
  end if;
end
$$;

