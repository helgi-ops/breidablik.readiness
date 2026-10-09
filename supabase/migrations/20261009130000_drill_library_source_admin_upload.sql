-- Allow an admin to seed another coach's drill library.
-- Adds 'admin_upload' to drill_library.source so the new /api/admin/drill-library
-- route can stamp provenance on drills an ADMIN creates on a coach's behalf.
-- (Existing sources: seed, coach, catapult, public_template, ai_video_draft.)

ALTER TABLE public.drill_library DROP CONSTRAINT IF EXISTS drill_library_source_check;

ALTER TABLE public.drill_library ADD CONSTRAINT drill_library_source_check
  CHECK (source = ANY (ARRAY['seed','coach','catapult','public_template','ai_video_draft','admin_upload']));
