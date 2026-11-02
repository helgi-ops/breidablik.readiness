-- Corrective-specific exercises (not previously in exercise_library) added WITH
-- demo videos so the PT corrective feature can show them. Owned by the PT
-- practice (owner_team_id) so they only appear in that practice's strength
-- picker; the corrective autocomplete + video-enrichment don't filter by owner,
-- so the videos reach every corrective surface. exercise_type must be
-- strength|endurance (CHECK), so 'strength' + a valid category.
-- Video URLs are sourced demos (reputable YouTube) — spot-checkable/editable via
-- the exercise-library management UI. See src/lib/trainer/correctiveFromInjury.ts
-- CORRECTIVE_SLUG_TO_LIBRARY (maps each corrective slug to the row name below).
insert into public.exercise_library
  (name, name_is, exercise_type, category, muscle_groups, description, description_is, video_url, sport, owner_team_id)
select v.name, v.name_is, 'strength', v.cat, v.mg, v.descr, v.descr_is, v.vid, 'football',
       '1aaecc06-e675-4cb2-a903-e6500cc67ce8'::uuid
from (values
  ('Clamshell (banded)', 'Skel (teygja)', 'isolation', ARRAY['gluteus medius'], 'Heels together, don''t rock the pelvis.', 'Hælar saman, ekki velta mjaðmagrind.', 'https://www.youtube.com/watch?v=xfQ4dx6QAdw'),
  ('Side-lying hip abduction', 'Mjaðma-fráfærsla á hlið', 'isolation', ARRAY['gluteus medius'], 'Lead with the heel, slight external rotation.', 'Leiddu með hælnum, örlítill útsnúningur.', 'https://www.youtube.com/watch?v=FL2NDkNSZh0'),
  ('Standing hip abduction, band at the ankle', 'Mjaðma-fráfærsla standandi, teygja við ökkla', 'isolation', ARRAY['gluteus medius'], 'Stand tall on the stance leg, control the return.', 'Stattu hátt á standfæti, stýrðu til baka.', 'https://www.youtube.com/watch?v=cvXYrZpsy6k'),
  ('Quadruped hip extension', 'Mjaðma-rétta í fjórfætling', 'isolation', ARRAY['gluteus maximus'], 'Heel to ceiling, ribs down, no low-back arch.', 'Hæll í loft, rifbein niður, ekki mjóbaks-sveigja.', 'https://www.youtube.com/watch?v=7XhlIUdaGrI'),
  ('Half-kneeling hip-flexor stretch', 'Mjaðma-beygju teygja í hálf-kné', 'isolation', ARRAY['hip flexors'], 'Tuck the pelvis, squeeze the back glute.', 'Halla mjaðmagrind, kreistu aftari rasskinn.', 'https://www.youtube.com/watch?v=F55tzqJggAY'),
  ('Standing calf stretch (gastroc)', 'Kálfateygja standandi (gastroc)', 'isolation', ARRAY['gastrocnemius'], 'Back knee straight, heel down.', 'Aftara hné beint, hæll niðri.', 'https://www.youtube.com/watch?v=a_R_wUS4qac'),
  ('Knee-to-wall ankle mobilisation (banded)', 'Hné-að-vegg ökkla-liðkun (teygja)', 'isolation', ARRAY['ankle'], 'Knee tracks over the 2nd toe, heel stays down.', 'Hné yfir 2. tá, hæll helst niðri.', 'https://www.youtube.com/watch?v=Y1IZXkdPPdw'),
  ('Hip internal-rotation mobilisation (90/90)', 'Mjaðma-innsnúnings liðkun (90/90)', 'isolation', ARRAY['hip'], 'Rotate from the hip, keep the pelvis and lumbar spine still.', 'Snúðu frá mjöðm, haltu mjaðmagrind og mjóbaki kyrru.', 'https://www.youtube.com/watch?v=0ZYqmhAbC7k'),
  ('Thoracic rotation (open-book / quadruped)', 'Brjósthryggjar-snúningur (open-book / fjórfætling)', 'isolation', ARRAY['thoracic spine'], 'Rotate through the mid-back, not the low back.', 'Snúðu gegnum mið-bak, ekki mjóbak.', 'https://www.youtube.com/watch?v=yfl4qZAN5g8'),
  ('Curl-up (McGill, endurance holds)', 'Curl-up (McGill, þol-hald)', 'core', ARRAY['rectus abdominis'], 'Hands under the low back, lift head/shoulders a few cm; short holds.', 'Hendur undir mjóbak, lyftu höfði/öxlum fáeina cm; stutt hald.', 'https://www.youtube.com/watch?v=MGCcxLUXpIY'),
  ('Side bridge (McGill, endurance)', 'Hliðar-brú (McGill, þol)', 'core', ARRAY['obliques','quadratus lumborum'], 'Straight line ankle-to-shoulder; hold and breathe.', 'Bein lína ökkli-öxl; haltu og andaðu.', 'https://www.youtube.com/watch?v=VAPN4CmUWqk'),
  ('Bird-dog (quadruped, anti-rotation)', 'Bird-dog (fjórfætling, and-snúningur)', 'core', ARRAY['multifidus','glutes'], 'Opposite arm/leg, ribs down, keep the pelvis level.', 'Gagnstæð hönd/fótur, rifbein niður, mjaðmagrind lárétt.', 'https://www.youtube.com/watch?v=ZdAHe9_HeEw'),
  ('Hip-hinge patterning (dowel)', 'Mjaðma-hinge mynstur (prik)', 'compound', ARRAY['hamstrings','glutes'], 'Dowel touches head, mid-back and sacrum; push the hips back, flat spine.', 'Prik snertir höfuð, mið-bak og spjaldbein; ýttu mjöðmum aftur, flatt bak.', 'https://www.youtube.com/watch?v=ctMrDzw8LYQ'),
  ('Side-lying hip adduction', 'Mjaðma-aðfærsla á hlið', 'isolation', ARRAY['adductors'], 'Bottom leg lifts to the top leg; slow and controlled.', 'Neðri fótur lyftist upp að efri fæti; hægt og stýrt.', 'https://www.youtube.com/watch?v=ha1V5hEhB_E'),
  ('Standing banded hip adduction', 'Mjaðma-aðfærsla standandi með teygju', 'isolation', ARRAY['adductors'], 'Pull the working leg across midline; keep the pelvis level.', 'Dragðu vinnufót yfir miðlínu; haltu mjaðmagrind láréttri.', 'https://www.youtube.com/watch?v=WMtrDM8HsX0'),
  ('Single-leg squat (to box)', 'Einfætt hnébeygja (á kassa)', 'compound', ARRAY['gluteus medius','quadriceps'], 'Sit back, keep the knee over the foot.', 'Settu þig aftur, haltu hné yfir fæti.', 'https://www.youtube.com/watch?v=3HCztPN3aSk'),
  ('Single-leg balance progression', 'Einfætt jafnvægis-stigmögnun', 'isolation', ARRAY['ankle','hip'], 'Quiet foot; progress to eyes-closed / perturbation / unstable surface.', 'Kyrr fótur; stigmagna með lokuð augu / truflun / óstöðugt undirlag.', 'https://www.youtube.com/watch?v=PNiCgb5mJW4'),
  ('Slow eccentric step-down', 'Hæg eccentric niðurstig', 'compound', ARRAY['quadriceps','glutes'], '3-second lower, keep the knee tracking over the foot.', '3 sek niður, haltu hné yfir fæti.', 'https://www.youtube.com/watch?v=Ig_Qo-GKjRc'),
  ('Foam-roll calf (gastroc/soleus)', 'Rúllun kálfa (gastroc/soleus)', 'isolation', ARRAY['gastrocnemius','soleus'], 'Cross the legs for more pressure; roll slowly.', 'Krossaðu fætur fyrir meiri þrýsting; rúllaðu hægt.', 'https://www.youtube.com/watch?v=nZZe9ai7Vvw'),
  ('Foam-roll TFL / IT band', 'Rúllun TFL / IT-band', 'isolation', ARRAY['tfl','it band'], 'Slow rolls, pause on tender spots.', 'Hægar rúllur, staldraðu á aumum blettum.', 'https://www.youtube.com/watch?v=m93PUWkOuTc'),
  ('Foam-roll adductors', 'Rúllun aðfærsluvöðva', 'isolation', ARRAY['adductors'], 'Inner thigh, roll slowly.', 'Innanvert læri, rúllaðu hægt.', 'https://www.youtube.com/watch?v=h1xQabdHdes'),
  ('Single-leg hops, stick the landing', 'Einfætt hopp, festu lendinguna', 'plyometric', ARRAY['reactive strength'], 'Hop and hold 2 s; quality over distance.', 'Hoppaðu og haltu 2 s; gæði fram yfir lengd.', 'https://www.youtube.com/watch?v=5g6ijVFSoeI')
) as v(name, name_is, cat, mg, descr, descr_is, vid)
where not exists (
  select 1 from public.exercise_library e
  where e.name = v.name and e.owner_team_id is not distinct from '1aaecc06-e675-4cb2-a903-e6500cc67ce8'::uuid
);
