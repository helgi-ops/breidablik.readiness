"use client";

/**
 * SquadVerdictBanner — the explainability-first header for the Squad tab.
 *
 * One plain read of the squad today (traffic-light counts from the canonical
 * v_coach_readiness_today_v8.final_color the dashboard already shows) + what to do,
 * with every "flag" surfaced as a named driver chip whose jargon lives in a tooltip,
 * and a "how to read this tab" glossary one click away. Rules decide; this only renders
 * — synthesised from the SAME counts + flag stats the tab already computed (no new data).
 */

import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import VerdictBanner, { type VerdictTone, type VerdictDriver } from "@/components/coach/VerdictBanner";

type Bi = { EN: string; IS: string };
export type SquadCounts = { green: number; yellow: number; red: number };
export type SquadFlags = {
  lowReadiness: number;
  painFlag: number;
  highNeuralLoad: number;
  neuralBiasApplied: number;
  highNextDayRisk: number;
  manualReview: number;
  lockedRows: number;
};

// Each flag: plain label + the tooltip that carries the jargon, and its chip tone.
const FLAG_META: { key: keyof SquadFlags; label: Bi; tone: VerdictTone; tip: Bi }[] = [
  { key: "lowReadiness", label: { EN: "Low readiness", IS: "Lág readiness" }, tone: "concern",
    tip: { EN: "Readiness sits below the player's own norm today (yellow or red).", IS: "Readiness er undir eigin viðmiðun leikmanns í dag (gult eða rautt)." } },
  { key: "painFlag", label: { EN: "Pain", IS: "Verkur" }, tone: "concern",
    tip: { EN: "The player reported pain in their check-in — review before training.", IS: "Leikmaður tilkynnti verk í innskráningu — skoða fyrir æfingu." } },
  { key: "highNeuralLoad", label: { EN: "Neural load", IS: "Taugaálag" }, tone: "watch",
    tip: { EN: "Recent high-speed / impact load points to nervous-system fatigue.", IS: "Nýlegt hraða- / högg-álag bendir til þreytu í taugakerfi." } },
  { key: "neuralBiasApplied", label: { EN: "Neural adjust", IS: "Tauga-aðlögun" }, tone: "watch",
    tip: { EN: "The engine eased today's session for accumulated neural load.", IS: "Vélin léttti lotu dagsins vegna uppsafnaðs taugaálags." } },
  { key: "highNextDayRisk", label: { EN: "Next-day risk", IS: "Áhætta á morgun" }, tone: "watch",
    tip: { EN: "Tomorrow projects as a high-load day — plan recovery in.", IS: "Á morgun stefnir í há-álagsdag — skipuleggðu endurheimt." } },
  { key: "manualReview", label: { EN: "Manual review", IS: "Handvirk yfirferð" }, tone: "neutral",
    tip: { EN: "Flagged for a coach to review by hand rather than auto-decided.", IS: "Merkt fyrir handvirka yfirferð þjálfara í stað sjálfvirkrar ákvörðunar." } },
  { key: "lockedRows", label: { EN: "Locked", IS: "Læst" }, tone: "neutral",
    tip: { EN: "Cards you locked so the decision engine won't overwrite them.", IS: "Kort sem þú læstir svo ákvörðunarvélin skrifi ekki yfir þau." } },
];

const GLOSSARY: { title: Bi; body: Bi }[] = [
  { title: { EN: "Traffic light (readiness)", IS: "Umferðarljós (readiness)" },
    body: { EN: "Green = full training, yellow = modified (reduced volume/intensity), red = recovery. It compares today's check-in to the player's OWN norm — not a diagnosis. Source: the same readiness the Daily Briefing shows.", IS: "Grænt = full æfing, gult = breytt (minna magn/ákefð), rautt = endurheimt. Ber saman innskráningu dagsins við EIGIN viðmiðun leikmanns — ekki sjúkdómsgreining. Heimild: sama readiness og Dagsyfirlitið sýnir." } },
  { title: { EN: "Pain overrides the light", IS: "Verkur trompar ljósið" },
    body: { EN: "A pain flag is a self-report, separate from the colour — a green player can still report pain. Always review pain first.", IS: "Verkjaflagg er sjálfsmat, aðskilið frá litnum — grænn leikmaður getur samt tilkynnt verk. Skoðaðu alltaf verk fyrst." } },
  { title: { EN: "The flags", IS: "Flöggin" },
    body: { EN: "Neural load / adjust = the engine noticed nervous-system fatigue and may ease the session. Next-day risk = tomorrow looks heavy. Manual review = needs your eyes. Locked = you fixed the card so it won't be overwritten.", IS: "Taugaálag / aðlögun = vélin sá þreytu í taugakerfi og gæti létt lotuna. Áhætta á morgun = morgundagurinn lítur þungt út. Handvirk yfirferð = þarf þín augu. Læst = þú festir kortið svo ekki sé skrifað yfir." } },
];

