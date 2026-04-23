-- Push subscriptions for coaches/admins. Mirrors player_push_subscriptions
-- but is keyed on the auth user id (profile_id) instead of player_id,
-- because coaches do not have a row in the players table.

create table if not exists public.coach_push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null,                            -- = auth.uid() of the coach/admin
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  user_agent    text null,
  is_active     boolean not null default true,
  last_seen_at  timestamptz null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists coach_push_subscriptions_profile_idx
  on public.coach_push_subscriptions (profile_id);
create index if not exists coach_push_subscriptions_active_idx
  on public.coach_push_subscriptions (is_active);

alter table public.coach_push_subscriptions enable row level security;

create policy coach_push_subs_self_read
  on public.coach_push_subscriptions
  for select to authenticated
  using (profile_id = auth.uid());
