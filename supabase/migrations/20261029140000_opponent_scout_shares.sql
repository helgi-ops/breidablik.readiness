-- Coach → player scouting briefings: a coach "sends" an opponent scout to the team's players, who
-- read it in the player app (key aspects + the tagged clips). A snapshot of the report's plain-language
-- aspects is stored; clips are read live from opponent_player_clips by opponent_key at read time (so
-- signed URLs stay fresh). Informational/descriptive — never a readiness verdict or a training action.
create table if not exists opponent_scout_shares (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  opponent      text not null,
  opponent_key  text not null,              -- foldName(opponent), to join the tagged clips
  title         text,
  snapshot      jsonb not null default '{}'::jsonb,  -- headline, how-they-play, key players, defend, attack
  created_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists opp_scout_shares_team on opponent_scout_shares(team_id, created_at desc);
