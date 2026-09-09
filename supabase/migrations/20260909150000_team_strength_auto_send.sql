-- Opt-in: automatically send each active player their strength session every
-- morning (a scheduled cron), in the team's chosen mode (teams.strength_send_mode),
-- with no coach click. OFF by default — a deliberate per-team choice. The review
-- gate is preserved: the coach opted in, can still manually re-send / override, and
-- the auto-send never overwrites a session the coach already sent that day. Only
-- fires on strength days (buildStrengthSession returns null otherwise). Descriptive
-- — never the readiness colour.
alter table teams
  add column if not exists strength_auto_send boolean not null default false;
