-- Squad split into named training teams/groups for a built pitch session.
--
-- The coach divides the training squad into named teams ("Lið A" / "Lið B", bib
-- colours, possession units …) and every player sees which team they're in on
-- their app. Same session for everyone — the groups are a labelled split, not
-- different content.
--
-- `groups` shape: [{ "id": "<slug>", "name": "Lið A", "player_ids": ["<uuid>", …] }]
-- `recipient_player_ids` (from the prior migration) stays as the flat delivery
-- key = the union of every group's players; it drives the RLS read + feed filter.
-- Null groups / null recipients = whole team, no split (unchanged default).

alter table public.saved_sessions
  add column if not exists groups jsonb null;

comment on column public.saved_sessions.groups is
  'Optional squad split into named teams for this session: [{id,name,player_ids:[players.id]}]. Players see their own team. recipient_player_ids is kept as the union (delivery/RLS key). Null = whole team, no split.';
