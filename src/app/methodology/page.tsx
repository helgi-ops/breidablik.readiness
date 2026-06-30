"use client";

/**
 * Methodology / science basis — every hard-coded sport-science threshold in
 * MicroPulse, labelled SOLID (cited) / LITERATURE-INFORMED (debated) / TUNABLE
 * DEFAULT (internal). Operationalises the manifesto: rules decide, AI explains,
 * and every rule shows its basis. Keep this page in sync with the cited files.
 *
 * Every constant below was confirmed against its source file (2026-06).
 */

import { useLang } from "@/lib/lang";

type Tier = "solid" | "informed" | "tunable";
type TX = { EN: string; IS: string };
type Entry = {
  name: TX;
  what: TX;        // plain-language one-liner
  basis: TX;       // citation / where the number comes from
  file: string;    // where it lives in code
  tier: Tier;
  caveat?: TX;     // shown for debated / tunable items
};

const TIER_META: Record<Tier, { label: TX; chip: string; bar: string }> = {
  solid:   { label: { EN: "Solid", IS: "Traust" },                            chip: "bg-emerald-100 text-emerald-700", bar: "border-emerald-300" },
  informed:{ label: { EN: "Literature-informed", IS: "Studd af rannsóknum" }, chip: "bg-amber-100 text-amber-700",      bar: "border-amber-300" },
  tunable: { label: { EN: "Tunable default", IS: "Stillanlegt sjálfgildi" },  chip: "bg-slate-200 text-slate-600",     bar: "border-slate-300" },
};

