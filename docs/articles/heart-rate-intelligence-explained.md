# Heart Rate Intelligence: turning belt data into decisions coaches can trust

GPS tells you what a player did — how far, how fast, how many sprints. It says nothing about how hard
that work felt on the inside. A 6 km session on a hot afternoon after a poor night's sleep costs a
player far more than the same 6 km when fresh, yet the GPS line looks identical. Heart Rate
Intelligence fills that gap: it reads the belt to show the *internal* cost of training, and cross-
checks it against how hard the player said it was.

## Why heart rate, and why now

Football is an aerobic sport punctuated by intense bursts. During a match, a player's average heart
rate sits around 85% of maximum and peaks near 98%, and it is rarely below 65% of maximum for the
whole game — the aerobic system is under continuous demand (Bangsbo, 2014). That makes heart rate a
strong window on internal load. Decades of work show that heart-rate-based training-load indices are
valid measures of load and intensity in elite footballers (Malone et al., 2017).

For years the practical stand-in for internal load has been session RPE — the player's own rating of
how hard the session was, multiplied by its duration. It is well validated: sRPE tracks heart-rate
TRIMP with correlations of r = 0.50–0.85 in soccer (Impellizzeri et al., 2004). Notably, that
agreement is *lower* in football than in endurance sport — precisely because heart rate misses the
anaerobic contribution of the game's sprints and collisions. So the disagreement between the two is
not noise; it is information. When a player's effort rating runs ahead of what his heart rate shows,
that gap points at the anaerobic and psychological load the belt cannot see. Now that Catapult belts
stream heart rate, we finally have that objective second opinion — and the interesting information is
exactly where the two diverge.

## How the feature works

**1. One honest number for internal load.** For each session we compute a heart-rate load index using
Edwards' summated-heart-rate-zone method (Edwards, 1993): time spent in each intensity band is
weighted (easy zones count little, hard zones count a lot) and summed. This is the same logic modern
team-sport monitoring frameworks recommend (Schneider et al., 2018). Alongside it we compute the sRPE
load the same way we always have.

**2. The cross-check — where objective meets subjective.** We place the heart-rate index next to the
sRPE index. When they agree, the session was as hard as it felt, and you can trust the number. When
they diverge beyond the player's normal relationship, that is the signal worth a look: it can mean a
mislabelled RPE, a belt or data problem, or an autonomic response — a player whose heart is working
harder than the effort should warrant. The tool flags the gap and explains it in plain language; it
never overrides the readiness verdict.

**3. Intensity distribution — not just how much, but how hard.** The session is broken into intensity
tiers (low / moderate / high) so you can see the *shape* of the load, not only its total. Two sessions
with the same load can be built completely differently — a steady aerobic block versus a sharp
high-intensity day — and the distribution shows which.

**4. A match-intensity anchor.** When a player's maximum heart rate is known, the distribution becomes
match-relative: a drill whose mean heart rate approaches ~85% of maximum reached match intensity,
while time below 65% of maximum was genuinely easy (Bangsbo, 2014). For fair comparison *between*
players — whose resting and maximum rates differ — the tool can express intensity as heart-rate
reserve, %HRres = (exercise − rest) / (max − rest), the metric recommended for soccer (Dellal et al.,
2012). Either way you can answer a question coaches actually ask — "was that session hard enough to
prepare us for Saturday?" — with a number instead of a feeling. The same time-in-zone data verifies a
conditioning session's *dose*: whether it accumulated enough time in the high zones to drive the
aerobic adaptation it was designed for (Buchheit & Laursen, 2013), or drifted easy.

**5. An honesty gate.** None of this appears unless the belt actually covered enough of the session.
No belt, or no known maximum heart rate, means the tool says "not enough data" rather than showing a
misleading zero. It also catches a subtler failure: a belt that was worn but never made proper skin
contact logs a flat, falsely-easy profile — the whole session sitting in the lowest zone with no real
peaks. The tool recognises that signature and flags "belt not reading" instead of telling you a hard
session was light. Every reading carries its confidence and its method.

## What it gives a coach

- **A truth-check on effort.** Did the session land where you intended? If a player's belt says "hard"
  while their RPE said "easy" — or the reverse — you find out the next morning, not three weeks later.
- **Load you can compare fairly.** Because it reads the internal cost, it accounts for heat, fatigue
  and fitness that GPS distance cannot — the same external session can carry very different internal
  prices, and this shows it.
