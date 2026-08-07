-- Let a scouted season be StatsBomb-sourced: tag the provider, capture the
-- StatsBomb League Average as the benchmark, and keep StatsBomb-only extras
-- (OBV, real set-piece for & against) that Wyscout doesn't have. Descriptive only.
alter table scout_team_season
  add column if not exists source text not null default 'wyscout',
  add column if not exists league_ref jsonb,
  add column if not exists sb_extras jsonb;

comment on column scout_team_season.source is 'Provider of the season metrics: wyscout | statsbomb. Shown in the UI; never silently mixed.';
comment on column scout_team_season.league_ref is 'StatsBomb League Average metrics (benchmark) captured at import; used as the league reference for statsbomb-sourced seasons.';
comment on column scout_team_season.sb_extras is 'StatsBomb-only extras (OBV for/against, set-piece xG/shots for/against, pressing) kept verbatim.';
