-- Run-specific isometric exercises (RSIST, after Alex Natera): sprint-position
-- isometrics for the ankle/Achilles, hip flexion (knee drive), hip extension
-- (propulsion), hamstring at length, and the acceleration split stance.
-- PIMA = overcoming (push/pull into immovable → force/RFD); HIMA = yielding
-- (hold → tendon stiffness). Based on published methodology, not scraped.
-- System exercises (owner_team_id NULL); idempotent on name.
insert into public.exercise_library (name, name_is, exercise_type, category, movement_family, is_bilateral, description, description_is, owner_team_id)
select * from (values
  (
    'ISO Plantarflexion (overcoming)', 'ISO ökklarétta (push)', 'strength', 'isolation', null, false,
    $d$Isometric — PIMA (overcoming / pushing), run-specific (RSIST, after Alex Natera). On one leg with a stiff ankle, push the ball of the foot maximally up into a fixed bar/strap set just above — the bar can't move, so you produce force through a sprint-relevant ankle position. Builds the ankle/Achilles stiffness and plantarflexor force that drive ground contact in sprinting. Dosing: maximal intent, short pushes 3–5 s for force/RFD, 3–5 reps/side, full rest; keep the ankle locked (don't let the heel drop). Cues: tall, stiff ankle, push hard and fast through the ball of the foot. Common faults: heel collapsing, easing into it, sub-maximal effort.$d$,
    $i$Ísómetrísk — PIMA (overcoming / pushing), hlaupa-sértæk (RSIST, eftir Alex Natera). Á einum fæti með stífan ökkla, ýttu framfætinum hámarks upp í fasta stöng/ól rétt fyrir ofan — stöngin getur ekki hreyfst, svo þú myndar kraft í sprett-tengdri ökkla-stöðu. Byggir ökkla-/Achilles-stífni og kálfa-kraft sem drífa snertingu í spretti. Skömmtun: hámarks ásetningur, stutt ýting 3–5 sek fyrir kraft/RFD, 3–5 endurtekningar/hlið, full hvíld; haltu ökklanum læstum (ekki láta hælinn síga). Cues: hár, stífur ökkli, ýttu fast og hratt í gegnum framfótinn. Algeng mistök: hæll sígur, fara rólega í það, hálf-átak.$i$,
    null::uuid
  ),
  (
    'ISO Hip Flexion (overcoming)', 'ISO mjaðmabeygja (push)', 'strength', 'isolation', null, false,
    $d$Isometric — PIMA (overcoming / pushing), run-specific (RSIST). Standing tall (or in a rack/doorway), drive one knee up to a sprint-relevant hip angle (~90°) and push the thigh maximally up into a fixed strap/bar. Trains hip-flexor force and the front-side knee drive of sprinting. Dosing: maximal intent, 3–5 s pushes, 3–5 reps/side, full rest; set the strap at the thigh angle you want to strengthen. Cues: stand tall, brace, drive the knee up hard into the strap, don't lean back. Common faults: leaning back/arching, dropping the knee, sub-maximal effort.$d$,
    $i$Ísómetrísk — PIMA (overcoming / pushing), hlaupa-sértæk (RSIST). Stattu hár (eða í grind/dyragátt), drífðu annað hné upp í sprett-tengt mjaðma-horn (~90°) og ýttu lærinu hámarks upp í fasta ól/stöng. Þjálfar mjaðma-beygju kraft og fram-hlið hné-drifið í spretti. Skömmtun: hámarks ásetningur, 3–5 sek ýting, 3–5 endurtekningar/hlið, full hvíld; settu ólina í læris-hornið sem þú vilt styrkja. Cues: stattu hár, spenntu, drífðu hnéð upp fast í ólina, ekki halla aftur. Algeng mistök: halla aftur/sveigja, missa hnéð niður, hálf-átak.$i$,
    null::uuid
  ),
  (
    'ISO Hip Extension (overcoming)', 'ISO mjaðmarétta (push)', 'strength', 'compound', 'hinge', false,
    $d$Isometric — PIMA (overcoming / pushing), run-specific (RSIST). From a glute-bridge or single-leg bridge with the foot fixed, drive the hips up / foot down maximally into the floor or a fixed bar, producing hip-extension force in a propulsion-relevant position. Targets the glutes/hamstrings that power the drive phase of sprinting. Dosing: maximal intent, 3–5 s pushes, 3–5 reps (per side if single-leg), full rest. Cues: brace, neutral spine, drive maximally through the heel, squeeze the glute. Common faults: hyperextending the low back, pushing with the quad, sub-maximal effort.$d$,
    $i$Ísómetrísk — PIMA (overcoming / pushing), hlaupa-sértæk (RSIST). Úr rassbrú eða ein-fóta brú með fótinn fastan, drífðu mjaðmir upp / fótinn niður hámarks í gólfið eða fasta stöng, og myndaðu mjaðma-réttu kraft í framdrifs-stöðu. Beinist að rass/aftanlæri sem knýja drif-fasa sprettsins. Skömmtun: hámarks ásetningur, 3–5 sek ýting, 3–5 endurtekningar (per hlið ef ein-fóta), full hvíld. Cues: spenntu, hlutlaus hryggur, drífðu hámarks í gegnum hælinn, kreistu rassinn. Algeng mistök: ofsveigja mjóbak, ýta með framlæri, hálf-átak.$i$,
    null::uuid
  ),
  (
    'ISO Knee Flexion (overcoming)', 'ISO hnébeygja aftanlæri (push)', 'strength', 'isolation', 'hinge', false,
    $d$Isometric — PIMA (overcoming / pushing), run-specific (RSIST). Supine with the heel on a fixed surface and the knee slightly bent toward a sprint-relevant (more extended) angle, pull the heel down/in maximally — the surface can't move, so you produce hamstring force at length. Builds hamstring strength at the long muscle lengths used in late swing, where strains occur. Dosing: maximal intent, 3–5 s pulls, 3–5 reps/side, full rest; choose a longer lever (more extended knee) for sprint specificity. Cues: neutral spine, pull the heel into the floor, squeeze the hamstring. Common faults: cramping from too much too soon, arching the back, sub-maximal effort.$d$,
    $i$Ísómetrísk — PIMA (overcoming / pushing), hlaupa-sértæk (RSIST). Á baki með hælinn á föstu yfirborði og hné örlítið beygt í átt að sprett-tengdu (réttara) horni, togaðu hælinn niður/inn hámarks — yfirborðið hreyfist ekki, svo þú myndar aftanlæris-kraft við lengd. Byggir aftanlæris-styrk við löngu vöðva-lengdirnar í seinni sveiflu, þar sem tognanir verða. Skömmtun: hámarks ásetningur, 3–5 sek tog, 3–5 endurtekningar/hlið, full hvíld; veldu lengra vogarafl (réttara hné) fyrir sprett-sérhæfni. Cues: hlutlaus hryggur, togaðu hælinn í gólfið, kreistu aftanlærið. Algeng mistök: krampi af of miklu of fljótt, sveigja bak, hálf-átak.$i$,
    null::uuid
  ),
  (
    'ISO Split-Stance Drive', 'ISO klofstöðu-drif (push)', 'strength', 'compound', 'squat', false,
    $d$Isometric — PIMA (overcoming / pushing), acceleration-specific (RSIST). In a staggered/split acceleration stance with the front foot under you and a forward body lean, push maximally into a fixed bar/strap as if driving out of the blocks — whole-leg force in the acceleration position. Dosing: maximal intent, 3–5 s pushes, 3–5 reps/side, full rest; set the lean/angle to match early acceleration. Cues: forward lean, big push through the front leg, stay rigid. Common faults: standing too upright, easing into it, sub-maximal effort.$d$,
    $i$Ísómetrísk — PIMA (overcoming / pushing), hröðunar-sértæk (RSIST). Í klofinni/skástilltri hröðunar-stöðu með fremri fót undir þér og halla fram, ýttu hámarks í fasta stöng/ól eins og þú sért að drífa úr blokkum — heildar-fótar kraftur í hröðunar-stöðu. Skömmtun: hámarks ásetningur, 3–5 sek ýting, 3–5 endurtekningar/hlið, full hvíld; stilltu hallann/hornið að snemm-hröðun. Cues: halli fram, stór ýting í gegnum fremri fót, vertu stífur. Algeng mistök: standa of uppréttur, fara rólega í það, hálf-átak.$i$,
    null::uuid
  ),
  (
    'ISO Calf Raise Hold (Single-Leg)', 'ISO kálfahold (ein fótur)', 'strength', 'isolation', null, false,
    $d$Isometric — HIMA (holding / yielding), run-specific (RSIST). On one leg, hold a calf-raise at mid-range with a stiff ankle (add load as able), resisting the pull to drop — a long-duration hold that builds Achilles tendon stiffness for sprinting and reduces tendon pain. Dosing (tendon): holds 20–45 s (Natera-style long holds up to ~30 s+ for stiffness), 3–5 reps/side, moderate–high load; progress load over weeks. Cues: tall, stiff ankle, hold the position steady, don't bounce. Common faults: letting the heel drop, bouncing, and rushing the load progression.$d$,
    $i$Ísómetrísk — HIMA (holding / yielding), hlaupa-sértæk (RSIST). Á einum fæti, haltu kálfalyftu í miðsviði með stífan ökkla (bættu álagi eftir getu), og standist togið niður — langt hold sem byggir Achilles-sin stífni fyrir sprett og minnkar sin-verki. Skömmtun (sin): hold 20–45 sek (Natera-stíll löng hold allt að ~30 sek+ fyrir stífni), 3–5 endurtekningar/hlið, miðlungs–hátt álag; auktu álag yfir vikur. Cues: hár, stífur ökkli, haltu stöðu stöðugri, ekki hoppa. Algeng mistök: láta hælinn síga, hoppa, og flýta álags-framvindu.$i$,
    null::uuid
  )
) as v(name, name_is, exercise_type, category, movement_family, is_bilateral, description, description_is, owner_team_id)
where not exists (select 1 from public.exercise_library e where e.name = v.name);
