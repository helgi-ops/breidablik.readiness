-- Re-detect the few low-evidence Free Running rows (1-3 runs) that the season re-sync of 10 Nov 2026 labelled
-- with the legacy edges. They borrow edges from the same player's nearest 'detected' row, and the sync ran
-- day by day, so at that moment the neighbour day was not yet re-synced and still read legacy. Now every
-- neighbour is on the new edges. Long-run numbers of these rows do not change (no run of 12-24 s in them);
-- only the label does. Scoped to Breiðablik rows re-synced on 10 Nov that still carry the legacy edges.

update public.player_external_load_daily d
   set ima_fr_band_bounds = null
  from public.players p
 where p.id = d.player_id
   and p.team_id = '94b52a06-0b83-48da-8664-639ec3486a0c'
   and d.source = 'catapult'
   and d.date between date '2026-06-01' and date '2026-10-24'
   and d.updated_at >= timestamptz '2026-11-10 11:00:00+00'
   and d.ima_fr_bounds_source in ('player', 'config')
   and d.ima_fr_band_bounds[2] = 8;
