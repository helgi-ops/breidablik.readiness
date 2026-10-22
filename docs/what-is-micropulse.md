# What MicroPulse Is

*A detailed overview of the product, its philosophy, its engines and its current footprint.*

---

## In one paragraph

MicroPulse is an athlete-monitoring and decision-support platform for football clubs. It takes the data a club already generates — GPS/inertial units, force plates, velocity-based training devices, player check-ins, clinical notes, fixtures — and turns it into a single daily answer for each player: is he ready, does he need a modified session, or does he need to recover. What separates it from a dashboard is that every answer explains itself. The coach sees the verdict first, the plain-language reason second, and the raw sport-science detail only if he asks for it. The rules make the decisions; the AI only explains them.

## Who it is for

The primary user is the head coach, who needs a fast, trustworthy read on the squad before a session, and who is not a sport scientist. The secondary user is the strength-and-conditioning coach or physiotherapist, who needs the underlying numbers, the baselines and the return-to-training mechanics. The same screens serve both: the head-coach surface is the default, and the S&C surface is the drill-down beneath it. Clubs on smaller budgets are served by the same product at a reduced data tier rather than a cut-down separate app.

## The philosophy: explainability first

The product is built on a written manifesto that every coach-facing feature must satisfy, and it is the single most distinctive thing about MicroPulse.

Decisions carry their own provenance. Every verdict can state which signals produced it, and every signal carries a citation to the literature it comes from — Gabbett on acute-chronic workload and return-to-training, Buchheit on load interpretation, McBurnie on deceleration, Brown on the unreliability of GPS-derived metabolic power indoors, Baar on tendon and isometric loading, and so on. A number that cannot say where it came from does not belong on a coach screen.

The read is layered. At a glance the coach gets a one-sentence verdict. Without clicking anything he then gets two or three plain supporting facts — the "why", the named exceptions, the key number. Only behind a "show details" toggle does he meet composites, ACWR, high-intensity-running metrics or inertial jargon. The product deliberately never jumps from the verdict straight to the raw table.

Flagged players get a counterfactual. Rather than only saying a player is amber, the system says what would have had to be different for him to be green. That converts a label into something a coach can act on.

Every verdict shows its confidence, built from how much signal coverage exists and how mature the player's personal baseline is. A verdict computed from three sessions is not presented with the same authority as one computed from thirty.

The system says when it does not know. Missing data is surfaced as missing, never silently rendered as zero. This distinction — a zero is a claim about the athlete, a null is a claim about the data — runs all the way down into the ingestion code, where for example an indoor session with no GPS lock writes a null distance rather than a zero.

AI labels itself as AI and cites the real data underneath it. Rules decide and AI explains, never the other way round. And when a coach disagrees and overrides a recommendation, the override is stored with his reason, creating an audit trail rather than a silent divergence.

## How the daily loop works

Each morning the platform assembles the previous day's external load, the player's own check-in, any clinical or injury state, and the position of the day in the match-week cycle. It compares today against that player's own recent norm rather than against the squad, and produces a traffic-light verdict — green, amber or red — that is the canonical answer shown everywhere in the product, from the daily briefing to the AI explanation to the exported report.

Alongside the colour sits a separate, explicitly-labelled training action: full, reduced or recovery. Keeping these apart matters. The colour answers "how does today compare to his usual?"; the action answers "what should we actually plan?". A third, internal, trajectory-aware engine watches for patterns such as three consecutive amber days and surfaces those as a distinct trend alert rather than quietly overwriting the colour.

## Product tiers

MicroPulse ships in two data tiers, driven by what the club's Catapult subscription actually delivers rather than by an artificial paywall.

The Pro or Full tier syncs directly from the Catapult API and includes inertial data — IMA accelerations and decelerations, change-of-direction counts, free-running stride bands, and the Football Movement Profile. This unlocks the indoor-load, deceleration-intelligence and stride-length surfaces, all of which depend on inertial signals that work when GPS does not.

The Core or Lite tier ingests CSV exports from Catapult OpenField instead, giving GPS distance, high-speed running, sprint distance, player load, top speed, accelerations and decelerations and effort counts — but no inertial IMA. The product hides the surfaces that would look broken without that data and substitutes tier-appropriate equivalents, so a Lite club gets a coherent product rather than a series of empty screens.

The tier is resolved automatically from the data actually arriving, with a per-team override available when a club's configuration needs pinning.

## Where the data comes from

Catapult is the primary source, either through an authenticated API sync for Pro clubs or through a CSV upload path for Core clubs, with an alias-based column catalogue that tolerates the considerable variation between OpenField report templates, firmware versions and coach presets. Everything normalises into one table of daily per-player external load, so every downstream feature behaves identically regardless of whether the data arrived by API or by spreadsheet.

Beyond GPS, the platform ingests VALD ForceDecks jump and force data, GymAware velocity-based training sessions, player self-reported wellness and session-RPE check-ins, clinician-entered injury events and rehabilitation state, coach-entered match minutes, and the fixture list. It exports back out to the Icelandic FA reporting format and to a TV-display view for the dressing room.

## The feature surface

