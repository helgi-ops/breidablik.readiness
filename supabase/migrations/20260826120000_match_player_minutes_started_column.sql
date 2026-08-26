-- Explicit coach-entered "started the match" flag on the canonical minutes table.
-- NULL = not specified (fall back to the minutes threshold); true = starting XI; false = came on / DNP.
alter table match_player_minutes add column if not exists started boolean;
comment on column match_player_minutes.started is
  'Coach-entered: did this player start the match (starting XI)? NULL falls back to the minutes threshold. Set on the Match minutes page.';
