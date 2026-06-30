/**
 * Blog / fræðslugreinar fyrir MicroPulse heimasíðu.
 *
 * Hvert grein hefur IS og EN útgáfur. Efnið er geymt sem
 * Markdown-lík strengir sem birtast á /blog/[slug].
 */

export interface BlogArticle {
  slug: string;
  date: string;
  readMin: number;
  category: "meidslafovarnir" | "alagsstjornun" | "thjalfunarfraedi";
  author: string;
  titleIS: string;
  titleEN: string;
  summaryIS: string;
  summaryEN: string;
  audience: "players" | "coaches" | "both";
  sectionsIS: { heading: string; body: string }[];
  sectionsEN: { heading: string; body: string }[];
}

export const CATEGORY_LABELS: Record<BlogArticle["category"], { is: string; en: string; color: string }> = {
  meidslafovarnir: { is: "Meiðslaforvarnir", en: "Injury Prevention", color: "emerald" },
  alagsstjornun: { is: "Álagsstjórnun", en: "Load Management", color: "blue" },
  thjalfunarfraedi: { is: "Þjálfunarfræði", en: "Training Science", color: "purple" },
};

export const AUDIENCE_LABELS: Record<BlogArticle["audience"], { is: string; en: string }> = {
  players: { is: "Leikmenn", en: "Players" },
  coaches: { is: "Þjálfarar", en: "Coaches" },
  both: { is: "Leikmenn & þjálfarar", en: "Players & Coaches" },
};

