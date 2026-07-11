-- Attach demonstration videos to the 37 contrast / french-contrast exercises.
-- Coach-reviewed YouTube demo links written into exercise_library.video_url.
-- Keyed by exact id. Idempotent. Applied 2026-06-24 via execute_sql.
UPDATE exercise_library AS e
SET video_url = v.url, updated_at = now()
FROM (VALUES
 ('13279bd4-d1f5-4df8-ac2d-422d21677d96','https://www.youtube.com/watch?v=CWl0apMgshk'), -- Back Squat
 ('dacd6f95-7bf2-49c0-8d4f-a4a7f92e2795','https://www.youtube.com/watch?v=Pp8rHcFVIYg'), -- Bench Press
 ('3d08c2dd-8a8d-4830-b81b-cac1d2742035','https://www.youtube.com/watch?v=VPhhE6bBzZE'), -- Bulgarian Split Squat
 ('60536284-7bfa-440f-8eba-11b756afbf66','https://www.youtube.com/watch?v=brhRXlOhsAM'), -- Chin-Up
 ('39a023dd-e535-4f8c-8622-456cdda06ed0','https://www.youtube.com/watch?v=pBH7pKHn-dI'), -- Hip Thrust
 ('1c72f642-77b0-4a4d-8bbb-4c2f8b348da7','https://www.youtube.com/watch?v=N-eOdZH7TlU'), -- Kettlebell Swing
 ('6868a6cc-351e-4af4-a2fd-783760c78722','https://www.youtube.com/watch?v=R8jArZG2J6Q'), -- Lateral Lunge
 ('5c5d3f4d-c037-4959-8feb-8ecad1afa7cb','https://www.youtube.com/watch?v=a81SaIpjGlA'), -- Overhead Press
 ('e011b2e4-2c4c-402e-8504-6cee9931dc4f','https://www.youtube.com/watch?v=vw5Xmu5CIew'), -- Pull-Up
 ('98fd1fe1-b126-4221-953b-18093c8f40ba','https://www.youtube.com/watch?v=a8HQo8z20Uo'), -- Push Press
 ('0cfbd9c6-0305-47f9-9f68-1aa8cd137207','https://www.youtube.com/watch?v=yjqRj72AuaE'), -- Romanian Deadlift
 ('dd82bfe4-fa57-4bfb-a016-7dbf766ed9c8','https://www.youtube.com/watch?v=vYHqQmurSUk'), -- Single-Leg Hip Thrust
 ('7247942c-de28-4d75-aa52-bb47dfd7bc3d','https://www.youtube.com/watch?v=iS7atZhcRnw'), -- Single-Leg RDL
 ('453f0f6b-ab72-4b84-bd87-4e550dc8b159','https://www.youtube.com/watch?v=Zp7RG4jFScw'), -- Step-Up
 ('a0348938-ab5d-4100-a461-a8fa2f49770d','https://www.youtube.com/watch?v=VdTwE_pOKrg'), -- Trap Bar Deadlift
 ('107565cc-a246-4d61-89f8-032327312345','https://www.youtube.com/watch?v=vYfp2t4XgqQ'), -- Walking Lunge
 ('5b8439b5-5d72-480a-b201-57459b02bd27','https://www.youtube.com/watch?v=XEJUONiJ0KQ'), -- Mid-Thigh Pull
 ('5fa90af0-02ef-44d9-91a3-6cef4a8ff79b','https://www.youtube.com/watch?v=G1QygZ3Kd3w'), -- Snatch Pull
 ('97fc284d-26f3-42ad-ab04-f96bbc45f163','https://www.youtube.com/watch?v=K_rI3GQSRko'), -- Assisted Jump
 ('fe942188-3bde-40d0-afc8-207922cc18bd','https://www.youtube.com/watch?v=KjG5OajcfHc'), -- Assisted Plyo Push-Up
 ('893e4524-a048-4017-9112-13563126e9c8','https://www.youtube.com/watch?v=hpJkPIHGBcM'), -- Assisted Split Squat Jump
 ('eff81a40-43d7-4881-9fa1-52baa8ce42bc','https://www.youtube.com/watch?v=G-bxQY57mKc'), -- Box Jump
 ('ee5dfcbe-d028-42f8-ba25-9f330d8f83d4','https://www.youtube.com/watch?v=7Du1KbwCdUk'), -- Broad Jump
 ('a9b3f5e6-6f7a-4e6b-81b0-b34a67a6cee7','https://www.youtube.com/watch?v=U48gSsH3LIk'), -- DB Snatch
 ('2f75f111-3bb8-4c23-b953-b79807ef6d74','https://www.youtube.com/watch?v=FP9CqN_RYO8'), -- DB Split Squat Jump
 ('5fdead4e-f7a1-46ca-824d-d62daa6cba0e','https://www.youtube.com/watch?v=eA9ngSle-SY'), -- Drop Jump
 ('9a49ad63-ea68-45d6-89da-c917cd52f520','https://www.youtube.com/watch?v=u9LQluMCfic'), -- Medicine Ball Chest Pass
 ('7eb0480c-05dd-4676-a52a-c83f92122630','https://www.youtube.com/watch?v=NP2e1Szrj28'), -- Medicine Ball Rotational Throw
 ('3dc4eaa8-bfcd-4d0a-ab66-ea2350f02e36','https://www.youtube.com/watch?v=MH4gcTKQiEc'), -- Plyo Push-Up
 ('ba1e1c60-9c39-4957-8d83-9340c2a17f05','https://www.youtube.com/watch?v=UOprVyBZOUA'), -- Split Squat Jump
 ('14b6367d-e564-4040-8726-db678caf821c','https://www.youtube.com/watch?v=FfuHfASyqkg'), -- Sprint
 ('3be8a64a-196f-43d7-b8b2-a8f5f3c096bf','https://www.youtube.com/watch?v=lBIcQzr-cQs'), -- Copenhagen Adductor
 ('0e241007-29ec-4f9d-8113-05df033f7f76','https://www.youtube.com/watch?v=kFSnvwvc5ac'), -- Nordic Hamstring Curl
 ('e8088efe-5f14-4578-bba5-6c3ac300c5da','https://www.youtube.com/watch?v=_2xWmYNnFS8'), -- Pallof Press
 ('de013fbe-64f4-4ccb-a308-fa9fb58ab135','https://www.youtube.com/watch?v=A2b2EmIg0dA'), -- Plank
 ('b4096c85-e5eb-437c-bd43-fb138ea032da','https://www.youtube.com/watch?v=R9HJnAdJAUs'), -- Saw Plank
 ('d17620aa-2bfa-4ed6-8953-f3b0d8a50919','https://www.youtube.com/watch?v=iNbH7_edNI8')  -- Side Plank
) AS v(id, url)
WHERE e.id = v.id::uuid;
