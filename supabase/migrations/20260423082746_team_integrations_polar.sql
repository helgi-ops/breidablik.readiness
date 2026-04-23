-- Team-level integrations (one OAuth per club, shared across all athletes on the team).
-- Polar Team Pro and Hudl Sportscode use this pattern.
-- Whoop and similar consumer wearables stay on athlete_integrations.

create table if not exists public.team_integrations (
  id                         uuid primary key default gen_random_uuid(),
  team_id                    uuid not null,
  provider                   text not null check (provider in ('polar', 'hudl')),
  status                     text not null default 'pending'
                              check (status in ('pending', 'active', 'error', 'revoked')),
  external_team_id           text null,
  access_token               text null,
  refresh_token              text null,
  token_type                 text null,
  scopes                     text[] null,
  access_token_expires_at    timestamptz null,
  last_synced_at             timestamptz null,
  last_sync_status           text null check (last_sync_status in ('success', 'error', 'never')),
  last_sync_error            text null,
  connected_by_user_id       uuid null,
  provider_metadata          jsonb null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (team_id, provider)
);

create index if not exists team_integrations_team_idx
  on public.team_integrations (team_id);
create index if not exists team_integrations_status_idx
  on public.team_integrations (status);
create index if not exists team_integrations_provider_idx
  on public.team_integrations (provider);

-- RLS: coaches can read/write their own team's integration rows.
-- Service-role bypasses RLS so the API routes (which use service key) are unaffected.
alter table public.team_integrations enable row level security;

create policy "coaches can read own team integrations"
  on public.team_integrations
  for select
  to authenticated
  using (
    team_id in (
      select team_id from public.coach_teams where coach_id = auth.uid()
    )
    or team_id = (select team_id from public.profiles where id = auth.uid())
  );

-- Writes go through service-role API routes, not direct client writes.
-- No insert/update/delete policies for authenticated role by design.
