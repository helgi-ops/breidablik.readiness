"use client";

/**
 * GpsVerdictBanner — the explainability-first header for the GPS tab.
 *
 * GPS is objective external load. The coach's daily question is "how big was this
 * session, and is anyone spiking?" This answers it in one plain line + what to do,
 * derived from the SAME squad averages the tab already computes: today's squad average
 * for the primary metric (total distance, or Player Load for basketball) versus the
 * team's own recent 28-day norm. Sport-aware glossary one click away. Rules decide.
 *
 * All inputs are computed by the caller (where the GPS history + helpers live) and
 * passed in as plain numbers — this component only renders.
 */

import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import VerdictBanner, { type VerdictTone, type VerdictDriver } from "@/components/coach/VerdictBanner";

type Bi = { EN: string; IS: string };

export type GpsVerdictInput = {
  isBasketball: boolean;
  dateLabel: string;
  /** Players with a GPS row for the viewed date. */
  tracked: number;
  /** Active roster size — the coverage denominator. */
  rosterCount: number;
  /** Plain name of the primary metric being judged. */
  primaryLabel: Bi;
  /** Today's squad average of the primary metric (null = no data). */
  todayAvg: number | null;
  /** todayAvg ÷ the team's recent 28-day norm (null = not enough history). */
  ratio: number | null;
  /** Top movers by the primary metric today (first names). */
  topMovers: string[];
};

const footballTiles: { title: Bi; body: Bi }[] = [
  { title: { EN: "Total distance", IS: "Heildar vegalengd" }, body: { EN: "Metres covered in the session — the raw volume.", IS: "Metrar farnir í lotunni — hrátt magn." } },
  { title: { EN: "High-speed / Sprint", IS: "Háhraði / Sprettur" }, body: { EN: "Distance run at high and very-high speed (Vel bands 5/6, or HSR/Sprint on Lite). The demanding, injury-relevant running.", IS: "Vegalengd á miklum og mjög miklum hraða (Vel bönd 5/6, eða HSR/Sprettur á Lite). Krefjandi, meiðsla-tengda hlaupið." } },
  { title: { EN: "Accel / Decel efforts", IS: "Hröðunar / hemlunar átök" }, body: { EN: "Count of hard accelerations and brakes (band 2-3, ≥2 m/s²). Mechanical, eccentric load.", IS: "Fjöldi harðra hröðunar og hemlana (band 2-3, ≥2 m/s²). Vélrænt, sérvirkt (eccentric) álag." } },
  { title: { EN: "Max velocity", IS: "Hámarkshraði" }, body: { EN: "Top speed hit (km/h) — a readiness/exposure signal, not a volume.", IS: "Hæsti hraði (km/klst) — merki um viðbúnað/útsetningu, ekki magn." } },
];

const basketballTiles: { title: Bi; body: Bi }[] = [
  { title: { EN: "Player Load", IS: "Player Load" }, body: { EN: "Catapult's accelerometer volume — total mechanical work, the primary indoor load metric.", IS: "Hröðunarmælis-magn Catapult — heildar vélræn vinna, aðal innandyra álagsmælikvarðinn." } },
  { title: { EN: "PL / min", IS: "PL / mín" }, body: { EN: "Player Load per minute — the intensity of the session, independent of its length.", IS: "Player Load á mínútu — ákefð lotunnar, óháð lengd hennar." } },
  { title: { EN: "IMA COD / Accel / Decel", IS: "IMA COD / Hröðun / Hemlun" }, body: { EN: "Inertial changes of direction, accelerations and decelerations — the multidirectional demand indoors.", IS: "Stefnubreytingar, hröðun og hemlun úr tregðumæli — fjölátta krafan innandyra." } },
  { title: { EN: "Max velocity", IS: "Hámarkshraði" }, body: { EN: "Top speed hit (km/h) — exposure signal.", IS: "Hæsti hraði (km/klst) — útsetningar-merki." } },
];

const sharedTiles: { title: Bi; body: Bi }[] = [
  { title: { EN: "Heavy / typical / light", IS: "Þungt / dæmigert / létt" }, body: { EN: "Today's squad average vs the team's own recent 28-day norm. ≥1.5× = a heavy day, ≤0.5× = light — a change flag, not an injury prediction.", IS: "Meðaltal liðsins í dag vs eigin 28-daga venju. ≥1.5× = þungur dagur, ≤0.5× = léttur — breytingar-merki, ekki meiðsla-spá." } },
  { title: { EN: "Coverage", IS: "Þekja" }, body: { EN: "Only players who wore a tracked, GPS-locked unit appear. Indoor sessions and no-lock rows show as no-data, never zero — so 'N of M tracked' is shown first.", IS: "Aðeins leikmenn með mælda, GPS-læsta einingu birtast. Innandyra lotur og læsingar-lausar raðir sýnast sem engin-gögn, aldrei núll — svo „N af M mælt“ er sýnt fyrst." } },
];

