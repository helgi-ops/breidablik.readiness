"use client";

/**
 * Coach view — Rehab protocols hub (injury-type selector).
 *
 * Single entry point for the staged-loading / criteria-based clinical modules
 * that previously each held their own sidebar slot (hamstring, jumper's knee,
 * Achilles, adductor/groin, ankle). Each remains its own bespoke page; this
 * hub just replaces five sidebar links with one selector, keeping the modules
 * reachable as drill-downs. Part of the coach-surface consolidation (see
 * docs/tasks/coach-pages-audit-background-vs-destination.md).
 *
 * EDUCATIONAL protocol references — progression decisions belong to the
 * treating clinician. Breiðablik-only (same gate as the individual modules);
 * the sidebar hides the link for other teams and this guard blocks direct-URL
 * access.
 */

import React from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { supabase } from "@/lib/supabaseClient";

const BREIDABLIK_TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

type Protocol = {
  href: string;
  title: { EN: string; IS: string };
  blurb: { EN: string; IS: string };
  source: string;
};

const PROTOCOLS: Protocol[] = [
  {
    href: "/coach/hamstring-rehab",
    title: { EN: "Hamstring (Ramping Iso)", IS: "Hamstring (Ramping Iso)" },
    blurb: {
      EN: "Criteria-based RTP for Grade I–II hamstring strains.",
      IS: "Viðmiðabundin endurkoma við I–II gráðu hamstring-tognun.",
    },
    source: "Baar 2023",
  },
  {
    href: "/coach/jumpers-knee",
    title: { EN: "Jumper's Knee", IS: "Stökkhné" },
    blurb: {
      EN: "Staged loading for patellar tendinopathy.",
      IS: "Þrepaskipt álag við hnéskeljar-sinabólgu.",
    },
    source: "Cook / Purdam",
  },
  {
    href: "/coach/achilles-tendinopathy",
    title: { EN: "Achilles Tendinopathy", IS: "Achilles-sinabólga" },
    blurb: {
      EN: "Staged loading + VISA-A tracking for the Achilles.",
      IS: "Þrepaskipt álag + VISA-A eftirfylgni fyrir Achilles.",
    },
    source: "Silbernagel",
  },
  {
    href: "/coach/adductor-groin",
    title: { EN: "Adductor / Groin", IS: "Aðleiðara-nári" },
    blurb: {
      EN: "Staged loading for adductor-related groin pain.",
      IS: "Þrepaskipt álag við aðleiðara-tengda nárarverki.",
    },
    source: "Doha / Copenhagen",
  },
  {
    href: "/coach/ankle-sprain",
    title: { EN: "Ankle Sprain (I–II)", IS: "Ökkla-tognun (I–II)" },
    blurb: {
      EN: "Functional loading for grade I–II lateral sprains.",
      IS: "Starfrænt álag við I–II gráðu utanverða tognun.",
    },
    source: "PEACE & LOVE",
  },
];

export default function RehabProtocolsHub() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const [allowed, setAllowed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setAllowed(false); return; }
      const { data } = await supabase.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = (data as { team_id?: string } | null)?.team_id ?? null;
      if (active) setAllowed(tid === BREIDABLIK_TEAM_ID);
    })();
    return () => { active = false; };
  }, []);

  if (allowed === null) {
    return <div className="p-8 text-sm text-slate-500">{isEN ? "Loading…" : "Hleð…"}</div>;
  }
  if (!allowed) {
    return (
      <div className="p-8">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-slate-900">{isEN ? "Not available for this team" : "Ekki í boði fyrir þetta lið"}</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">{isEN ? "Rehab protocols" : "Endurhæfing"}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        {isEN
          ? "Choose an injury to open its staged-loading, criteria-based module. These are educational references — progression decisions belong to the treating clinician."
          : "Veldu áverka til að opna þrepaskipta, viðmiðabundna einingu. Þetta eru fræðsluviðmið — framvindu-ákvarðanir eru í höndum meðhöndlandi sérfræðings."}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROTOCOLS.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:border-violet-400 hover:bg-violet-50/40"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">{isEN ? p.title.EN : p.title.IS}</span>
              <span className="text-slate-300 transition group-hover:text-violet-500" aria-hidden>→</span>
            </div>
            <span className="mt-1 text-sm text-slate-600">{isEN ? p.blurb.EN : p.blurb.IS}</span>
            <span className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">{p.source}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
