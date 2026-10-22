# Fusing physical load with tactical context: contextualised peak periods in practice

*How MicroPulse pairs a player's hardest physical minutes with what he was actually doing on the pitch —
built and proven on real match data.*

## The problem: GPS tells you *how much*, not *what*

Every GPS system can tell you a player's most intense passage of a match — his peak 1-, 3- or 5-minute
window of running. That number drives a lot of modern training design: coaches try to build drills that
replicate the hardest minutes of a game so players are prepared for them.

But a peak window is just a distance. It doesn't tell you *what that running was made of*. Was his
hardest spell a series of attacking sprints in behind? Or was it recovery runs and covering, chasing
back after a turnover? Those two demand very different things — and if your drill only rehearses the
first, you've under-prepared him for the second.

Ju and colleagues (2022, *Biology of Sport*) put numbers on this. Across 50 English Premier League
matches and 583 player observations — 350 hours of coding tracking data against video — they found
that peak periods are **not** mostly attacking sprints. They are dominated by **Recovery Run** and
**Covering** out of possession (28–37% of the high-intensity distance) and **Support Play** in
possession (9–13%). And the mix is strongly **position-specific**: a centre-back's peak is covering and
recovering; a wide attacker's is moving to receive and running in behind; a central striker's is
closing down and pressing.

That is the gap MicroPulse set out to close: not just *how hard* a player worked, but *what kind of
work it was* — the physical and the tactical on the same clock.

## What we built

The fusion has two feeds, and the trick is aligning them on the same match clock.

**The physical feed** comes from Catapult. Alongside the standard load metrics, we derive
high-speed-running distance (HSR) directly from the velocity bands. A useful detail: the club's
Velocity Band 5 begins at 5.50 m/s — exactly **19.8 km/h**, the threshold Ju used — and Band 6 at
7.00 m/s = 25.2 km/h, the classic sprint threshold. So HSR is simply Band 5 + Band 6, correctly
labelled, with no guesswork. We also pull the **peak windows** (the hardest rolling 1/3/5 minutes for
distance and player load) *with their clock position*, and the **IMA directional signature** — the
inertial movement clock that splits high-intensity movement into forward, backward and lateral. That
directional read is, on its own, a Catapult-only approximation of the Ju question: forward-dominant
plus high HSR looks like attacking output; backward-dominant plus heavy braking looks like defensive
transition — the Recovery-Run/Covering signature — and it's available automatically on every session,
no video required.

**The tactical feed** comes from time-stamped event data (Wyscout SportsCode export): every on-ball
action a player performs, and the team's tactical phases, each with a time in seconds from kickoff.

Put them on the same kickoff clock and you can take a player's physical peak window and read off the
tactical labels that overlap it.

## The proof, on a real match

We ran this on Breiðablik vs Fram (24 August 2026), first half, where the two clocks share a clean
kickoff origin. Take one player — Óli Valur Ómarsson — and look at two of his "peak" windows:

- **His hardest single minute** (peak 1-minute player load, at 8:17): the team was *defending* — two
  crosses conceded, a corner conceded, a goal-scoring chance conceded. His own actions: an
  interception and a clearance. His most intense physical minute was scrambling to defend a set-piece.
- **His hardest five-minute running spell** (peak 5-minute distance, 27:02–32:02): the team was
  *attacking* — attacking style of play, three crosses, two attacking corners, a chance and a shot.
  His own actions: five passes, a 1v1 dribble, two crosses, an opportunity and a shot. His highest-
  distance spell was his own attack down the flank.

Same player, two peaks, **opposite tactical meaning** — one defensive, one offensive. GPS alone tells
you *when* he worked hardest; event data alone tells you *what* he did; only putting them on the same
clock tells you his hardest minute was defending a corner while his hardest run was his own attack.
That is the read siloed systems can't give.

## Being honest about the edges

This only works if you're straight about the limits, especially in front of an expert audience:

- The tactical layer is derived from **on-ball event data**. Off-ball and relational patterns (overlaps,
  covering runs, pressing triggers) aren't in the feed — Ju's team hand-coded those from video, and no
  automated feed reproduces that taxonomy. So the IMA directional read is a *movement approximation* of
  the tactical question, not a reproduction of the hand-coded variables. We label it as such.
- The exact **peak-window HSR** score — the >19.8 km/h fraction inside the hardest minute — needs raw
  GPS; the standard exports give peak windows for distance and player load only. So the Ju "Table 2"
  peak-HSR figure stays gated, while per-period HSR (session and half) is real.
- First-half alignment is exact; second-half windows need a half-time-gap correction between the
  Catapult session clock (real elapsed) and event play-time (half-time removed).

None of this touches the readiness verdict a coach sees each morning. It is descriptive load and
tactical context — a lens on training, not a decision engine.

## Why it matters for training — in-season and pre-season

The practical payoff is that peak periods are position-specific and mostly defensive transition, so
drills should replicate the actual tactical content of a position's hardest minutes, not generic
sprints. A centre-back needs repeated covering-and-recovery efforts; a wide attacker needs
move-to-receive and run-in-behind loading; a midfielder needs transition support play.

The individual benchmark is a whole-season picture, not one match. Physical peak demands vary hugely
by opponent and context — Ju used 50 matches precisely because one game is noise. MicroPulse
accumulates peak windows and HSR/IMA across the season automatically, so the training target is a
rolling season-best curve, read alongside the external position benchmarks from the literature. In
pre-season you build toward and past that ceiling; in-season you maintain it, top up players who played
under 30 minutes, and train the ability to *repeat* high intensity right after a peak — the transient
decrement Ju measured, where the minute after the peak drops most.

## The bottom line

Contextualised peak periods turn a distance into a decision. By putting a player's physical peak on the
same clock as his tactical actions — and, where video-coded events aren't available, approximating the
same question from the IMA directional signature — MicroPulse tells a coach not just that a player's
hardest minutes are hard, but what they are made of, and therefore how to train them. It runs on real
data today; the remaining work is engineering, not concept.

---

*Reference: Ju W, Doran D, Hawkins R, Martín-García A, Gómez-Díaz A, Ade J, Laws A, Evans M, Bradley PS.
Contextualised peak periods of play in English Premier League matches. Biology of Sport 2022;39(4):973–983.
doi:10.5114/biolsport.2022.112083. HSR threshold >19.8 km/h throughout.*
