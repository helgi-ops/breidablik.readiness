"use client";

/**
 * Coach view — Assessments hub (selector).
 *
 * Interim hub that dissolves the old "Performance Monitoring" sidebar section
 * (coach-pages-audit-background-vs-destination.md, step 1). That section mixed
 * four Today-dashboard tab deep-links (trend / volatility / vald / strength —
 * still reachable from Today's own tab bar) with four real assessment PAGES.
 * The four tab links are dropped from the sidebar; the four pages are gathered
 * here as one entry, following the /coach/rehab-protocols selector pattern.
 *
 * Each page keeps its own standalone route. When the Player hub lands, fold
 * force-plate / assessment-profile / conditioning in as its tabs and retire (or
 * repurpose) this interim hub; post-match recovery moves to a Today background
 * chip in the signals step.
 *
 * Descriptive assessment surfaces only — none touch the readiness colour. Not
 * club-restricted (the old links weren't), so no team gate.
 */

import Link from "next/link";
import { useLang } from "@/lib/lang";

type Assessment = {
  href: string;
  title: { EN: string; IS: string };
  blurb: { EN: string; IS: string };
  tag: { EN: string; IS: string };
};

const ASSESSMENTS: Assessment[] = [
  {
    href: "/coach/rtp",
    title: { EN: "Force-plate assessment", IS: "Kraftplötu-mat" },
    blurb: {
      EN: "VALD ForceDecks return-to-play assessment — rules clearance + narrative + PDF.",
      IS: "VALD ForceDecks endurkomu-mat — regluklárun + greinargerð + PDF.",
    },
    tag: { EN: "VALD ForceDecks", IS: "VALD ForceDecks" },
  },
  {
    href: "/coach/assessment-profile",
    title: { EN: "Assessment profile", IS: "Mælingaprófíll" },
    blurb: {
      EN: "A player's physical assessment profile across the testing battery.",
      IS: "Líkamlegur mælingaprófíll leikmanns yfir prófunar-röðina.",
    },
    tag: { EN: "Per player", IS: "Per leikmann" },
  },
  {
    href: "/coach/conditioning",
    title: { EN: "Conditioning", IS: "Þrek" },
    blurb: {
      EN: "Energy-system / aerobic profile — Critical Speed, D′, ASR + fitness tests (every team, incl. basketball).",
      IS: "Orkukerfa- / þolprófíll — Critical Speed, D′, ASR + þrekpróf (öll lið, líka körfubolti).",
    },
    tag: { EN: "Critical Speed · ASR", IS: "Critical Speed · ASR" },
  },
  {
    href: "/coach/post-match-recovery",
    title: { EN: "Post-match recovery", IS: "Endurheimt eftir leik" },
    blurb: {
      EN: "How players recover after matches — MD+ tracking. (Moving to a Today chip soon.)",
      IS: "Hvernig leikmenn endurheimtast eftir leiki — MD+ eftirfylgni. (Færist á Today-merki bráðum.)",
    },
    tag: { EN: "MD+ recovery", IS: "MD+ endurheimt" },
  },
];

export default function AssessmentsHub() {
  const [lang] = useLang();
  const isEN = lang !== "IS";

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
        {isEN ? "Assessments" : "Mælingar"}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        {isEN
          ? "Physical testing and recovery reads for your players — force plates, assessment profiles, conditioning capacity, and post-match recovery."
          : "Líkamlegar mælingar og endurheimtar-lestrar fyrir leikmenn — kraftplötur, mælingaprófílar, þrek-geta og endurheimt eftir leik."}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ASSESSMENTS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:border-violet-400 hover:bg-violet-50/40"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">{isEN ? a.title.EN : a.title.IS}</span>
              <span className="text-slate-300 transition group-hover:text-violet-500" aria-hidden>→</span>
            </div>
            <span className="mt-1 text-sm text-slate-600">{isEN ? a.blurb.EN : a.blurb.IS}</span>
            <span className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">{isEN ? a.tag.EN : a.tag.IS}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
