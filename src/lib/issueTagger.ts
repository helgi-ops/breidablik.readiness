// src/lib/issueTagger.ts
export type IssueTag =
  | "HIP_STIFFNESS"
  | "CALF_ACHILLES_SORENESS"
  | "HAMSTRING_TIGHTNESS"
  | "ANTERIOR_KNEE_PAIN"
  | "LOW_BACK_TIGHTNESS"
  | "ADDUCTOR_GROIN"
  | "SHIN_ANKLE_SORENESS"
  | "SHOULDER_TIGHTNESS"
  | "NECK_UPPER_BACK_TENSION"
  | "CAUTION_NEURO";

type Hit = { tag: IssueTag; score: number; reasons: string[] };

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[\u00C0-\u024F]/g, (m) => m.normalize("NFD").replace(/[\u0300-\u036f]/g, "")) // strip accents
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, patterns: (string | RegExp)[]) {
  return patterns.some((p) => (typeof p === "string" ? text.includes(p) : p.test(text)));
}

function countHits(text: string, patterns: (string | RegExp)[]) {
  let n = 0;
  for (const p of patterns) {
    if (typeof p === "string") {
      if (text.includes(p)) n++;
    } else {
      if (p.test(text)) n++;
    }
  }
  return n;
}

export function extractIssueTags(commentRaw: string, maxTags = 3) {
  const text = norm(commentRaw);

  if (!text) return { tags: [] as IssueTag[], debug: { text, hits: [] as Hit[] } };

  // ---- Negation / “allt gott” filters (mjög einfalt)
  const negation = [
    "engin eymsli",
    "ekki eymsli",
    "engin verk",
    "ekki verk",
    "ekkert ad",
    "allt i lagi",
    "allt fint",
  ];
  const isMostlyNegated = hasAny(text, negation);

  // ---- Symptom words (gefa “raunveruleika” stig)
  const symptom = [
    "stif",
    "stifleik",
    "eymsl",
    "verk",
    "sart",
    "pirr",
    "tog",
    "togn",
    "spenna",
    "threytt", // mild
  ];

  // ---- Neuro caution (ef “dofi/stingur” => CAUTION_NEURO)
  const neuro = ["dofi", "sting", "leidni", "skjota", "doða"];

  // ---- Bodypart stems/patterns (nota stofna til að ná beygingum)
  const rules: { tag: IssueTag; body: (string | RegExp)[]; boost?: (string | RegExp)[] }[] = [
    {
      tag: "HIP_STIFFNESS",
      body: ["mjadm", "mjodm", "mjordm", "nar", "nari", "mjadmabeygj", "psoas", "iliopsoas"],
      boost: ["framan i mj", "framan i mjad", "framan i mjod"],
    },
    {
      tag: "CALF_ACHILLES_SORENESS",
      body: ["kalf", "hasin", "hasi", "achilles", "akilles", "aftan i okkl", "okkl"],
      boost: ["kalfaverk", "hasinaverk"],
    },
    {
      tag: "HAMSTRING_TIGHTNESS",
      body: ["aftan i laer", "hamstring", "laeri aftan", "biceps femoris"],
    },
    {
      tag: "ANTERIOR_KNEE_PAIN",
      body: ["hne", "hneskel", "patella", "patellar", "hneskeljarsin", "framan i hne"],
    },
    {
      tag: "LOW_BACK_TIGHTNESS",
      body: ["mjobak", "bakverk", "verk i baki", "bakið".replace("ð", "d"), "stifur i baki"],
    },
    {
      tag: "ADDUCTOR_GROIN",
      body: ["innanvert", "innan i laer", "adductor", "adductor".replace("dd", "d"), "adfaer", "adfaerslu", "nar"],
      boost: ["togn", "tog"],
    },
    {
      tag: "SHIN_ANKLE_SORENESS",
      body: ["skoflung", "shin", "okkl", "okl", "framhluti skofl", "beinverk framan"],
    },
    {
      tag: "SHOULDER_TIGHTNESS",
      body: ["oxl", "oxl".replace("x", "ks"), "herd", "herdabl", "rotator", "cuff", "imping"],
    },
    {
      tag: "NECK_UPPER_BACK_TENSION",
      body: ["hals", "hnakki", "efra bak", "milli herdabl", "spenna i"],
    },
  ];

  const symptomHits = countHits(text, symptom);
  const neuroHit = hasAny(text, neuro);

  const hits: Hit[] = [];

  for (const r of rules) {
    const bodyHits = countHits(text, r.body);
    if (bodyHits === 0) continue;

    const boostHits = r.boost ? countHits(text, r.boost) : 0;

    // scoring: bodypart + symptom + boost
    let score = bodyHits * 3 + symptomHits * 2 + boostHits * 2;

    // mild penalty ef comment er “negated”
    if (isMostlyNegated) score -= 3;

    hits.push({
      tag: r.tag,
      score,
      reasons: [
        `bodyHits=${bodyHits}`,
        `symptomHits=${symptomHits}`,
        `boostHits=${boostHits}`,
        isMostlyNegated ? "negation=true" : "negation=false",
      ],
    });
  }

  // Neuro caution tag (bætum sem “aukamerki” ef eitthvað fannst)
  if (neuroHit && hits.length > 0) {
    hits.push({ tag: "CAUTION_NEURO", score: 99, reasons: ["neuro=true"] });
  }

  hits.sort((a, b) => b.score - a.score);

  // velja top tags (sleppa lágu noise)
  const tags: IssueTag[] = [];
  for (const h of hits) {
    if (tags.length >= maxTags) break;
    if (h.tag !== "CAUTION_NEURO" && h.score < 4) continue; // noise gate
    if (!tags.includes(h.tag)) tags.push(h.tag);
  }

  return { tags, debug: { text, hits } };
}