export const ARTICLES: BlogArticle[] = [
  {
    slug: "met-taekni-meidslafovarnir",
    date: "2026-04-06",
    readMin: 5,
    category: "meidslafovarnir",
    author: "MicroPulse",
    audience: "both",
    titleIS: "MET tækni: Hvernig muscle energy technique dregur \u00far mei\u00f0slah\u00e6ttu",
    titleEN: "MET Technique: How Muscle Energy Technique Reduces Injury Risk",
    summaryIS:
      "Muscle Energy Technique (MET) er ein \u00e1hrifa\u00edr\u00edkasta lei\u00f0in til a\u00f0 b\u00e6ta hreyfigetu og draga \u00far v\u00f6\u00f0vaspennu. H\u00e9r er hvernig og hvers vegna h\u00fan virkar.",
    summaryEN:
      "Muscle Energy Technique (MET) is one of the most effective ways to improve range of motion and reduce muscle tension. Here is how and why it works.",
    sectionsIS: [
      {
        heading: "Hva\u00f0 er MET?",
        body: `Muscle Energy Technique (MET) er virk teygjua\u00f0fer\u00f0 \u00fear sem leikma\u00f0urinn beitir v\u00e6gri spennu gegn vi\u00f0n\u00e1mi \u00ed 5\u20136 sek\u00fandur, slappnar s\u00ed\u00f0an af og fer d\u00fdpra \u00ed teygjuna. \u00d3l\u00edkt hef\u00f0bundnum teygjum er leikma\u00f0urinn virkur \u00fe\u00e1tttakandi \u2014 v\u00f6\u00f0vinn dregst saman \u00e1\u00f0ur en hann slappnar af, sem virkjar Golgi-sinavi\u00f0br\u00f6g\u00f0 og leyfir meiri lengingu.

MET er ekki n\u00fd hugmynd; h\u00fan hefur veri\u00f0 notu\u00f0 af sj\u00fakra\u00fej\u00e1lfurum \u00ed \u00e1ratugi. N\u00fdjustu ranns\u00f3knirnar s\u00fdna \u00fe\u00f3 a\u00f0 h\u00fan er s\u00e9rstaklega \u00e1hrifa\u00edr\u00edk sem hluti af warm-up og cool-down hj\u00e1 \u00ed\u00fer\u00f3ttaf\u00f3lki til a\u00f0 koma \u00ed veg fyrir \u00e1verka \u00e1 v\u00f6\u00f0vum og li\u00f0\u00fe\u00f3fi.`,
      },
      {
        heading: "Hvers vegna er MET betri en passive teygja?",
        body: `Passive teygja (halda kyrrt \u00ed 30 sek) eykur t\u00edmabundi\u00f0 range of motion, en ranns\u00f3knir s\u00fdna a\u00f0 v\u00f6\u00f0vinn gleymir henni flj\u00f3tt. MET er \u00f6\u00f0ruv\u00edsi vegna \u00feess a\u00f0 h\u00fan notar isometric samdra\u00e1tt sem sendir taugamerki til mi\u00f0taugakerfis \u2014 a\u00f0 n\u00fa s\u00e9 \u00f3h\u00e6tt a\u00f0 lengja. \u00deetta skilar varanlegri lengingu og virkari hreyfigetu.

Ranns\u00f3kn fr\u00e1 Journal of Sports Rehabilitation (2019) s\u00fdndi a\u00f0 4 vikna MET protocol j\u00f3k hamstring lengd um 12% meira en passive stretching hj\u00e1 f\u00f3tboltam\u00f6nnum. Mei\u00f0slat\u00ed\u00f0ni \u00e1 hamstring l\u00e6kka\u00f0i um 31% \u00e1 t\u00edmbilinu.`,
      },
      {
        heading: "Hvernig nota leikmenn MET \u00ed MicroPulse?",
        body: `\u00deegar leikma\u00f0ur merkir \u00ed check-in a\u00f0 hann finni til \u00ed tilteknum v\u00f6\u00f0vah\u00f3pi, sendir MicroPulse kerfi\u00f0 vi\u00f0eigandi MET-\u00e6fingu \u00e1 Today s\u00ed\u00f0una hans. Til d\u00e6mis: ef leikma\u00f0ur skrifar \u00abst\u00edfur aftan \u00ed l\u00e6ri\u00bb f\u00e6r hann Hamstring MET protocol \u2014 3 \u00d7 5 sek spenna gegn vi\u00f0n\u00e1mi, s\u00ed\u00f0an auka teygjuna.

\u00dej\u00e1lfarar sj\u00e1 einnig hva\u00f0a sv\u00e6\u00f0i eru mest flaggu\u00f0 \u00e1 coach dashboard og geta brugist vi\u00f0 me\u00f0 adjusted warm-up fyrir alla h\u00f3pinn.`,
      },
      {
        heading: "MET \u00ed stuttu m\u00e1li",
        body: "1) Far\u00f0u \u00ed teygjust\u00f6\u00f0u. 2) Spenndu gegn vi\u00f0n\u00e1mi \u00ed 5 sek (~20\u201330% af max). 3) Slakka\u00f0u \u00e1 og far\u00f0u d\u00fdpra. 4) Endurtaktu 3 sinnum \u00e1 hvora hli\u00f0. \u00deetta tekur 60 sek\u00fandur \u00e1 hvern v\u00f6\u00f0vah\u00f3p og skilar mun meiri lengingu en sama t\u00edminn \u00ed passive teygju.",
      },
    ],
    sectionsEN: [
      {
        heading: "What is MET?",
        body: `Muscle Energy Technique (MET) is an active stretching method where the athlete applies gentle tension against resistance for 5\u20136 seconds, then relaxes and moves deeper into the stretch. Unlike passive stretching, the athlete is an active participant \u2014 the muscle contracts before relaxing, triggering the Golgi tendon reflex and allowing greater elongation.

MET is not new; physiotherapists have used it for decades. Recent research shows it is particularly effective as part of warm-up and cool-down routines for athletes to prevent muscle and soft-tissue injuries.`,
      },
      {
        heading: "Why is MET better than passive stretching?",
        body: `Passive stretching (hold still for 30 sec) temporarily increases range of motion, but research shows the muscle forgets it quickly. MET works differently because it uses isometric contraction to send neural signals to the central nervous system \u2014 that it is safe to lengthen now. This produces more lasting elongation and active range of motion.

A study from the Journal of Sports Rehabilitation (2019) showed that a 4-week MET protocol increased hamstring length by 12% more than passive stretching in football players. Hamstring injury incidence decreased by 31% over the season.`,
      },
      {
        heading: "How do players use MET in MicroPulse?",
        body: `When a player indicates soreness in a specific muscle group during check-in, MicroPulse sends the appropriate MET exercise to their Today page. For example: if a player writes \u00abstiff behind the thigh\u00bb they receive a Hamstring MET protocol \u2014 3 \u00d7 5 sec tension against resistance, then deepen the stretch.

Coaches also see which areas are most flagged on the coach dashboard and can respond with an adjusted warm-up for the whole group.`,
      },
      {
        heading: "MET in a nutshell",
        body: "1) Get into the stretch position. 2) Push against resistance for 5 sec (~20\u201330% max effort). 3) Relax and go deeper. 4) Repeat 3 times per side. This takes 60 seconds per muscle group and produces far greater elongation than the same time spent in passive stretching.",
      },
    ],
  },

  {
    slug: "acwr-load-management",
    date: "2026-04-04",
    readMin: 6,
    category: "alagsstjornun",
    author: "MicroPulse",
    audience: "coaches",
    titleIS: "ACWR og \u00e1lagsstj\u00f3rnun: Hvernig \u00e1 a\u00f0 st\u00fdra \u00fej\u00e1lfunar\u00e1lagi til a\u00f0 koma \u00ed veg fyrir mei\u00f0sli",
    titleEN: "ACWR and Load Management: How to Manage Training Load to Prevent Injuries",
    summaryIS:
      "Acute:Chronic Workload Ratio (ACWR) er eitt mikilv\u00e6gasta t\u00f3li\u00f0 \u00ed n\u00fat\u00edma \u00ed\u00fer\u00f3ttum til a\u00f0 meta mei\u00f0slah\u00e6ttu. H\u00e9r er hvernig \u00fej\u00e1lfarar geta n\u00fdtt s\u00e9r ACWR \u00e1 \u00e1hrifa\u00edr\u00edkan h\u00e1tt.",
    summaryEN:
      "The Acute:Chronic Workload Ratio (ACWR) is one of the most important tools in modern sport for assessing injury risk. Here is how coaches can use it effectively.",
    sectionsIS: [
      {
        heading: "Hva\u00f0 er ACWR?",
        body: `ACWR er hlutfall milli n\u00fdlegs \u00e1lags (acute, s\u00ed\u00f0ustu 7 dagar) og langt\u00edma\u00e1lags (chronic, s\u00ed\u00f0ustu 28 dagar). Ef hlutfalli\u00f0 er 1.0 \u00fe\u00fd\u00f0ir \u00fea\u00f0 a\u00f0 leikma\u00f0ur er a\u00f0 \u00fej\u00e1lfast \u00e1 sama stigi og hann hefur veri\u00f0 undanfarnar vikur.

Tim Gabbett og samstarfsf\u00f3lk vins\u00e6ldu bili\u00f0 0.8\u20131.3 sem \u201evenjulegt" \u00e1lagsbreytinga-bil. En ACWR er ekki sta\u00f0fest mei\u00f0sla-sp\u00e1 \u2014 n\u00fdrri ranns\u00f3knir (Impellizzeri o.fl. 2020) s\u00fdna a\u00f0 \u00fea\u00f0 er t\u00f6lfr\u00e6\u00f0ilega galla\u00f0 og sp\u00e1ir ekki \u00e1rei\u00f0anlega fyrir um mei\u00f0sli. R\u00e9ttari lesning: ACWR m\u00e6lir ST\u00c6R\u00d0 \u00e1lagsst\u00f6kks. \u00dea\u00f0 sem raunverulega skiptir m\u00e1li fyrir mei\u00f0sli er hvort st\u00f6kki\u00f0 \u00fdtir \u00ed\u00fer\u00f3ttamanninum inn \u00e1 \u00f3\u00feekkt \u00e1lag sem l\u00edkaminn er ekki undirb\u00fainn fyrir (Gabbett & Hulin 2016 \u2014 \u201e\u00fea\u00f0 er ekki \u00e1lagi\u00f0 sj\u00e1lft heldur hvernig \u00fe\u00fa kemst \u00feanga\u00f0").`,
      },
      {
        heading: "Hvers vegna load spikes eru h\u00e6ttulegir",
        body: `Algengasta mei\u00f0slaors\u00f6kin \u00ed h\u00f3p\u00ed\u00fer\u00f3ttum er skyndileg aukning \u00e1 \u00fej\u00e1lfunar\u00e1lagi \u2014 svokalla\u00f0ir load spikes. D\u00e6mi: leikma\u00f0ur kemur af mei\u00f0slum e\u00f0a fr\u00edi og fer beint \u00ed fullrar \u00e6fingar. ACWR hans fer fr\u00e1 0.5 upp \u00ed 1.8 \u00e1 einni viku.

\u00deetta \u00e1 ekki bara vi\u00f0 um GPS-\u00e1lag heldur l\u00edka RPE (perceived exertion). MicroPulse reiknar ACWR \u00fat fr\u00e1 b\u00e6\u00f0i GPS acute/chronic load og RPE-g\u00f6gnum til a\u00f0 gefa heildarbynd.`,
      },
      {
        heading: "Hvernig nota \u00fej\u00e1lfarar ACWR \u00ed MicroPulse?",
        body: `\u00c1 coach dashboard s\u00e9st ACWR fyrir hvern leikmann me\u00f0 litak\u00f3\u00f0um: bl\u00e1r (< 0.8, l\u00edti\u00f0 \u00e1lag), gr\u00e6nn (0.8\u20131.3, kj\u00f6rsv\u00e6\u00f0i), gulur (1.3\u20131.5, h\u00e6kka\u00f0), rau\u00f0ur (> 1.5, h\u00e1tt). \u00dej\u00e1lfarar geta s\u00e9\u00f0 trend yfir vikur og brugist vi\u00f0 \u00e1\u00f0ur en \u00e1lag ver\u00f0ur of miki\u00f0.

Kerfi\u00f0 flaggar l\u00edka sj\u00e1lfvirkt leikmenn sem eru \u00ed danger zone og leggur til reduced load e\u00f0a batadag. \u00deetta er s\u00e9rstaklega gagnlegt \u00e1 \u00fe\u00e9ttum leikt\u00edmabilum \u00fear sem bati milli leikja er stutt.`,
      },
      {
        heading: "R\u00e1\u00f0leggingar",
        body: "Aldrei auka viku\u00e1lag um meira en 10% fr\u00e1 viku til viku. Halda ACWR \u00e1 bilinu 0.8\u20131.3 eins og h\u00e6gt er. Nota chronic load sem fitness shield \u2014 leikmenn sem eru vel \u00fej\u00e1lfa\u00f0ir (h\u00e6rra chronic load) \u00feola meira acute \u00e1lag. Fylgjast s\u00e9rstaklega me\u00f0 leikm\u00f6nnum sem koma af mei\u00f0slum e\u00f0a fr\u00edum \u2014 \u00feeir hafa l\u00e6gra chronic load og eru vi\u00f0kv\u00e6mari.",
      },
    ],
    sectionsEN: [
      {
        heading: "What is ACWR?",
        body: `ACWR is the ratio between recent workload (acute, last 7 days) and long-term workload (chronic, last 28 days). A ratio of 1.0 means the player is training at the same level they have been over recent weeks.

Tim Gabbett and colleagues popularised the 0.8\u20131.3 band as a "familiar" load-change range. But ACWR is not a validated injury predictor \u2014 later work (Impellizzeri et al. 2020) shows it is statistically flawed and does not reliably forecast injury. The honest reading: ACWR measures the SIZE of a load spike. What actually matters for injury is whether that spike pushes the athlete into unfamiliar load their body isn't prepared for (Gabbett & Hulin 2016 \u2014 "it's not the workload itself, but how you get there").`,
      },
      {
        heading: "Why spikes are dangerous",
        body: `The most common injury cause in team sports is a sudden increase in training load \u2014 so-called load spikes. Example: a player returns from injury or break and goes straight into full training. Their ACWR goes from 0.5 to 1.8 in one week.

This applies not only to GPS load but also RPE (perceived exertion). MicroPulse calculates ACWR from both GPS acute/chronic load and RPE data to provide a complete picture.`,
      },
      {
        heading: "How coaches use ACWR in MicroPulse",
        body: `On the coach dashboard, ACWR for each player is shown with color codes: blue (< 0.8, low load), green (0.8\u20131.3, optimal zone), yellow (1.3\u20131.5, elevated), red (> 1.5, high). Coaches can see trends over weeks and respond before load becomes excessive.

The system also automatically flags players in the danger zone and suggests reduced load or recovery days. This is especially useful during congested fixture periods where recovery time between matches is short.`,
      },
      {
        heading: "Key recommendations",
        body: "Never increase weekly load by more than 10% week-to-week. Keep ACWR between 0.8\u20131.3 as much as possible. Use chronic load as a fitness shield \u2014 well-trained players (higher chronic load) tolerate more acute load. Pay special attention to players returning from injury or breaks \u2014 they have lower chronic load and are more vulnerable.",
      },
    ],
  },

  {
    slug: "ssg-design-thjalfun",
    date: "2026-04-02",
    readMin: 5,
    category: "thjalfunarfraedi",
    author: "MicroPulse",
    audience: "coaches",
    titleIS: "Small-Sided Games: Hvernig leikmannfj\u00f6ldi og vellirst\u00e6r\u00f0 breyta \u00e1laginu",
    titleEN: "Small-Sided Games: How Player Count and Pitch Size Change the Training Stimulus",
    summaryIS:
      "Small-sided games (SSG) eru kjarninn \u00ed n\u00fat\u00edma f\u00f3tbolta\u00fej\u00e1lfun. En hvernig breytir 3v3 \u00e1 litlum velli samanbori\u00f0 vi\u00f0 5v5 \u00e1 st\u00f3rum? H\u00e9r er ranns\u00f3knin \u00e1 bak vi\u00f0 drill-h\u00f6nnunina.",
    summaryEN:
      "Small-sided games (SSG) are the backbone of modern football training. But how does 3v3 on a small pitch compare to 5v5 on a large one? Here is the science behind drill design.",
    sectionsIS: [
      {
        heading: "Af hverju SSG?",
        body: `Small-sided games eru leikjatengd \u00fej\u00e1lfun \u00fear sem leikmenn \u00fej\u00e1lfast \u00ed minni h\u00f3pum \u00e1 minna sv\u00e6\u00f0i. Ranns\u00f3knir s\u00fdna a\u00f0 SSG \u00fej\u00e1lfa b\u00e6\u00f0i l\u00edkamlega (aerobic/anaerobic) og t\u00e6knilega \u00fe\u00e6tti samtimis \u2014 eitthva\u00f0 sem hef\u00f0bundin \u00fej\u00e1lfun n\u00e6r ekki.

Kosturinn er a\u00f0 leikma\u00f0urinn f\u00e6r miklu fleiri snertingar \u00e1 boltann, fleiri 1v1 a\u00f0st\u00e6\u00f0ur, og h\u00e6rri hjartsl\u00e1ttart\u00ed\u00f0ni en \u00ed 11v11 leik \u00e1 sama t\u00edma.`,
      },
      {
        heading: "Leikmannafjoldi og \u00e1hrif",
        body: `F\u00e6rri leikmenn = h\u00e6rra \u00e1lag \u00e1 hvern. 2v2 og 3v3 er n\u00e1l\u00e6gt 90% af HRmax, \u00e1 me\u00f0an 5v5 og 6v6 liggur n\u00e6r 80\u201385% HRmax. En \u00feetta er ekki jafn einfalt og \u00fea\u00f0 hlj\u00f3mar \u2014 flatarm\u00e1l \u00e1 leikmann skiptir miklu m\u00e1li.

Ef \u00fe\u00fa ert me\u00f0 3v3 \u00e1 mj\u00f6g litlum velli (< 50 m\u00b2 per leikmann) ver\u00f0ur leikurinn boltahald og stutt sprettir. Ef v\u00f6llurinn er st\u00f3r (> 150 m\u00b2 per leikmann) ver\u00f0a meiri langar hlaup og aerobic \u00e1lag.`,
      },
      {
        heading: "Flatarm\u00e1l per leikmann \u2014 gullna reglan",
        body: `Systematic review fr\u00e1 Sarmento et al. (2018) s\u00fdndi a\u00f0 gullna sv\u00e6\u00f0i\u00f0 fyrir h\u00e1marks \u00e1lag er 75\u2013150 m\u00b2 per leikmann. Undir 75 m\u00b2 minnkar hlaup\u00e1lag (of \u00fe\u00e9tt), yfir 200 m\u00b2 minnkar intensity vegna \u00feess a\u00f0 a\u00f0ger\u00f0ir ver\u00f0a of dreifar.

MicroPulse drill-v\u00e9lsmi\u00f0ja reiknar \u00feetta sj\u00e1lfvirkt: \u00fe\u00fa sl\u00e6r inn leikmannafjolda og vellirst\u00e6r\u00f0 og kerfi\u00f0 gefur estimated %HRmax, hra\u00f0apr\u00f3f\u00edl og \u00e1lagsflokk.`,
      },
      {
        heading: "Hagn\u00fdt r\u00e1\u00f0",
        body: "Viltu h\u00e6rra aerobic \u00e1lag? Auktu vellirst\u00e6r\u00f0ina og minnka\u00f0u leikmannafjolda (3v3 \u00e1 40\u00d730m). Viltu fleiri snertingar og t\u00e6knilegt \u00e1lag? Minnka\u00f0u vellinn og auk leikmannafjolda (5v5 \u00e1 30\u00d720m). Viltu herma eftir leik? 6v6 \u00e1 50\u00d735m er n\u00e1l\u00e6gt raunveruleiknum \u00ed \u00e1lagsformi. Nota\u00f0u MicroPulse SSG reikni\u00e9lina \u00e1 drill flipanum til a\u00f0 sj\u00e1 \u00e1hrif \u00fessara breyta \u00e1\u00f0ur en \u00fe\u00fa hannar \u00e6finguna.",
      },
    ],
    sectionsEN: [
      {
        heading: "Why SSG?",
        body: `Small-sided games are game-based training where players train in smaller groups on reduced pitch sizes. Research shows SSG train both physical (aerobic/anaerobic) and technical aspects simultaneously \u2014 something traditional training cannot match.

The advantage is that each player gets far more touches on the ball, more 1v1 situations, and higher heart rates than in 11v11 play over the same time period.`,
      },
      {
        heading: "Player count and its effects",
        body: `Fewer players = higher load per player. 2v2 and 3v3 reaches close to 90% HRmax, while 5v5 and 6v6 sits around 80\u201385% HRmax. But it is not as simple as it sounds \u2014 area per player matters significantly.

If you run 3v3 on a very small pitch (< 50 m\u00b2 per player), the game becomes ball retention with short sprints. If the pitch is large (> 150 m\u00b2 per player), there are more long runs and aerobic load.`,
      },
      {
        heading: "Area per player \u2014 the golden rule",
        body: `A systematic review by Sarmento et al. (2018) showed the sweet spot for maximum load is 75\u2013150 m\u00b2 per player. Below 75 m\u00b2, running load decreases (too congested). Above 200 m\u00b2, intensity drops because actions become too dispersed.

The MicroPulse drill engine calculates this automatically: you enter player count and pitch size and the system gives you estimated %HRmax, speed profile, and load category.`,
      },
      {
        heading: "Practical tips",
        body: "Want higher aerobic load? Increase pitch size and reduce player count (3v3 on 40\u00d730m). Want more touches and technical load? Shrink the pitch and increase player count (5v5 on 30\u00d720m). Want to simulate match conditions? 6v6 on 50\u00d735m approximates real-match load profile. Use the MicroPulse SSG calculator on the drill tab to preview the effects of these variables before designing your session.",
      },
    ],
  },

  // ── 4. Indoor sports (basketball) ───────────────────────────────────────
  {
    slug: "innanhuss-ithrottir-micropulse",
    date: "2026-04-07",
    readMin: 5,
    category: "alagsstjornun",
    author: "MicroPulse",
    audience: "both",
    titleIS: "MicroPulse fyrir korfubolta: Hvad getur korfubolti notad i kerfinu?",
    titleEN: "MicroPulse for Basketball: What Can Basketball Teams Use?",
    summaryIS:
      "MicroPulse er ekki bara fyrir fotbolta. Korfuboltalidin geta notad naestum alla eiginleika kerfisins med serstokum maeligvordum sem henta innanhuss.",
    summaryEN:
      "MicroPulse is not just for football. Basketball teams can use nearly all system features with sport-specific metrics designed for indoor environments.",
    sectionsIS: [
      {
        heading: "Innanhuss vs utanhuss: Hvad breytist?",
        body: `Stasti munurinn er GPS-maeligvardarnir. Utanhuss (fotbolti) notar hradasvid, sprettvegalengd og metabolic power. Innanhuss er GPS-merki of veikt fyrir thessa maeligvarda, svo vid notum i stadiinn Player Load, IMA (Inertial Movement Analysis) og COD (Changes of Direction).

Player Load er hrodunarbyggdur maeligvardi sem virkar vel innanhuss. IMA maelikvardar greina hradnun, haegdun og stefnubreytingar sem eru lydandi i korfubolta. Thetta gefur thjalfurum heildarmynd af alagi a hvern leikmann, jafnvel than GPS-merki er ekki til stadhar.`,
      },
      {
        heading: "Korfubolti i MicroPulse",
        body: `Korfuboltalidin sja: Player Load, PL/min, IMA COD, IMA Accels/Decels, Max Velocity, Total Distance og Jump Count. ACWR er reiknud ut fra Player Load i stad heildarvegalengdar.

Algengir meidslahlutar i korfubolta eru hne (anterior knee pain), kalfi/Achilles, mjobak og mjodm. Fix modules kerfid sendir vidheignadi MET-aefingar thegar leikmadur merkir vid thessi svaedi.

SSG reiknivelin a ekki vid i korfubolta, en allir adrir eiginleikar virka: check-in, RPE, FULL/REDUCED/RECOVERY, VALD kraftplata, VBT/GymAware og Adaptive Training Engine.`,
      },
      {
        heading: "Hvad er eins og hvad er olikur?",
        body: `Eins: Daglegt check-in, RPE, ACWR (ut fra Player Load), FULL/REDUCED/RECOVERY, fix modules, VALD CMJ, VBT, Adaptive Training Engine, leikvikulotur (MD-/+).

Olikur: Fotbolti notar hradasvid, sprint distance og metabolic load score sem eiga ekki vid innanhuss. Korfubolti notar PL/min, IMA maeligvarda og stokkfjoldi. SSG drill reiknivelin er adheins fyrir fotbolta.

Catapult indoor tenging virkar fyrir korfubolta. Kinexon tenging er i throdun.`,
      },
    ],
    sectionsEN: [
      {
        heading: "Indoor vs outdoor: What changes?",
        body: `The biggest difference is GPS metrics. Outdoor (football) uses velocity bands, sprint distance and metabolic power. Indoor GPS signal is too weak for these metrics, so we use Player Load, IMA (Inertial Movement Analysis) and COD (Changes of Direction) instead.

Player Load is an acceleration-based metric that works well indoors. IMA metrics detect acceleration, deceleration and direction changes that are key in basketball. This gives coaches a complete picture of load per player, even without GPS signal.`,
      },
      {
        heading: "Basketball in MicroPulse",
        body: `Basketball teams see: Player Load, PL/min, IMA COD, IMA Accels/Decels, Max Velocity, Total Distance and Jump Count. ACWR is calculated from Player Load instead of total distance.

Common basketball injury areas are knee (anterior knee pain), calf/Achilles, lower back and hip. The fix modules system sends appropriate MET exercises when a player indicates soreness in these areas.

The SSG calculator does not apply to basketball, but all other features work: check-in, RPE, FULL/REDUCED/RECOVERY, VALD force plate, VBT/GymAware and Adaptive Training Engine.`,
      },
      {
        heading: "What is the same and what is different?",
        body: `Same: Daily check-in, RPE, ACWR (from Player Load), FULL/REDUCED/RECOVERY, fix modules, VALD CMJ, VBT, Adaptive Training Engine, match-week periodization (MD-/+).

Different: Football uses velocity bands, sprint distance and metabolic load score which do not apply indoors. Basketball uses PL/min, IMA metrics and jump count. The SSG drill calculator is football-only.

Catapult indoor integration works for basketball. Kinexon integration is in development.`,
      },
    ],
  },
];

export function getArticleBySlug(slug: string): BlogArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
