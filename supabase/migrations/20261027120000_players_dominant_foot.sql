-- Per-athlete dominant (preferred) foot, for footedness context on the CoD-asymmetry signal
-- (Decel Intelligence card + injury early-warning / robustnessWatch). Advisory football data like
-- position — NEVER a readiness signal. Nullable; NULL = not set (the card then shows Bishop L/R tiers
-- without the footedness line). Coach-set; pre-filled from StatsBomb "preferred foot" on squad import
-- only when still NULL (never overwrites a coach's choice).
alter table public.players add column if not exists dominant_foot text;

comment on column public.players.dominant_foot is 'Dominant/preferred foot: left | right | both | NULL (not set). Advisory football data for footedness context on CoD asymmetry (Havanecz 2026 plant-limb preference); never a readiness signal. Coach-set, pre-filled from StatsBomb preferred foot when NULL.';
