-- One active wearable source per player (Terra double-ingest guardrail).
--
-- A player's recovery/sleep/HRV feed must come from ONE provider at a time, so two
-- sources (e.g. Terra-Whoop + a legacy direct provider) never double-feed the same
-- player. `wearable_connections` already has UNIQUE(profile_id, provider) but that
-- still allowed two DIFFERENT providers active at once. This partial unique index
-- enforces at most one active connection per profile.
--
-- Application code (the Terra `auth` webhook and the OAuth callback) deactivates
-- any other active provider for the profile before activating a new one, so this
-- index is a backstop, never the primary path. (wearable_connections currently has
-- zero rows, so adding it is safe.)
--
-- NOTE: the wearable_connections / wearable_sleep_data / wearable_daily_data tables
-- were created out-of-repo (no prior migration); this only adds the index.

create unique index if not exists wearable_connections_one_active_per_profile
  on public.wearable_connections (profile_id)
  where is_active;
