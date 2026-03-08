-- MicroPulse: PWA push reminder tables

create table if not exists public.player_push_tokens (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  fcm_token text not null,
  device_label text null,
  platform text null,
  user_agent text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists player_push_tokens_fcm_token_uniq
  on public.player_push_tokens (fcm_token);

create index if not exists player_push_tokens_player_id_idx
  on public.player_push_tokens (player_id);

create index if not exists player_push_tokens_active_idx
  on public.player_push_tokens (is_active, player_id);

create table if not exists public.checkin_notification_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  date_key date not null,
  reminder_type text not null check (reminder_type in ('first', 'second', 'manual')),
  sent_at timestamptz not null default now(),
  status text not null,
  provider_message_id text null
);

create unique index if not exists checkin_notification_log_unique_send
  on public.checkin_notification_log (player_id, date_key, reminder_type);

create index if not exists checkin_notification_log_date_type_idx
  on public.checkin_notification_log (date_key, reminder_type);

create index if not exists checkin_notification_log_status_idx
  on public.checkin_notification_log (status, sent_at desc);

-- Optional: update timestamps automatically on player_push_tokens
create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_player_push_tokens_updated_at on public.player_push_tokens;
create trigger trg_player_push_tokens_updated_at
before update on public.player_push_tokens
for each row execute function public.set_row_updated_at();
