-- Tag each coach-sent Today override by which entry point created it, so coach surfaces can name what
-- is on a given date and the send flows can warn about collisions. Nullable: legacy rows stay generic.
alter table public.player_today_strength_override
  add column if not exists origin text;

comment on column public.player_today_strength_override.origin is
  'Entry point that wrote this coach-sent override: session | bulk | block | corrective | auto (null = legacy/unknown). source stays coach_sent.';
