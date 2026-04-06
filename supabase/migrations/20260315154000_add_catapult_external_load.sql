create table if not exists public.catapult_athlete_map (
  catapult_athlete_id text primary key,
  micropulse_player_id uuid not null references public.players(id) on delete cascade,
  catapult_athlete_name text null,
  catapult_email text null,
  match_method text not null default 'manual',
  confidence numeric(5,2) not null default 1.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists catapult_athlete_map_player_idx
  on public.catapult_athlete_map (micropulse_player_id, catapult_athlete_id);

create table if not exists public.player_external_load_daily (
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid null references public.teams(id) on delete set null,
  date date not null,
  total_distance numeric(10,2) null,
  high_speed_distance numeric(10,2) null,
  sprint_distance numeric(10,2) null,
  accelerations integer null,
  decelerations integer null,
  player_load numeric(10,2) null,
  max_velocity numeric(10,2) null,
  metabolic_power numeric(10,2) null,
  explosive_distance numeric(10,2) null,
  source text not null default 'catapult',
  external_athlete_id text null,
  activity_count integer not null default 0,
  raw_payload_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, date, source)
);

create index if not exists player_external_load_daily_team_date_idx
  on public.player_external_load_daily (team_id, date);

create index if not exists player_external_load_daily_player_date_idx
  on public.player_external_load_daily (player_id, date desc);

create table if not exists public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  scope text not null,
  status text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at_timestamp' and n.nspname = 'public'
  ) then
    execute $fn$
      create function public.set_updated_at_timestamp()
      returns trigger
      language plpgsql
      as $inner$
      begin
        new.updated_at = now();
        return new;
      end;
      $inner$;
    $fn$;
  end if;
end
$$;

drop trigger if exists trg_catapult_athlete_map_set_updated_at on public.catapult_athlete_map;
create trigger trg_catapult_athlete_map_set_updated_at
before update on public.catapult_athlete_map
for each row
execute procedure public.set_updated_at_timestamp();

drop trigger if exists trg_player_external_load_daily_set_updated_at on public.player_external_load_daily;
create trigger trg_player_external_load_daily_set_updated_at
before update on public.player_external_load_daily
for each row
execute procedure public.set_updated_at_timestamp();

alter table public.catapult_athlete_map enable row level security;
alter table public.player_external_load_daily enable row level security;
alter table public.integration_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_external_load_daily' and policyname = 'player_external_load_daily_player_select_own'
  ) then
    create policy player_external_load_daily_player_select_own
      on public.player_external_load_daily
      for select
      using (
        exists (
          select 1
          from public.players p
          where p.id = player_external_load_daily.player_id
            and p.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and pr.player_id = player_external_load_daily.player_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_external_load_daily' and policyname = 'player_external_load_daily_coach_read_team'
  ) then
    create policy player_external_load_daily_coach_read_team
      on public.player_external_load_daily
      for select
      using (
        exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and lower(coalesce(pr.role, '')) in ('coach', 'admin', 'staff')
            and (
              lower(coalesce(pr.role, '')) = 'admin'
              or pr.team_id = player_external_load_daily.team_id
            )
        )
      );
  end if;
end
$$;
