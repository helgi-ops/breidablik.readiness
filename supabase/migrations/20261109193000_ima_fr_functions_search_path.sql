-- Pin search_path on the IMA Free Running edge-detection functions (Supabase advisor:
-- function_search_path_mutable). They only reference public.* objects and pg_catalog built-ins.
alter function public.ima_fr_presets() set search_path = public, pg_temp;
alter function public.ima_fr_bounds_fit(numeric[], numeric[], numeric[]) set search_path = public, pg_temp;
alter function public.ima_fr_has_evidence(numeric[], numeric[]) set search_path = public, pg_temp;
alter function public.ima_fr_fill_tiers() set search_path = public, pg_temp;
