-- AI-narrated scouting report per FIBA game side (own / opponent). Rules assemble the
-- facts (FIBA box + shot context + assist network + shooting tendencies, plus the team's
-- InStat play-types/zones when scouting our own side); the model only phrases them and
-- cites the numbers. AI is labelled as AI. Descriptive — never touches readiness.

alter table public.basketball_fiba_games
  add column if not exists own_ai jsonb,
  add column if not exists opp_ai jsonb,
  add column if not exists ai_model text,
  add column if not exists ai_generated_at timestamptz;