Load monitoring covers the daily and weekly training picture: load intelligence, high-speed-running intelligence for Lite clubs, quadrant analysis of volume against intensity, indoor load for hall sessions, deceleration and inertial-movement intelligence for Pro clubs, match-movement comparison, per-player game reports normalised to ninety minutes, positional comparison, post-match recovery tracking and a train-like-you-play view that checks whether training actually rehearses match demands.

Injury and return-to-play covers injury pattern analysis, an RTP tracker, the return-to-training engine, clinical report intake and threshold notifications. The return-to-training engine is a direct implementation of the floor–ceiling–time framework: it builds a ceiling from the player's own healthy weeks, a floor from his recent load, models detraining, and ramps him between them week by week. Athletes the literature flags as less tolerant of rapid increases — a prior injury to the same region, several injuries in the past year, age at either extreme, or a thin training history — are automatically ramped at the cautious rate instead of the standard one, and the surface states in plain language which factor triggered it.

Performance analytics covers longer-window trends, volatility, neuromuscular testing from force plates, velocity-based strength profiling and a per-player assessment profile.

Planning covers the fixture calendar, week setup around match day, pre-session and post-session reports, progressive-overload tracking, match-day comparison, a session builder and match-minute entry.

Strength planning covers an adaptive daily micro-dose session, a programme library, custom cluster and contrast programme construction, load-velocity profiling, a substantial evidence-based isometric protocol library and recovery protocols.

Administration covers roster management and approvals, integrations, the CSV upload paths, reporting and settings. A separate, deliberately minimal personal-training mode reshapes the whole navigation for one-to-one coaching clients rather than squads.

## The engines underneath

The readiness engine compares a player to his own recent norm rather than to the squad, which is what makes the verdict fair to both the outlier athlete and the squad player.

The return-to-training engine implements the floor–ceiling–time model with an individualised ramp rate, and refuses to ever prescribe below the player's current floor — a safety property added after the engine was caught proposing a plan that would have reduced a healthy player's load.

The data-quality engine treats missing data as a first-class output. It knows which signals a club is entitled to at its tier, and classifies each feed as healthy, degraded, silent, never-seen or not-expected. A Lite club missing inertial data is not a fault; a Pro club that has stopped sending impacts is. This is what allows the product to say "I don't know" instead of quietly showing zeros.

The provisional-baseline engine shrinks early estimates toward a sensible prior so that a player with four sessions is not judged with the same confidence as one with forty, and surfaces baseline maturity as part of the confidence figure.

Supporting engines handle stride-length estimation from high-cadence inertial data with explicit plausibility bounds, match-minute classification that distinguishes a substituted-off starter from a substitute whose warm-up contaminated his per-minute numbers, and deceleration intelligence built on the band-two-to-three effort cluster.

## The science base

The product is unusually citation-dense for a coaching tool, and this is deliberate: it is what allows a coach to trust a number he did not compute. Load and return-to-play draw on Gabbett; deceleration on McBurnie; indoor limitations on Brown; isometric and tendon work on Baar, Oranchuk and Silbernagel; high-speed running on Malone and Buchheit; asymmetry thresholds on Bishop; velocity-based training on Banyard and González-Badillo; micro-dosing on Rønnestad. Where the implementation deviates from a paper — for instance using a player's own healthy load as a proxy for sport demands rather than modelling those demands directly — the deviation is written down next to the citation rather than hidden.

## Architecture and design

The application is a TypeScript Next.js app on top of a Postgres database with authentication, row-level access by team, database functions for the heavier per-player computations, and scheduled jobs for ingestion. Coaches can belong to several clubs and switch between them, which is how a consultant or a multi-team practitioner uses the product.

The interface is bilingual throughout, English by default with an Icelandic toggle, and both are held to the same standard: no sport-science jargon in either language on the primary surface. The visual language is a warm bone-white canvas rather than pure white, a cobalt primary, traffic-light greens, ambers and reds reserved strictly for verdicts, and a distinct purple reserved for return-to-training surfaces so rehabilitation never visually competes with daily readiness.

## Where it runs today

MicroPulse is in use with Icelandic football clubs across both tiers — Breiðablik and HK on the full inertial tier, Fylkir and Keflavík on the CSV-based Core tier — alongside a demonstration squad and a personal-training deployment. Clubs are onboarded by connecting or uploading their Catapult history, matching the roster, marking the fixture list so per-match reports resolve correctly, and then letting the personal baselines mature over the first few weeks, during which the product openly reports lower confidence rather than pretending to certainty.

## What makes it different

Most athlete-monitoring platforms are excellent at storing and charting data and leave interpretation to whoever is looking. MicroPulse takes the opposite position: it commits to an answer, and then makes that answer inspectable. The verdict is one number with one canonical source, visible identically to the coach, the AI assistant, the exported report and the television in the dressing room. The reasoning is in plain language before it is in jargon. Absent data is stated rather than zeroed. Recommendations can be overridden, and the override is recorded. For a club without a full-time sport-science department, that combination — a decision it can act on, and a trail it can audit — is the product.

---

*Prepared from the MicroPulse codebase, database and product manifesto. Reflects the system as of July 2026.*