const ENTRIES: Entry[] = [
  // ── SOLID ──────────────────────────────────────────────────────────────
  {
    tier: "solid",
    name: { EN: "Estimated 1RM (e1RM)", IS: "Áætlað 1RM (e1RM)" },
    what: { EN: "From a logged set, RIR-aware (RIR = 10 − RPE). Epley is the default; Brzycki/Lombardi available.", IS: "Úr skráðu setti, RIR-meðvitað (RIR = 10 − RPE). Epley sjálfgefið; Brzycki/Lombardi í boði." },
    basis: { EN: "Epley 1985 · Brzycki 1993 · Lombardi 1989 (standard formulas)", IS: "Epley 1985 · Brzycki 1993 · Lombardi 1989 (staðlaðar formúlur)" },
    file: "src/lib/client/oneRepMaxFormulas.ts",
  },
  {
    tier: "solid",
    name: { EN: "Velocity-based 1RM (LV profile)", IS: "Hraða-byggt 1RM (LV prófíll)" },
    what: { EN: "1RM from the load–velocity line at each lift's minimum-velocity threshold (e.g. bench 0.15, squat 0.30 m/s).", IS: "1RM út frá álags–hraða línu við lágmarkshraða hverrar lyftu (t.d. bekkpressa 0.15, hnébeygja 0.30 m/s)." },
    basis: { EN: "González-Badillo & Sánchez-Medina 2010 · Banyard 2017", IS: "González-Badillo & Sánchez-Medina 2010 · Banyard 2017" },
    file: "src/lib/lvProfile/index.ts",
  },
  {
    tier: "solid",
    name: { EN: "PR evidence gate (RPE ≥ 9)", IS: "PR-staðfestingarmörk (RPE ≥ 9)" },
    what: { EN: "A set only counts as 1RM/PR evidence at RPE ≥ 9 — self-reported effort is unreliable further from failure.", IS: "Sett telst aðeins 1RM/PR-sönnun við RPE ≥ 9 — sjálfsmat er óáreiðanlegt fjær algjörri þreytu." },
    basis: { EN: "Zourdos 2016 (RIR) · Foster 1998 (RPE). Conservative by design.", IS: "Zourdos 2016 (RIR) · Foster 1998 (RPE). Vísvitandi varfærið." },
    file: "src/lib/client/oneRepMaxFormulas.ts",
  },
  {
    tier: "solid",
    name: { EN: "Confidence & baseline maturity", IS: "Vissa og þroski grunnlínu" },
    what: { EN: "Needs 8 sessions for a mature baseline, full sensitivity at 14. Thin-data signals show as low confidence, never as a verdict.", IS: "Þarf 8 æfingar fyrir þroskaða grunnlínu, fulla næmni við 14. Merki úr þunnum gögnum birtast sem lítil vissa, aldrei sem dómur." },
    basis: { EN: "Operationalises the manifesto: show confidence, don't fake it.", IS: "Útfærir manifestóið: sýndu vissu, ekki falsa hana." },
    file: "src/lib/micropulse/trainingRead/index.ts",
  },
  // ── LITERATURE-INFORMED ────────────────────────────────────────────────
  {
    tier: "informed",
    name: { EN: "ACWR (acute:chronic workload)", IS: "ACWR (bráð:langvinn vinna)" },
    what: { EN: "Reference band ≈ 0.8–1.3; we flag elevated fatigue above 1.3.", IS: "Viðmiðsbil ≈ 0.8–1.3; við merkjum aukna þreytu yfir 1.3." },
    basis: { EN: "Gabbett 2016.", IS: "Gabbett 2016." },
    caveat: { EN: "Heavily debated since 2019 (Impellizzeri 2020; Lolli 2019; Wang 2020). We present ACWR as workload context, NOT an injury predictor.", IS: "Mikið umdeilt frá 2019 (Impellizzeri 2020; Lolli 2019; Wang 2020). Við sýnum ACWR sem álags-samhengi, EKKI meiðsla-spá." },
    file: "src/lib/client/loadQuadrant.ts",
  },
  {
    tier: "informed",
    name: { EN: "Foster monotony & strain", IS: "Foster einsleitni og álag" },
    what: { EN: "Monotony = mean/SD of daily load; strain = total × monotony. Deload recommended at monotony ≥1.5 & strain ≥4000; required at ≥2.0 or ≥6000.", IS: "Einsleitni = meðaltal/staðalfrávik dagálags; álag = heild × einsleitni. Deload ráðlagt við einsleitni ≥1.5 og álag ≥4000; krafist við ≥2.0 eða ≥6000." },
    basis: { EN: "Foster 1998.", IS: "Foster 1998." },
    caveat: { EN: "The formula is Foster's; the composite cutoffs are adapted for a 7-day window and are tunable.", IS: "Formúlan er Fosters; samsettu mörkin eru aðlöguð að 7-daga glugga og eru stillanleg." },
    file: "src/lib/trainer/loadIntelligence.ts",
  },
  {
    tier: "informed",
    name: { EN: "Heavy-lift intensity (≥80% 1RM)", IS: "Þung-lyftu ákefð (≥80% 1RM)" },
    what: { EN: "A set counts as 'heavy' at or above 80% of 1RM.", IS: "Sett telst „þungt“ við 80% af 1RM eða meira." },
    basis: { EN: "Pareja-Blanco 2017 · Schoenfeld 2017.", IS: "Pareja-Blanco 2017 · Schoenfeld 2017." },
    file: "src/lib/trainer/loadIntelligence.ts",
  },
  // ── TUNABLE DEFAULT ────────────────────────────────────────────────────
  {
    tier: "tunable",
    name: { EN: "Heavy-lift weekly cap (25 sets)", IS: "Vikulegt þak þung-lyfta (25 sett)" },
    what: { EN: "Soft weekly cap of ~25 sets ≥80% 1RM before flagging fatigue saturation.", IS: "Mjúkt vikuþak ~25 sett ≥80% 1RM áður en mettun er merkt." },
    basis: { EN: "Internal default — not a specific published number.", IS: "Innra sjálfgildi — ekki ákveðin birt tala." },
    caveat: { EN: "Adjust per athlete and training age.", IS: "Stilltu eftir íþróttamanni og þjálfunaraldri." },
    file: "src/lib/trainer/loadIntelligence.ts",
  },
  {
    tier: "tunable",
    name: { EN: "Velocity-loss match-day caps", IS: "Hraðataps-þök eftir leikdegi" },
    what: { EN: "Stop-set velocity-loss caps tighten toward a match: MD-5/-4 20%, MD-3 15%, MD-2 10%, MD-1/MD+1 5%.", IS: "Hraðataps-þök þrengjast að leik: MD-5/-4 20%, MD-3 15%, MD-2 10%, MD-1/MD+1 5%." },
    basis: { EN: "Internal taper policy — uncited.", IS: "Innri niðurtröppunar-stefna — án tilvitnunar." },
    caveat: { EN: "A sensible default taper; adjust to your model.", IS: "Skynsamleg sjálfgefin niðurtröppun; aðlagaðu að þínu módeli." },
    file: "src/lib/micropulse/trainingGraph/schema.ts",
  },
  {
    tier: "tunable",
    name: { EN: "Game-model demand weights", IS: "Álagsvogir leikstíls" },
    what: { EN: "How each game model (high press, possession, …) taxes each physical quality, used to rank development emphases.", IS: "Hvernig hver leikstíll (hár pressa, boltahald, …) reynir á hvern eiginleika, notað til að raða þróunar-áherslum." },
    basis: { EN: "Internal coaching model — configurable per team.", IS: "Innra þjálfunar-módel — stillanlegt per lið." },
    caveat: { EN: "Calibrate with your S&C coach.", IS: "Kvarðaðu með styrktarþjálfaranum þínum." },
    file: "src/lib/micropulse/trainingRead/catalogue.ts",
  },
  {
    tier: "tunable",
    name: { EN: "Readiness deload defaults", IS: "Sjálfgildi readiness-deload" },
    what: { EN: "A yellow day keeps 85% volume / 90% intensity; a red day becomes recovery.", IS: "Gulur dagur heldur 85% magni / 90% ákefð; rauður dagur verður endurheimt." },
    basis: { EN: "Internal defaults — tunable per readiness band.", IS: "Innri sjálfgildi — stillanleg per readiness-bili." },
    file: "src/lib/client/readinessAdjust.ts",
  },
  {
    tier: "tunable",
    name: { EN: "Movement-signature drift", IS: "Hreyfimynsturs-rek" },
    what: { EN: "Flags a personal-norm drift at ±1.5 SD while calibrating (8–13 sessions), tightening to ±1.0 SD once mature (≥14).", IS: "Merkir frávik frá eigin venju við ±1.5 SF meðan kvarðað er (8–13 æfingar), þrengist í ±1.0 SF við þroska (≥14)." },
    basis: { EN: "Method: Robertson 2017 (personal z-scoring). The SD cutoffs are tuning parameters.", IS: "Aðferð: Robertson 2017 (persónuleg z-skor). SF-mörkin eru stillibreytur." },
    file: "src/lib/micropulse/movementSignature/index.ts",
  },
];