export default function SquadVerdictBanner({ counts, flags }: { counts: SquadCounts; flags: SquadFlags }) {
  const [lang] = useLang();
  const IS = lang === "IS";
  const pick = (b: Bi) => (IS ? b.IS : b.EN);

  const { green, yellow, red } = counts;
  const total = green + yellow + red;
  const pain = flags.painFlag;

  const drivers: VerdictDriver[] = FLAG_META
    .filter((f) => flags[f.key] > 0)
    .map((f) => ({ label: pick(f.label), tone: f.tone, detail: { EN: String(flags[f.key]), IS: String(flags[f.key]) }, tip: f.tip }));

  const verdict: { tone: VerdictTone; sentence: Bi; subtitle?: Bi; action?: Bi } = (() => {
    if (total === 0) {
      return { tone: "neutral", sentence: { EN: "No readiness data for the squad yet today — it appears as players check in.", IS: "Engin readiness-gögn fyrir liðið enn í dag — birtast þegar leikmenn skrá sig inn." } };
    }
    if (red > 0) {
      return {
        tone: "concern",
        sentence: { EN: `${red} player${red > 1 ? "s" : ""} on recovery (red) today${yellow > 0 ? `, ${yellow} on a modified session` : ""} — start with them.`, IS: `${red} leikmað${red > 1 ? "ur á" : "ur á"} endurheimt (rautt) í dag${yellow > 0 ? `, ${yellow} á breyttri lotu` : ""} — byrjaðu á þeim.` },
        subtitle: pain > 0 ? { EN: `${pain} also reported pain — review those first.`, IS: `${pain} tilkynntu einnig verk — skoðaðu þá fyrst.` } : undefined,
        action: { EN: `Open the red players' cards first and adjust or rest per each. ${green} are green for full training.`, IS: `Opnaðu kort rauðu leikmannanna fyrst og aðlagaðu eða hvíldu eftir hverjum. ${green} eru grænir fyrir fulla æfingu.` },
      };
    }
    if (pain > 0) {
      return {
        tone: "concern",
        sentence: { EN: `${pain} player${pain > 1 ? "s" : ""} reported pain in their check-in — review before training.`, IS: `${pain} leikm. tilkynntu verk í innskráningu — skoða fyrir æfingu.` },
        action: { EN: "A pain flag overrides the traffic light — open those players first.", IS: "Verkjaflagg trompar umferðarljósið — opnaðu þá leikmenn fyrst." },
      };
    }
    if (yellow > 0) {
      return {
        tone: "watch",
        sentence: { EN: `${yellow} player${yellow > 1 ? "s" : ""} need a modified session today; the other ${green} are green.`, IS: `${yellow} leikm. þurfa breytta lotu í dag; hinir ${green} eru grænir.` },
        action: { EN: "Open the yellow cards for the engine's suggested adjustment (usually reduced volume or intensity).", IS: "Opnaðu gulu kortin fyrir ráðlagða aðlögun vélarinnar (yfirleitt minna magn eða ákefð)." },
      };
    }
    return {
      tone: "good",
      sentence: { EN: `All ${green} player${green > 1 ? "s" : ""} ready — full training today.`, IS: `Allir ${green} leikm${green > 1 ? "enn" : "aður"} tilbúnir — full æfing í dag.` },
      action: { EN: "Nothing to adjust — the squad is good to go.", IS: "Ekkert að aðlaga — liðið er klárt." },
    };
  })();

  return (
    <div className="space-y-3">
      <VerdictBanner
        lang={IS ? "IS" : "EN"}
        kicker={IS ? "Lið" : "Squad"}
        tone={verdict.tone}
        sentence={verdict.sentence}
        subtitle={verdict.subtitle}
        action={verdict.action}
        drivers={drivers}
      />
      <ShowDetails label={{ EN: "How to read this tab", IS: "Hvernig á að lesa þennan flipa" }}>
        <div className="grid gap-3 text-[12px] leading-relaxed text-slate-600 sm:grid-cols-3">
          {GLOSSARY.map((t) => (
            <div key={t.title.EN}>
              <div className="font-semibold text-slate-800">{pick(t.title)}</div>
              <p>{pick(t.body)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          {IS
            ? "Liturinn er persónu-viðmiðun leikmannsins — sama heimild og Dagsyfirlitið. Rautt/gult ≠ meiðsli; verkjaflagg er aðskilið. Reglur ákveða, ekki AI."
            : "The colour is the player's personal norm — the same source as the Daily Briefing. Red/yellow ≠ injury; the pain flag is separate. Rules decide, not AI."}
        </p>
      </ShowDetails>
    </div>
  );
}
