"use client";

/**
 * LoadRpeExplainer — the "how to read this tab" glossary for Load & RPE.
 *
 * Every number on the tab explained in plain language, one click away (never in the
 * primary answer-first view): what each metric is, how it's computed, its honest limit,
 * and its paper citation. Mirrors the Heart Rate Intelligence page's glossary so the
 * whole app reads the same way. Rules decide; this only explains.
 */

import Link from "next/link";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import MethodologyLink from "@/components/common/MethodologyLink";
import { ACWR_CAVEAT } from "@/lib/methodologyCaveats";

type Tile = { title: { EN: string; IS: string }; body: { EN: string; IS: string } };

const TILES: Tile[] = [
  {
    title: { EN: "RPE & compliance", IS: "RPE & skil" },
    body: {
      EN: "After a session each player rates how hard it felt, 0–10 (Borg CR-10). Compliance = how many logged it (submitted / expected). No rating → no internal-load number for that player, so coverage is shown first. Cite: Foster 1998.",
      IS: "Eftir æfingu metur hver leikmaður hve erfið hún var, 0–10 (Borg CR-10). Skil = hve margir skráðu (skilað / væntanlegt). Ekkert mat → ekkert innra-álag fyrir þann leikmann, svo þekjan er sýnd fyrst. Heimild: Foster 1998.",
    },
  },
  {
    title: { EN: "Internal load (sRPE)", IS: "Innra álag (sRPE)" },
    body: {
      EN: "Foster session-RPE = rating × minutes, in AU. The card shows the squad's total for the day plus the average and hardest player. This is the SUBJECTIVE load — what the session cost the athlete. Cite: Foster 1998.",
      IS: "Foster session-RPE = mat × mínútur, í AU. Kortið sýnir heildina fyrir liðið þann dag auk meðaltals og erfiðasta leikmanns. Þetta er HUGLÆGA álagið — hvað lotan kostaði leikmanninn. Heimild: Foster 1998.",
    },
  },
  {
    title: { EN: "ACWR risk", IS: "ACWR áhætta" },
    body: {
      EN: "Acute (7-day) load ÷ chronic (28-day) load. A workload-CHANGE reference — how unfamiliar this week's load is versus the recent norm — NOT an injury predictor (heavily debated since Impellizzeri 2020). We flag big spikes, not a magic 'sweet spot'. Cite: Gabbett 2016.",
      IS: "Bráð (7-daga) álag ÷ langvinnt (28-daga) álag. Viðmið um BREYTINGU á álagi — hve ókunnuglegt álag vikunnar er miðað við nýlega venju — EKKI meiðsla-spá (mjög umdeilt frá Impellizzeri 2020). Við merkjum stór stökk, ekki töfra-„kjörbil“. Heimild: Gabbett 2016.",
    },
  },
  {
    title: { EN: "HR vs sRPE", IS: "HR vs sRPE" },
    body: {
      EN: "The objective belt heart-rate cross-check on the subjective rating: when the heart worked much harder than the rating (hidden load) or the reverse (low cardiac demand), the player is flagged. Full detail on the Heart Rate Intelligence page. Cite: Edwards 1993.",
      IS: "Hlutlægi beltis-púls kross-tékkið á huglæga matið: þegar hjartað vann mun meira en matið (falið álag) eða öfugt (lítið hjarta-drif) er leikmaður flaggaður. Nánar á Púls-greiningarsíðunni. Heimild: Edwards 1993.",
    },
  },
  {
    title: { EN: "External load · GPS (yesterday)", IS: "Ytra álag · GPS (í gær)" },
    body: {
      EN: "Yesterday's Catapult TEAM AVERAGES. Total Dist = distance covered; Vel Band 5/6 = distance run at high / very-high speed (sprinting); HIR Dist = high-intensity running distance; Accel/Decel B2-3 = count of hard accelerations / brakes (≥2 m/s²); Tot Accels/Decels = all efforts. This is the OBJECTIVE external load, alongside the subjective sRPE above.",
      IS: "Meðaltöl LIÐSINS frá Catapult í gær. Total Dist = vegalengd; Vel Band 5/6 = vegalengd á miklum / mjög miklum hraða (spretti); HIR Dist = há-ákefðar hlaup; Accel/Decel B2-3 = fjöldi harðra hröðunar / hemlana (≥2 m/s²); Tot Accels/Decels = öll átök. Þetta er HLUTLÆGA ytra álagið, samhliða huglæga sRPE að ofan.",
    },
  },
  {
    title: { EN: "Confidence & coverage", IS: "Vissa & þekja" },
    body: {
      EN: "Everything is only as good as its coverage: RPE needs players to log, GPS needs a Catapult session, HR needs a belt on skin. Missing inputs show as no-data, never as zero — a blank is honest, a fake number isn't.",
      IS: "Allt er aðeins jafn gott og þekjan: RPE þarf skil, GPS þarf Catapult-lotu, HR þarf belti á húð. Þegar inntak vantar birtist það sem engin-gögn, aldrei sem núll — auð tala er heiðarleg, login tala ekki.",
    },
  },
];

export default function LoadRpeExplainer() {
  const [lang] = useLang();
  const IS = lang === "IS";
  return (
    <ShowDetails label={{ EN: "How to read this tab", IS: "Hvernig á að lesa þennan flipa" }}>
      <div className="grid gap-3 text-[12px] leading-relaxed text-slate-600 sm:grid-cols-2">
        {TILES.map((t) => (
          <div key={t.title.EN}>
            <div className="font-semibold text-slate-800">{IS ? t.title.IS : t.title.EN}</div>
            <p>{IS ? t.body.IS : t.body.EN}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <p>
          {IS
            ? "Innra álag (sRPE) er huglægt; púls og GPS eru hlutlægu kross-tékkin. Reglur ákveða, ekki AI."
            : "Internal load (sRPE) is subjective; heart rate and GPS are the objective cross-checks. Rules decide, not AI."}
        </p>
        <p className="mt-1">
          {IS ? "Tilvitnanir: " : "References: "}
          Foster 1998 · Gabbett 2016 · Impellizzeri 2020 · Edwards 1993.{" "}
          <Link href="/methodology" className="underline decoration-dotted hover:text-slate-700">
            {IS ? "Aðferðafræði →" : "Methodology →"}
          </Link>
        </p>
        <MethodologyLink caveat={ACWR_CAVEAT} />
      </div>
    </ShowDetails>
  );
}
