-- Check-in push reminders: token storage + dedupe-safe send log
-- Run in Supabase SQL editor as a privileged role.

create extension if not exists pgcrypto;

create table if not exists public.player_push_tokens (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  fcm_token text not null,
  device_label text null,
  platform text null,
  user_agent text null,
  is_active boolean not null default true,
  last_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists player_push_tokens_fcm_token_uq
  on public.player_push_tokens (fcm_token);

create index if not exists player_push_tokens_player_id_idx
  on public.player_push_tokens (player_id);

create index if not exists player_push_tokens_active_player_idx
  on public.player_push_tokens (player_id, is_active, updated_at desc);

create table if not exists public.checkin_notification_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  date_key date not null,
  reminder_type text not null check (reminder_type in ('first', 'second', 'manual')),
  scheduled_slot text not null,
  sent_at timestamptz not null default now(),
  status text not null,
  provider_message_id text null,
  error_message text null,
  token_id uuid null references public.player_push_tokens(id) on delete set null
);

-- Dedupe guard (safe under concurrent cron/manual runs)
create unique index if not exists checkin_notification_log_dedupe_uq
  on public.checkin_notification_log (player_id, date_key, reminder_type, scheduled_slot);

create index if not exists checkin_notification_log_date_idx
  on public.checkin_notification_log (date_key desc, sent_at desc);

create index if not exists checkin_notification_log_status_idx
  on public.checkin_notification_log (status, sent_at desc);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_player_push_tokens_set_updated_at on public.player_push_tokens;
create trigger trg_player_push_tokens_set_updated_at
before update on public.player_push_tokens
for each row
execute procedure public.set_updated_at_timestamp();

alter table public.player_push_tokens enable row level security;
alter table public.checkin_notification_log enable row level security;

-- Players can read/update only their own tokens through authenticated routes.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'player_push_tokens'
      and policyname = 'player_push_tokens_owner_select'
  ) then
    create policy player_push_tokens_owner_select
      on public.player_push_tokens
      for select
      using (
        exists (
          select 1 from public.players p
          where p.id = player_push_tokens.player_id
            and p.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'player_push_tokens'
      and policyname = 'player_push_tokens_owner_update'
  ) then
    create policy player_push_tokens_owner_update
      on public.player_push_tokens
      for update
      using (
        exists (
          select 1 from public.players p
          where p.id = player_push_tokens.player_id
            and p.user_id = auth.uid()
        )
      );
  end if;
end
$$;
