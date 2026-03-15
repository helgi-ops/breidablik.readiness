-- Email reminder log for readiness + post-training RPE with dedupe safety

create table if not exists public.email_reminder_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('readiness', 'rpe')),
  sent_for_date date not null,
  sent_at timestamptz not null default now(),
  delivery_channel text not null default 'email' check (delivery_channel in ('email')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  subject text,
  email_to text,
  provider_message_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists email_reminder_log_dedupe_idx
  on public.email_reminder_log (player_id, reminder_type, sent_for_date, delivery_channel);

create index if not exists email_reminder_log_date_idx
  on public.email_reminder_log (sent_for_date, reminder_type);

create index if not exists email_reminder_log_player_idx
  on public.email_reminder_log (player_id, sent_for_date desc);

create or replace function public.get_active_players_with_email(p_team_id uuid default null)
returns table (
  player_id uuid,
  team_id uuid,
  user_id uuid,
  full_name text,
  first_name text,
  email text,
  is_active boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    p.id as player_id,
    p.team_id,
    p.user_id,
    p.full_name,
    nullif(split_part(coalesce(p.full_name, ''), ' ', 1), '') as first_name,
    nullif(trim(u.email), '') as email,
    coalesce(p.is_active, true) as is_active
  from public.players p
  join auth.users u on u.id = p.user_id
  where coalesce(p.is_active, true) = true
    and p.user_id is not null
    and nullif(trim(u.email), '') is not null
    and (p_team_id is null or p.team_id = p_team_id);
$$;

revoke all on function public.get_active_players_with_email(uuid) from public;
grant execute on function public.get_active_players_with_email(uuid) to service_role;
