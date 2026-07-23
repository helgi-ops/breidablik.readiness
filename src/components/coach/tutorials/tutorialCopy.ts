/**
 * Coach tutorial content — bilingual, one entry per coach page.
 *
 * Source: docs/MicroPulse-notkun-leidarvisir.pdf (the coach usage guide, already
 * EN+IS). Surfaced as a "How to use this page" overlay from each page's header
 * (see CoachTutorialModal + PagePurpose). Text-only + one embedded overview video
 * on `today`; no screenshots (they go stale). Plain language, explainability-first
 * — the same "verdict → why → details" spirit the pages themselves follow.
 *
 * To add a tutorial to another page: add a slug here and pass it to that page's
 * <PagePurpose tutorial="…" />. The link only appears where a slug exists.
 */

export type Bi = { en: string; is: string };

export type TutorialSlug =
  | "today"
  | "week-setup"
  | "load-intelligence"
  | "quadrant"
  | "indoor-load"
  | "decel-intelligence";

export type TutorialSection = { heading: Bi; body: Bi[] };

export type Tutorial = {
  title: Bi;
  intro?: Bi;
  /** Third-party embed URL (iframe), overview video — `today` only. */
  videoEmbedUrl?: string;
  sections: TutorialSection[];
};

const TODAY_VIDEO =
  "https://video.pictory.ai/embed/20260722221627557f4b112f19f37476796316acd88f146b9/20260722222727407i0Tiva8ODNDDF5P";

