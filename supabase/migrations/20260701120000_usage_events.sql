-- Usage analytics: one row per tracked event (page view / feature interaction).
-- Powers the admin "what's used / what's dead" view so cut/keep decisions are
-- data-driven instead of guesses (product-audit P3).
--
-- Privacy: paths are normalised (player/team ids stripped to :id) before insert,
-- so this table stores SURFACE usage, not who-looked-at-which-player.
create table if not exists public.usage_events (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id     uuid,
  team_id     uuid,
  role        text,
  path        text not null,                       -- normalised route, e.g. /coach/decel-intelligence
  event_type  text not null default 'page_view',   -- page_view | feature
  feature     text,                                -- optional specific feature key
  meta        jsonb
);

create index if not exists usage_events_occurred_idx on public.usage_events (occurred_at desc);
create index if not exists usage_events_path_idx     on public.usage_events (path);
create index if not exists usage_events_team_idx     on public.usage_events (team_id);

-- Defence in depth: no client (anon/authenticated) access. All reads/writes go
-- through server routes using the service-role client, which bypasses RLS.
alter table public.usage_events enable row level security;
