-- Coach-curated free-text for the KSÍ (federation call-up) report: the injury/factors
-- note and the individual strength/prevention-programme note per player. Pre-filled from
-- player_injuries in the report, but the coach edits + confirms before sending — medical
-- info leaving the club must be curated by a coach. Server-route mediated (service role);
-- RLS on with no policies = no direct anon/authenticated access.
create table if not exists player_ksi_notes (
  player_id    uuid primary key references players(id) on delete cascade,
  team_id      uuid not null,
  injury_note  text,
  program_note text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
alter table player_ksi_notes enable row level security;
comment on table player_ksi_notes is 'Coach-curated injury/factors + individual strength-programme notes for the KSÍ call-up report. Coach reviews before sending; never auto-sent.';