export default function GpsVerdictBanner(props: GpsVerdictInput) {
  const [lang] = useLang();
  const IS = lang === "IS";
  const pick = (b: Bi) => (IS ? b.IS : b.EN);
  const { isBasketball, dateLabel, tracked, rosterCount, primaryLabel, todayAvg, ratio, topMovers } = props;

  const covNote = { EN: `${tracked} of ${rosterCount} tracked`, IS: `${tracked} af ${rosterCount} mælt` };
  const drivers: VerdictDriver[] = topMovers.slice(0, 4).map((n) => ({
    label: n, tone: "neutral" as const,
    tip: { EN: "Most external load in the session", IS: "Mest ytra álag í lotunni" },
  }));

  const verdict: { tone: VerdictTone; sentence: Bi; subtitle?: Bi; action?: Bi } = (() => {
    if (tracked === 0) {
      return { tone: "neutral", sentence: { EN: `No GPS session for ${dateLabel} — appears when a Catapult session syncs.`, IS: `Engin GPS-lota fyrir ${dateLabel} — birtist þegar Catapult-lota samstillist.` }, action: { EN: "Pick another date, or check the unit was worn and GPS-locked.", IS: "Veldu annan dag, eða athugaðu að einingin hafi verið borin og GPS-læst." } };
    }
    const primary = pick(primaryLabel).toLowerCase();
    if (ratio == null) {
      return { tone: "neutral", sentence: { EN: `Session logged for ${tracked} player${tracked > 1 ? "s" : ""} — not enough history yet to compare to the norm.`, IS: `Lota skráð fyrir ${tracked} leikm. — ekki næg saga enn til að bera við venjuna.` }, subtitle: { EN: "Coverage varies — indoor and no-lock rows show as no-data.", IS: "Þekja er breytileg — innandyra og læsingar-lausar raðir sýnast sem engin-gögn." } };
    }
    if (ratio >= 1.5) {
      return {
        tone: "watch",
        sentence: { EN: `A heavy GPS day — the squad's ${primary} is ${ratio.toFixed(1)}× its recent norm.`, IS: `Þungur GPS-dagur — ${primary} liðsins er ${ratio.toFixed(1)}× nýlega venju.` },
        subtitle: { EN: "A workload-change flag, not an injury prediction.", IS: "Merki um álagsbreytingu, ekki meiðsla-spá." },
        action: { EN: "Fine if it was planned (a match or peak session). If not, plan recovery in and watch tomorrow's load.", IS: "Í lagi ef það var planað (leikur eða topp-lota). Annars skipuleggðu endurheimt og fylgstu með álagi morgundagsins." },
      };
    }
    if (ratio <= 0.5) {
      return {
        tone: "good",
        sentence: { EN: `A light GPS day — ${primary} is ${ratio.toFixed(1)}× the recent norm.`, IS: `Léttur GPS-dagur — ${primary} er ${ratio.toFixed(1)}× nýlega venju.` },
        action: { EN: "Expected on a recovery or tactical day. Nothing to action.", IS: "Væntanlegt á endurheimtar- eða taktískum degi. Ekkert að aðhafast." },
      };
    }
    return {
      tone: "good",
      sentence: { EN: `A typical GPS day — ${primary} is in line with the recent norm (${ratio.toFixed(1)}×).`, IS: `Dæmigerður GPS-dagur — ${primary} í takt við nýlega venju (${ratio.toFixed(1)}×).` },
      action: { EN: "Nothing unusual — external load is in range.", IS: "Ekkert óvenjulegt — ytra álag í jafnvægi." },
    };
  })();

  const tiles = [...(isBasketball ? basketballTiles : footballTiles), ...sharedTiles];

  return (
    <div className="space-y-3">
      <VerdictBanner
        lang={IS ? "IS" : "EN"}
        kicker="GPS"
        tone={verdict.tone}
        sentence={verdict.sentence}
        subtitle={verdict.subtitle}
        action={verdict.action}
        confidence={{ level: tracked >= Math.ceil(rosterCount * 0.6) ? "moderate" : "low", note: covNote }}
        drivers={drivers}
      />
      <ShowDetails label={{ EN: "How to read this tab", IS: "Hvernig á að lesa þennan flipa" }}>
        <div className="grid gap-3 text-[12px] leading-relaxed text-slate-600 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.title.EN}>
              <div className="font-semibold text-slate-800">{pick(t.title)}</div>
              <p>{pick(t.body)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          {IS
            ? `${todayAvg != null ? `Meðaltal dagsins fyrir ${pick(primaryLabel).toLowerCase()}: ${Math.round(todayAvg)}. ` : ""}Ytra álag er hlutlægt (GPS/tregðumælir); innra álag (sRPE) og púls eru hin hliðin. Reglur ákveða, ekki AI.`
            : `${todayAvg != null ? `Today's average ${pick(primaryLabel).toLowerCase()}: ${Math.round(todayAvg)}. ` : ""}External load is objective (GPS/inertial); internal load (sRPE) and heart rate are the other side. Rules decide, not AI.`}
        </p>
      </ShowDetails>
    </div>
  );
}
