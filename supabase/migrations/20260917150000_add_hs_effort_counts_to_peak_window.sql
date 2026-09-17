-- Per-period HIGH-SPEED effort counts (HS Efforts, Sprint Efforts) from the CTR.
-- These land on the per-minute period rows (window_label "Fyrri halfleikur - 15-16", …)
-- so the peak-context fusion can build a minute-by-minute HSR timeline and align each
-- minute to the tactical events. Nullable; only populated for CTR imports that carry
-- the effort-count columns. Descriptive load context — never the readiness colour.
alter table player_peak_window
  add column if not exists hs_efforts integer,
  add column if not exists sprint_efforts integer;

comment on column player_peak_window.hs_efforts is 'CTR "HS Efforts" count for this period/minute-bin (high-speed running efforts). Descriptive.';
comment on column player_peak_window.sprint_efforts is 'CTR "Sprint Efforts" count for this period/minute-bin. Descriptive.';
