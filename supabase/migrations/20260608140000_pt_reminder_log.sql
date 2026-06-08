-- De-dupe / audit guard for PT push reminders, mirroring checkin_notification_log.
-- One row reserves a (client, date, kind) send so the cron can fire on a wide
-- tolerance window without double-notifying. Unique constraint = the lock.
create table if not exists public.pt_reminder_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  reminder_date date not null,
  kind text not null,              -- 'session' | 'weekly' | ...
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  unique (player_id, reminder_date, kind)
);

create index if not exists pt_reminder_log_player_idx on public.pt_reminder_log (player_id, reminder_date);

comment on table public.pt_reminder_log is
  'De-dupe + audit log for PT push reminders (session/weekly). Unique(player_id, reminder_date, kind) prevents double-sends across the cron tolerance window.';

alter table public.pt_reminder_log enable row level security;