export const TUTORIALS: Record<TutorialSlug, Tutorial> = {
  today: {
    title: { en: "How to use the Today page", is: "Hvernig á að nota Today-síðuna" },
    intro: {
      en: "You only need the Today page. It reads every signal — check-ins, Catapult load, VALD/CMJ tests, injury status — and returns one answer per player: green, amber or red, with a plain-language action. The rest of the system is there for when you want to go deeper, not every day.",
      is: "Þú þarft bara Today-síðuna. Hún les öll merkin — líðanarskráningar, Catapult-álag, VALD/CMJ-próf, stöðu gagnvart meiðslum — og skilar einu svari á leikmann: grænt, gult eða rautt, með aðgerð á mannamáli. Hitt kerfið er til staðar þegar þú vilt fara dýpra — ekki daglega.",
    },
    videoEmbedUrl: TODAY_VIDEO,
    sections: [
      {
        heading: { en: "Your morning — three minutes", is: "Morgunninn þinn — þrjár mínútur" },
        body: [
          {
            en: "Open Today and read the top sentence with the confidence beside it. Confidence tells you immediately whether to trust the day or whether too few players have checked in.",
            is: "Opnaðu Today og lestu efstu setninguna með örygginu við hliðina. Öryggið segir þér strax hvort þú getur treyst deginum eða hvort of fáir hafa skráð líðan.",
          },
          {
            en: "At the bottom the squad splits into ready / modified / recovery. A green squad means carry on as planned — that's all most days need.",
            is: "Neðst skiptist hópurinn í klár / aðlagað / endurheimt. Grænn hópur þýðir haltu áfram eins og planað var — það er allt sem flestir dagar þurfa.",
          },
          {
            en: "For each amber or red player the Decision Summary shows the action and the reason, with a counterfactual — “one more point of sleep and he'd be green” — so you can judge whether you agree.",
            is: "Fyrir hvern gulan eða rauðan leikmann sýnir Decision Summary aðgerðina og ástæðuna, með mótdæmi — „hefði svefn verið einum hærri væri hann grænn“ — svo þú getur metið hvort þú ert sammála.",
          },
        ],
      },
      {
        heading: { en: "The layered read — you choose the depth", is: "Lagskipti lesturinn — þú ræður dýptinni" },
        body: [
          {
            en: "Every screen is built in three layers so you never read more than you need. The verdict: one colour, one sentence (~5 s). The why: two or three plain facts, visible without a click (~15 s). The details: tables, ACWR, jargon — only behind “Show details”, for the S&C and physio.",
            is: "Hver skjámynd er byggð í þremur lögum svo þú lesir aldrei meira en þú þarft. Niðurstaðan: einn litur, ein setning (~5 sek). Ástæðan: tvær til þrjár einfaldar staðreyndir, sýnilegar án smells (~15 sek). Smáatriðin: töflur, ACWR, fagorð — bara á bak við „Show details“, fyrir styrktar- og sjúkraþjálfara.",
          },
        ],
      },
      {
        heading: { en: "Decision Summary", is: "Decision Summary" },
        body: [
          {
            en: "Each card shows the status, the trend since yesterday, and the action in plain language — e.g. “Clear for full session”. The reasoning (counterfactuals, drivers, confidence) is always one click below the decision; you don't have to open it, it's there when you want it.",
            is: "Hvert kort sýnir stöðuna, þróunina frá gærdeginum, og aðgerðina á mannamáli — t.d. „Clear for full session“. Rökin (mótdæmi, drivers, öryggi) liggja alltaf einum smelli undir ákvörðuninni; þú þarft ekki að opna þau, þau eru þarna þegar þú vilt.",
          },
        ],
      },
      {
        heading: { en: "Daily Briefing — trust the confidence", is: "Daily Briefing — treystu örygginu" },
        body: [
          {
            en: "Opening “Show details” expands the full morning briefing. The bottom line matters most: it states how many check-ins are missing. The system gives a verdict and in the same breath says how thin the data behind it is — so you know when to trust it and when to look at the pitch yourself.",
            is: "Þegar þú smellir á „Show details“ opnast fullt morgunyfirlit. Neðsta línan skiptir mestu: hún segir hversu margar líðanarskráningar vantar. Kerfið gefur niðurstöðu en segir um leið hversu þunn gögnin á bak við hana eru — svo þú veist hvenær þú átt að treysta því og hvenær þú átt að horfa sjálfur á völlinn.",
          },
        ],
      },
      {
        heading: { en: "What you keep fed", is: "Hvað þú þarft að halda við" },
        body: [
          {
            en: "Today reads everything automatically, but only what arrives. Five small inputs keep the day accurate: player check-ins (players, ~15 s before training — your job is the reminder), week setup (once a week), match minutes (after each match), injuries (log when they happen), and RPE. If they lapse, confidence drops and Today becomes more cautious than it needs to be.",
            is: "Today les allt sjálfkrafa, en aðeins það sem berst. Fimm lítil inntök halda deginum réttum: líðanarskráning (leikmenn, ~15 sek fyrir æfingu — þitt hlutverk er áminningin), vikuskipulag (einu sinni í viku), leikmínútur (eftir hvern leik), meiðsli (skráð þegar þau verða), og RPE. Ef þau falla niður lækkar öryggið og Today verður varkárara en það þyrfti.",
          },
        ],
      },
      {
        heading: { en: "When to go deeper", is: "Þegar þú vilt fara dýpra" },
        body: [
          {
            en: "You don't need the other pages daily. Open the relevant “Intelligence” page or tab when Today has flagged something and you want to understand why, or when a board or player asks a question that needs the number itself.",
            is: "Þú þarft ekki hinar síðurnar daglega. Opnaðu viðeigandi „Intelligence“-síðu eða flipa þegar Today hefur flaggað eitthvað og þú vilt skilja af hverju, eða þegar stjórn eða leikmaður spyr spurningar sem krefst tölunnar sjálfrar.",
          },
        ],
      },
      {
        heading: { en: "Remember", is: "Muna" },
        body: [
          {
            en: "The system advises, it does not rule. You always have the last word, and if you override a verdict it's logged with a reason. Rules decide, the AI explains — never the other way round.",
            is: "Kerfið gefur tillögu, ekki fyrirskipun. Þú hefur alltaf síðasta orðið, og ef þú hnekkir niðurstöðu er það skráð með ástæðu. Reglurnar ákveða, gervigreindin útskýrir — aldrei öfugt.",
          },
        ],
      },
    ],
  },

  "week-setup": {
    title: { en: "How to use Week setup", is: "Hvernig á að nota Vikuskipulag" },
    intro: {
      en: "The one input that needs configuring rather than just entering. It tells the system what normal load is each day — without it, it can't tell a match from a session.",
      is: "Eina inntakið sem þarf uppsetningu frekar en bara innslátt. Það segir kerfinu hvað er eðlilegt álag hvern dag — án þess getur það ekki aðgreint leik frá æfingu.",
    },
    sections: [
      {
        heading: { en: "Set the week", is: "Settu upp vikuna" },
        body: [
          {
            en: "Pick the season phase, whether there are matches this week, and tag each day relative to match day (MD-3, MD-1…). That tagging governs the whole week's load assessment.",
            is: "Veldu tímabilshluta, hvort leikir eru í vikunni, og merktu hvern dag gagnvart leikdegi (MD-3, MD-1…). Sú merking stýrir öllu álagsmatinu þá vikuna.",
          },
        ],
      },
      {
        heading: { en: "The team-breaks box", is: "Frí-reiturinn" },
        body: [
          {
            en: "Small but important: during a break players get no reminders, missed check-ins don't count against them, and the system doesn't read the break as a collapse in load.",
            is: "Lítill en mikilvægur: á fríi fá leikmenn engar áminningar, vantandi skráningar teljast ekki gegn þeim, og kerfið les fríið ekki sem hrun í álagi.",
          },
        ],
      },
      {
        heading: { en: "How often", is: "Hversu oft" },
        body: [
          {
            en: "Once a week. It's the only regular setup — everything else is just quick entry (match minutes after a match, injuries when they happen).",
            is: "Einu sinni í viku. Það er eina reglulega uppsetningin — allt annað er bara fljótur innsláttur (leikmínútur eftir leik, meiðsli þegar þau verða).",
          },
        ],
      },
    ],
  },

  "load-intelligence": {
    title: { en: "How to use Load Intelligence", is: "Hvernig á að nota Álagsgreiningu" },
    intro: {
      en: "Answers “is the squad building or easing?” — total load and who is spiking.",
      is: "Svarar „er hópurinn að þyngjast eða léttast?“ — heildarálag og hverjir toppa.",
    },
    sections: [
      {
        heading: { en: "The verdict first", is: "Niðurstaðan fyrst" },
        body: [
          {
            en: "Even this deeper page opens with a one-word verdict — e.g. “Building” — and a single sentence naming the players behind it. You read the answer before any numbers.",
            is: "Jafnvel þessi dýpri síða byrjar á niðurstöðu í einu orði — t.d. „Building“ — með einni setningu sem nefnir leikmennina á bak við hana. Þú lest svarið áður en nokkrar tölur koma.",
          },
        ],
      },
      {
        heading: { en: "The jargon is optional", is: "Fagorðin eru valkvæð" },
        body: [
          {
            en: "ACWR and monotony sit behind “Show S&C details” and never interrupt you unless you want them — open them when a board or a player asks for the number itself.",
            is: "ACWR og monotony liggja á bak við „Show S&C details“ og trufla þig ekki nema þú viljir þau — opnaðu þau þegar stjórn eða leikmaður biður um töluna sjálfa.",
          },
        ],
      },
      {
        heading: { en: "When to open it", is: "Hvenær á að opna hana" },
        body: [
          {
            en: "Not daily — open it when Today has flagged a load spike and you want to see who is spiking and by how much.",
            is: "Ekki daglega — opnaðu hana þegar Today hefur flaggað álagstopp og þú vilt sjá hver er að toppa og hversu mikið.",
          },
        ],
      },
    ],
  },

  quadrant: {
    title: { en: "How to use Quadrant Intelligence", is: "Hvernig á að nota Quadrant" },
    intro: {
      en: "External load against internal load, at a glance.",
      is: "Ytra álag á móti innra álagi, í fljótu bragði.",
    },
    sections: [
      {
        heading: { en: "What it shows", is: "Hvað hún sýnir" },
        body: [
          {
            en: "Each player sits in a quadrant of external (GPS / running) against internal (how hard it felt). It answers “who runs a lot but finds it easier — or harder — than usual?”",
            is: "Hver leikmaður situr í reit sem ber saman ytra álag (GPS / hlaup) og innra álag (hversu erfitt það var). Hún svarar „hver hleypur mikið en finnst það léttara — eða þyngra — en venjulega?“",
          },
        ],
      },
      {
        heading: { en: "“Decoupled” is the early warning", is: "„Decoupled“ er snemmbúna viðvörunin" },
        body: [
          {
            en: "When external and internal pull apart — high running but low internal, or the reverse — a player reads as “Decoupled”. That's an early fatigue signal, often before it shows in the daily verdict.",
            is: "Þegar ytra og innra álag draga í sundur — mikið hlaup en lágt innra, eða öfugt — les leikmaður sem „Decoupled“. Það er snemmbúið þreytumerki, oft áður en það birtist í daglegu niðurstöðunni.",
          },
        ],
      },
    ],
  },

  "indoor-load": {
    title: { en: "How to use Indoor Load Intelligence", is: "Hvernig á að nota Indoor Load" },
    intro: {
      en: "Training load in the hall, when there is no GPS.",
      is: "Álag á innanhússæfingu, þegar enginn GPS er til staðar.",
    },
    sections: [
      {
        heading: { en: "How it works", is: "Hvernig hún virkar" },
        body: [
          {
            en: "Computed from the inertial sensors (Pro) — PlayerLoad, high-intensity accelerations/decelerations and change-of-direction — normalised to each player's own recent normal, so an indoor session isn't a blank card.",
            is: "Reiknað úr hröðunarmælum (Pro) — PlayerLoad, hraðar hröðanir/hægðanir og stefnubreytingar — kvarðað á hvers leikmanns eigin nýlega venju, svo innanhússæfing er ekki tómt kort.",
          },
        ],
      },
      {
        heading: { en: "The same layered read", is: "Sami lagskipti lesturinn" },
        body: [
          {
            en: "Open it for indoor sessions where GPS distance is zero. It opens with a verdict; the numbers sit behind a click, like every other page.",
            is: "Opnaðu hana fyrir innanhússæfingar þar sem GPS-vegalengd er núll. Hún byrjar á niðurstöðu; tölurnar liggja á bak við smell, eins og á öllum öðrum síðum.",
          },
        ],
      },
    ],
  },

  "decel-intelligence": {
    title: { en: "How to use Decel Intelligence", is: "Hvernig á að nota Decel Intelligence" },
    intro: {
      en: "Who is absorbing the most braking load and may need eccentric protection.",
      is: "Hver tekur mest bremsuálag og gæti þurft eccentric vörn.",
    },
    sections: [
      {
        heading: { en: "What it shows", is: "Hvað hún sýnir" },
        body: [
          {
            en: "High-intensity decelerations — hard stops — per player. That eccentric braking demand is the injury-relevant signal (McBurnie 2022), not just total running.",
            is: "Hraðar hægðanir — harðar stöðvanir — á hvern leikmann. Það eccentric bremsuálag er merkið sem tengist meiðslum (McBurnie 2022), ekki bara heildarhlaup.",
          },
        ],
      },
      {
        heading: { en: "Who to watch", is: "Hvern á að fylgjast með" },
        body: [
          {
            en: "It flags who is under or over on hard stops versus their own norm. A player spiking on braking load may need eccentric protection before it becomes a strain.",
            is: "Hún flaggar hver er undir eða yfir í hörðum stöðvunum miðað við sína eigin venju. Leikmaður sem toppar í bremsuálagi gæti þurft eccentric vörn áður en það verður tognun.",
          },
        ],
      },
    ],
  },
};
