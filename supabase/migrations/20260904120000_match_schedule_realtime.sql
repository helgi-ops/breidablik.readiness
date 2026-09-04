-- Add match_schedule to the realtime publication so open planner tabs (Meso / Macro / Micro / Fixtures)
-- live-sync when a fixture is added, moved, or removed. RLS still scopes delivered rows to the coach's team.
alter publication supabase_realtime add table public.match_schedule;
