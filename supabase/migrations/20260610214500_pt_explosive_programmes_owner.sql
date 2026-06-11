-- Per-trainer ownership for explosive programmes. NULL = shared system
-- template (visible to every trainer); a non-null owner_user_id makes the
-- programme private to that trainer. Helgi's custom Contrast / French Contrast
-- variants are tagged to him so they don't appear for other trainers.
ALTER TABLE pt_explosive_programmes
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pt_explosive_programmes_owner
  ON pt_explosive_programmes (owner_user_id);

UPDATE pt_explosive_programmes
   SET owner_user_id = '60b93b68-94fa-43a9-bdab-78b51056a7fb'
 WHERE programme_key IN (
   'starter_french_contrast_8w_b',
   'starter_french_contrast_8w_c',
   'starter_contrast_pap_8w_squat',
   'starter_contrast_pap_8w_hinge'
 );
