-- One-time backfill: Wyscout "Team → Stats" exports have NO "Goals" column, only
-- "Goal kicks". The parser was matching "Goal kicks" as goals, so every
-- team_match_stats row's goals held the goal-kick count, not the score (e.g.
-- Breidablik 3-4 Fram stored as 3-7). The real score lives only in the Match
-- label ("Breidablik - Fram 3:4"). Re-derive goals from that label per team.
-- Idempotent: a no-op on rows whose goals already match the label. The parser
-- fix (wyscoutTeamStats.ts) stops future imports from re-corrupting.
with parsed as (
  select id,
    lower(trim(raw->>'Team')) as team,
    regexp_match(raw->>'Match', '^(.*?)\s+[-–]\s+(.*?)\s+(\d+)\s*:\s*(\d+)\s*$') as dash,
    regexp_match(raw->>'Match', '^(.*?)\s+(\d+)\s*:\s*(\d+)\s+(\S.*?)$') as mid
  from public.team_match_stats
  where source = 'wyscout_team_stats_xlsx' and raw ? 'Match'
)
update public.team_match_stats t
set goals = coalesce(
  case when p.dash is not null then
    (case when p.team = lower(trim(p.dash[1])) then p.dash[3]::int
          when p.team = lower(trim(p.dash[2])) then p.dash[4]::int end) end,
  case when p.mid is not null then
    (case when p.team = lower(trim(p.mid[1])) then p.mid[2]::int
          when p.team = lower(trim(p.mid[4])) then p.mid[3]::int end) end
)
from parsed p
where t.id = p.id and (p.dash is not null or p.mid is not null);