export default function MethodologyPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const t = (o: TX) => (IS ? o.IS : o.EN);
  const tiers: Tier[] = ["solid", "informed", "tunable"];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-600">
        {IS ? "MicroPulse · Aðferðafræði" : "MicroPulse · Methodology"}
      </p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">
        {IS ? "Aðferðafræði og vísindagrunnur" : "Methodology & science basis"}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
        {IS
          ? "Reglur ákveða, gervigreind útskýrir. Hér er grunnurinn fyrir hvern þröskuld í MicroPulse, heiðarlega flokkaður í þrennt: traust (vitnað), studd af rannsóknum (umdeilt) og stillanlegt sjálfgildi (innra). Ekkert hér er svartur kassi."
          : "Rules decide, AI explains. Here is the basis for every threshold in MicroPulse, honestly sorted into three tiers: solid (cited), literature-informed (debated), and tunable default (internal). Nothing here is a black box."}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {tiers.map((tier) => (
          <span key={tier} className={`rounded px-2 py-0.5 text-[11px] font-semibold ${TIER_META[tier].chip}`}>
            {t(TIER_META[tier].label)}
          </span>
        ))}
      </div>

      <div className="mt-6 space-y-8">
        {tiers.map((tier) => {
          const items = ENTRIES.filter((e) => e.tier === tier);
          return (
            <section key={tier}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                {t(TIER_META[tier].label)}
              </h2>
              <div className="space-y-3">
                {items.map((e) => (
                  <div key={e.file + t(e.name)} className={`rounded-xl border-l-4 ${TIER_META[tier].bar} border border-slate-200 bg-white p-4 shadow-sm`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-slate-900">{t(e.name)}</span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${TIER_META[tier].chip}`}>
                        {t(TIER_META[tier].label)}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{t(e.what)}</p>
                    <p className="mt-1 text-[12px] text-slate-500">
                      <span className="font-semibold">{IS ? "Grunnur: " : "Basis: "}</span>{t(e.basis)}
                    </p>
                    {e.caveat && (
                      <p className="mt-1 text-[12px] text-amber-700">
                        <span className="font-semibold">{IS ? "Fyrirvari: " : "Caveat: "}</span>{t(e.caveat)}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[10px] text-slate-400">{e.file}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 border-t border-slate-200 pt-4 text-[12px] text-slate-500">
        {IS
          ? "Þröskuldar merktir „stillanlegt sjálfgildi“ eru upphafsgildi sem þjálfarar geta breytt — þeir eru ekki fastir öryggismörk. Við uppfærum þessa síðu þegar rökin breytast."
          : "Thresholds marked “tunable default” are starting values coaches can change — they are not fixed safety limits. We update this page whenever the basis changes."}
      </p>
    </div>
  );
}