- **Session design feedback.** The intensity distribution verifies a "conditioning" day's dose —
  whether it truly banked time in the high zones needed for aerobic adaptation, or drifted low
  (Buchheit & Laursen, 2013).
- **Fitness trend over time.** A standardised submaximal effort — a fixed short run, reading the heart
  rate over the last 30–60 seconds (HRex) — tracks aerobic fitness without a maximal test. HRex is the
  most reliable heart-rate marker, and a change of about 1% is meaningful; smaller moves are treated
  as noise, not flagged (Buchheit, 2014; Schneider et al., 2018). It is time-efficient enough to
  repeat in-season.
- **A recovery read.** Morning heart-rate variability (RMSSD), followed as a rolling trend against each
  player's own baseline rather than a single noisy day, is a practical, non-invasive recovery signal
  (García-Ortega et al., 2023). It sits beside the readiness picture, never replaces it.

## The honest limits

Heart rate is not the whole story, and the tool is built to say so. Because oxygen and heart-rate
kinetics can't follow sub-minute efforts, heart rate *lags* the sprints and accelerations that are the
most intense — and most injury-relevant — actions in a game (Dellal et al., 2011). So heart rate
understates exactly the peak neuromuscular demand that GPS captures well. That is why Heart Rate
Intelligence is designed to sit alongside GPS high-speed/sprint load and sRPE, never to replace them:
GPS is the external "what", heart rate is the internal "how hard", and RPE is the perceived. Each
covers the others' blind spots.

Two more principles keep it trustworthy. Everything is read against the player's *own* norm and *trend*
— heart rate drifts upward through a session with heat and dehydration, and moves with sleep and
position, so a single value in isolation misleads (Achten & Jeukendrup, 2003). Heart rate reflects the
aerobic state, not performance itself, and is weak at detecting overtraining on its own — which is why
it is one input among several, never the verdict. And none of it touches the readiness colour: these
are descriptive load and recovery signals that inform the coach, not a second verdict competing with
the first.

## The takeaway

Heart Rate Intelligence turns a raw belt feed into three questions a coach can answer every morning:
was the session as hard as it felt, was it built the way I intended, and is this player getting fitter
or more fatigued? It does so with methods drawn straight from the sports-science literature, with its
confidence and its limits stated plainly — an objective second opinion that makes the subjective one
more useful, not a black box that asks you to trust it.

---

### References
- Bangsbo, J. (2014). *Physiological Demands of Football.* GSSI Sports Science Exchange #125. https://www.gssiweb.org/sports-science-exchange/article/sse-125-physiological-demands-of-football
- Malone, S., et al. (2017). *Validity of Heart Rate-Based Indices to Measure Training Load and Intensity in Elite Football Players.* https://pubmed.ncbi.nlm.nih.gov/28614162/
- Impellizzeri, F.M., et al. (2004). *Use of RPE-Based Training Load in Soccer.* Medicine & Science in Sports & Exercise. https://pubmed.ncbi.nlm.nih.gov/15292745/
- Edwards, S. (1993). *The Heart Rate Monitor Book* — summated heart-rate-zone (TRIMP) method.
- Schneider, C., et al. (2018). *Heart Rate Monitoring in Team Sports — A Conceptual Framework.* Frontiers in Physiology 9:639. https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00639/full
- Buchheit, M. (2014). *Monitoring training status with HR measures: do all roads lead to Rome?* Frontiers in Physiology 5:73. https://www.frontiersin.org/articles/10.3389/fphys.2014.00073/full
- Buchheit, M., & Laursen, P.B. (2013). *High-Intensity Interval Training: Solutions to the Programming Puzzle.* Sports Medicine. https://pubmed.ncbi.nlm.nih.gov/23539308/
- García-Ortega, D., et al. (2023). *Effects of training on the heart rate variability of competitive soccer players: a systematic review with meta-analysis.* https://journals.sagepub.com/doi/abs/10.1177/17479541221145624
- Dellal, A., et al. (2012). *Heart Rate Monitoring in Soccer: Interest and Limits During Competitive Match Play and Training.* Journal of Strength & Conditioning Research. https://pubmed.ncbi.nlm.nih.gov/22130401/
- Achten, J., & Jeukendrup, A.E. (2003). *Heart Rate Monitoring: Applications and Limitations.* Sports Medicine. https://pubmed.ncbi.nlm.nih.gov/12751857/
