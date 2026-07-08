-- Per-type, opt-IN player notification preferences (off by default).
-- Powers the gentle morning "outlook" + evening "recap" nudges. A player only
-- receives a nudge type when they have explicitly enabled it — safest default,
-- especially for minors. Absence of a row = OFF.
create table if not exists public.player_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  notification_type text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (player_id, notification_type)
);

alter table public.player_notification_preferences enable row level security;

-- A player can read/write only their own preferences.
drop policy if exists player_notif_prefs_rw on public.player_notification_preferences;
create policy player_notif_prefs_rw on public.player_notification_preferences
  for all
  using (player_id in (select id from public.players where user_id = auth.uid()))
  with check (player_id in (select id from public.players where user_id = auth.uid()));

create index if not exists player_notif_prefs_type_enabled_idx
  on public.player_notification_preferences (notification_type, enabled);
