-- Team Match Insight — add the Wyscout "Passing" and "Attacking" presets to
-- team_match_stats. Descriptive football context only; never feeds the readiness
-- colour. Keeps the existing unique key (team_id, match_date, is_opponent) and the
-- idempotent upsert unchanged. Two jsonb blobs keep each preset row verbatim (so
-- future metrics need no migration) + a short set of promoted numeric columns the
-- Wins-vs-losses / correlation panels compare on. All nullable (a coach may upload
-- only General). Applied via mcp apply_migration; committed here per the repo rule.

alter table public.team_match_stats
  -- Passing preset
  add column if not exists forward_passes numeric,
  add column if not exists forward_pass_acc_pct numeric,
  add column if not exists passes_final_third numeric,
  add column if not exists passes_final_third_acc_pct numeric,
  add column if not exists passes_penalty_area numeric,
  add column if not exists passes_penalty_area_acc_pct numeric,
  add column if not exists progressive_passes numeric,
  add column if not exists crosses numeric,
  add column if not exists cross_acc_pct numeric,
  add column if not exists smart_passes numeric,
  add column if not exists smart_pass_acc_pct numeric,
  add column if not exists passing jsonb,
  -- Attacking preset
  add column if not exists touches_in_box numeric,
  add column if not exists positional_attacks numeric,
  add column if not exists counterattacks numeric,
  add column if not exists offensive_duels_won_pct numeric,
  add column if not exists attacking jsonb;
