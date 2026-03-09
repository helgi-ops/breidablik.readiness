-- Native Web Push subscriptions (replaces FCM token storage)

create table if not exists public.player_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  is_active boolean not null default true,
  last_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_push_subscriptions_player_id_idx
  on public.player_push_subscriptions (player_id);

create index if not exists player_push_subscriptions_active_idx
  on public.player_push_subscriptions (is_active);

create index if not exists player_push_subscriptions_player_active_idx
  on public.player_push_subscriptions (player_id, is_active, updated_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at_timestamp' and n.nspname = 'public'
  ) then
    execute $fn$
      create function public.set_updated_at_timestamp()
      returns trigger
      language plpgsql
      as $$
      begin
        new.updated_at = now();
        return new;
      end;
      $$;
    $fn$;
  end if;
end $$;

drop trigger if exists trg_player_push_subscriptions_set_updated_at on public.player_push_subscriptions;
create trigger trg_player_push_subscriptions_set_updated_at
before update on public.player_push_subscriptions
for each row
execute procedure public.set_updated_at_timestamp();
