-- Coach-facing proactive delivery — opt-in preferences + a send-dedupe log.
-- Addition 1 of docs/tasks/proactive-delivery-brief.md (the morning digest).
-- There is a player_notification_preferences table but no coach equivalent; a
-- coach digest/alert must be opt-in (default OFF) exactly like the player nudge.
-- Descriptive delivery only — this never reads or writes the readiness colour.

-- ── Preferences: one row per coach (profile_id). Default OFF everywhere. ──────
create table if not exists public.coach_notification_preferences (
  profile_id       uuid primary key references public.profiles(id) on delete cascade,
  team_id          uuid references public.teams(id) on delete set null,  -- convenience; send-time source of truth is profiles.team_id
  morning_digest   boolean not null default false,
  threshold_alerts boolean not null default false,  -- Addition 2 (not yet wired)
  weekly_report    boolean not null default false,  -- Addition 3 (not yet wired)
  channel          text not null default 'push' check (channel in ('push', 'email', 'both')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

grant select, insert, update, delete on public.coach_notification_preferences to authenticated;
grant select, insert, update, delete on public.coach_notification_preferences to service_role;

alter table public.coach_notification_preferences enable row level security;

-- A coach reads/writes ONLY their own row.
drop policy if exists coach_notif_prefs_self on public.coach_notification_preferences;
create policy coach_notif_prefs_self on public.coach_notification_preferences
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ── Send-dedupe log: one row per successful delivery. The unique key is the
-- guarantee against the cron's ±30-min double-fire double-sending. ───────────
create table if not exists public.coach_notification_log (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  team_id             uuid,
  kind                text not null,           -- 'digest' | 'alert' | 'weekly'
  signal_key          text not null,           -- digest: the date; alert: engine:player_id
  channel             text,                    -- 'push' | 'email'
  as_of               date not null,
  provider_message_id text,
  sent_at             timestamptz not null default now()
);

-- One delivery per (coach, kind, signal_key, day). Insert-if-absent = the dedupe.
create unique index if not exists coach_notif_log_unique
  on public.coach_notification_log (profile_id, kind, signal_key, as_of);
create index if not exists coach_notif_log_team_asof_idx
  on public.coach_notification_log (team_id, as_of desc);

grant select, insert on public.coach_notification_log to authenticated;
grant select, insert, update, delete on public.coach_notification_log to service_role;

alter table public.coach_notification_log enable row level security;

drop policy if exists coach_notif_log_self_read on public.coach_notification_log;
create policy coach_notif_log_self_read on public.coach_notification_log
  for select to authenticated
  using (profile_id = auth.uid());
-- Writes happen via the service_role cron (bypasses RLS); no insert policy needed.

-- ── Coach email resolver (analogous to get_active_players_with_email, which is
-- player-only). Emails live in auth.users, not profiles. ─────────────────────
create or replace function public.get_team_coaches_with_email(p_team_id uuid)
returns table (
  profile_id uuid,
  team_id    uuid,
  role       text,
  email      text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    p.id as profile_id,
    p.team_id,
    lower(coalesce(p.role, '')) as role,
    nullif(trim(u.email), '') as email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.team_id = p_team_id
    and lower(coalesce(p.role, '')) in ('coach', 'admin', 'staff')
    and nullif(trim(u.email), '') is not null;
$$;

revoke all on function public.get_team_coaches_with_email(uuid) from public;
grant execute on function public.get_team_coaches_with_email(uuid) to service_role;
