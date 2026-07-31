"use client";

/**
 * "How to read" overlay for the player's football-stats card. Self-contained
 * (the coach CoachTutorialModal is bound to the coach tutorial framework), same
 * overlay shell: backdrop-click + ESC + ✕ to close. Bilingual, content only.
 *
 * Video slot is ready: set HOW_TO_READ_VIDEO to the Vimeo embed URL and the
 * player gets a walkthrough above the text guide; empty → text-only until then.
 */

import { useEffect } from "react";

// Paste the Vimeo embed URL here when the walkthrough is recorded, e.g.
// "https://player.vimeo.com/video/XXXXXXXXX?h=xxxx&badge=0&autopause=0&player_id=0&app_id=58479"
export const HOW_TO_READ_VIDEO = "";

type TX = { EN: string; IS: string };
type Section = { heading: TX; body: TX[] };

const SECTIONS: Section[] = [
  {
    heading: { EN: "What this card is", IS: "Hvað þetta kort er" },
    body: [
      {
        EN: "Your own match stats from Wyscout, for this season — a way to follow your game. The stats you see are picked for your position, so you get the numbers that describe what you actually do on the pitch, not a hundred-row table.",
        IS: "Þínar eigin leiktölur úr Wyscout fyrir tímabilið — leið til að fylgjast með leiknum þínum. Tölurnar sem þú sérð eru valdar út frá stöðunni þinni, svo þú færð þær sem lýsa því sem þú raunverulega gerir á vellinum, ekki hundrað-lína töflu.",
      },
    ],
  },
  {
    heading: { EN: "Your core numbers", IS: "Kjarninn þinn" },
    body: [
      {
        EN: "Everyone sees matches, minutes, goals, assists, xG and pass accuracy. Goals and assists are your season totals; pass accuracy is the share of your passes that reached a teammate.",
        IS: "Allir sjá leiki, mínútur, mörk, stoðsendingar, xG og sendinga-nákvæmni. Mörk og stoðsendingar eru heildartölur tímabilsins; sendinga-nákvæmni er hlutfall sendinga sem komust til samherja.",
      },
      {
        EN: "xG (expected goals) is the quality of the chances you got into — a tap-in is worth about 0.8, a long shot about 0.03. It tells you how good your positions were, not just whether the ball went in.",
        IS: "xG (vænt mörk) eru gæði færanna sem þú komst í — dauðafæri er um 0,8, langskot um 0,03. Það segir hversu góð staðsetning þín var, ekki bara hvort boltinn fór inn.",
      },
    ],
  },
  {
    heading: { EN: "Your position numbers", IS: "Stöðu-tölurnar þínar" },
    body: [
      {
        EN: "The rest of the grid changes with your position: a forward sees shots and touches in the box, a winger sees dribbles and crosses, a midfielder sees passing and interceptions, a defender sees duels and clearances, a keeper sees saves and clean sheets.",
        IS: "Restin af töflunni breytist með stöðunni þinni: sóknarmaður sér skot og snertingar í teig, kantmaður sér rekstur og fyrirgjafir, miðjumaður sér sendingar og rof, varnarmaður sér einvígi, markvörður sér varin skot og hreinar skjaldir.",
      },
      {
        EN: "“per 90” means per 90 minutes played — it puts everyone on the same footing whether you played 300 minutes or 1,600. xA (expected assists) is the chance-creating value of your passes, whether or not a teammate finished. A dash “–” means the stat wasn't reported — it is not a zero.",
        IS: "„á 90 mín“ þýðir á hverjar 90 spilaðar mínútur — það setur alla á sama grunn hvort sem þú spilaðir 300 eða 1.600 mínútur. xA (væntar stoðsendingar) er færa-skapandi virði sendinga þinna, óháð því hvort samherji kláraði. Strik „–“ þýðir að talan var ekki skráð — það er ekki núll.",
      },
    ],
  },
  {
    heading: { EN: "This never changes your status", IS: "Þetta breytir aldrei stöðunni þinni" },
    body: [
      {
        EN: "These are descriptive match stats only. They do not affect your training load or your green / amber / red readiness — that comes from your check-ins and load, never from your football numbers.",
        IS: "Þetta eru eingöngu lýsandi leiktölur. Þær hafa engin áhrif á æfingaálagið þitt eða græna / gula / rauða stöðu — hún kemur frá innskráningum og álagi, aldrei frá fótbolta-tölunum.",
      },
    ],
  },
];

export default function PlayerFootballStatsHowTo({
  lang,
  onClose,
}: {
  lang: "IS" | "EN";
  onClose: () => void;
}) {
  const IS = lang === "IS";
  const pick = (b: TX) => (IS ? b.IS : b.EN);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {IS ? "Hvernig á að lesa" : "How to read"}
            </div>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">
              {IS ? "Tímabilið mitt — fótbolti" : "My season — football"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={IS ? "Loka" : "Close"}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {HOW_TO_READ_VIDEO ? (
          <div className="mb-4 overflow-hidden rounded-lg border border-slate-200" style={{ position: "relative", paddingTop: "56.25%" }}>
            <iframe
              src={HOW_TO_READ_VIDEO}
              title={IS ? "Hvernig á að lesa — fótbolti" : "How to read — football"}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : null}

        <div className="space-y-4">
          {SECTIONS.map((s, i) => (
            <section key={i}>
              <h3 className="text-sm font-semibold text-slate-800">{pick(s.heading)}</h3>
              <div className="mt-1 space-y-1.5">
                {s.body.map((p, j) => (
                  <p key={j} className="text-[13px] leading-relaxed text-slate-600">{pick(p)}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {IS ? "Loka" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
