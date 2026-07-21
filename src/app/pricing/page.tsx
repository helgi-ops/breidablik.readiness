"use client";

import * as React from "react";
import Link from "next/link";
import { MICROPULSE_PRODUCT_IDENTITY } from "@/lib/micropulse/product";

type Lang = "IS" | "EN";
type PlanKey = "free" | "pro" | "elite";

const COPY = {
  EN: {
    nav: {
      back: "Back to home",
      pricing: "Pricing",
      demo: "Book demo",
      signIn: "Sign in",
      getStarted: "Start free",
    },
    hero: {
      title: "Performance intelligence pricing for coaching, performance, and medical teams.",
      sub: "Choose the operational depth your environment needs, from daily monitoring to full decision support and multi-team intelligence.",
      chips: ["Coaching staff", "Performance teams", "Medical staff"],
    },
    positioning: {
      line1: "MicroPulse is more than monitoring.",
      line2: "It converts monitoring data into training decisions.",
    },
    sportToggle: {
      label: "Sport environment",
      outdoor: "Outdoor (Football, Rugby…)",
      indoor: "Indoor (Basketball, Handball, Volleyball…)",
    },
    plans: {
      title: "Choose the MicroPulse plan that fits your team",
      sub: "MicroPulse scales from simple daily monitoring to full performance intelligence for coaching, performance, and medical staff.",
      recommended: "Most popular",
      free: {
        name: "Free",
        pricePrimary: "€0 / month",
        priceSecondary: "Best for small teams and academies",
        note: "Start with daily monitoring and basic team visibility.",
        bullets: [
          "Daily player check-in",
          "Basic readiness score",
          "Player monitoring dashboard",
          "Individual player status",
          "Up to 15 players",
          "Basic monitoring insights",
        ],
        cta: "Start Free",
      },
      pro: {
        name: "Pro (Team)",
        pricePrimary: "€349 / month",
        priceLocal: "49.990 kr / mánuð",
        priceSecondary: "Best for clubs on Premium Catapult plans (B2-3 efforts or IMU bands) — any sport",
        note: "Adds Decel Intelligence, Indoor Load, Quadrant 2017 B2-3 axis, Sharp Cut, MPE Recovery on top of everything in Lite. A Lite team auto-upgrades here the moment genuine IMA data starts flowing.",
        bullets: [
          "Everything in Free plus:",
          "Unlimited squad size",
          "Coach dashboard & team readiness overview",
          "Adaptive Training Engine",
          "Neural Fatigue Model",
          "Decel Intelligence — 5-dim early ACL / quadriceps / patellar tendon radar",
          "Sharp Cut load — cutting volume vs personal norm",
          "MPE Recovery — early fatigue from recovery-time drift",
          "GPS Load Monitoring — 7D / 28D / ACWR per player + team",
          "Mechanical Load Index (MLI) — decel, accel, CoD, PlayerLoad density",
          "Metabolic Load Score — power-corrected, HMLD, fatigue type",
          "Quadrant View — readiness × load sweet-spot tracking with B2-3 axis",
          "Indoor Load page (FMP-driven, IMU-only for indoor sports)",
          "Bidirectional notifications — over- AND undertraining detection",
          "GPS integrations: Catapult API + Catapult CSV upload (no-API option)",
          "VALD integrations: ForceFrame (groin) + NordBord (hamstring)",
          "Yesterday Load — auto-populated from Catapult",
          "Match-week operations (Week setup, TV view, Messages)",
          "Player volatility tracking",
          "Explainable readiness decisions with counterfactuals",
          "Session adjustment suggestions",
          "Multi-day rehab assignments + evidence-based templates",
          "Team workflow tools",
        ],
        cta: "Start Pro",
      },
      lite: {
        name: "Lite (Club)",
        pricePrimary: "€129 / month",
        priceLocal: "18.900 kr / mánuð",
        priceSecondary: "Best for lower-division clubs and indoor sports without IMU vests",
        note: "Standalone sport-science suite for clubs on standard Catapult Activity Reports — or no GPS at all. Built on Gabbett 2016, Malone 2017, Foster 1998, Buchheit 2018. Add Catapult IMA later and the team auto-upgrades to Pro — MicroPulse detects the data and unlocks the indoor pages; you just set up Catapult once.",
        bullets: [
          "Everything in Free plus:",
          "Unlimited squad size",
          "Coach dashboard & team readiness overview",
          "Quadrant view — volume-axis ACWR per player",
          "HSR Intelligence — hamstring/soft-tissue load & exposure per player",
          "Foster Monotony + Strain — overtraining detection from sRPE × duration",
          "MD HSR Comparison — periodization helper, % of MD HSR reached",
          "Squad Load 7d/28d/ACWR table — per-player workload trends",
          "Catapult CSV upload (any standard Activity Report)",
          "VALD / CMJ monitoring tab",
          "Bidirectional notifications — over- AND undertraining detection",
          "Match-week operations (Week setup, TV view, Messages)",
          "Player volatility tracking",
          "Explainable readiness decisions with counterfactuals",
          "Session adjustment suggestions",
          "Multi-day rehab assignments + evidence-based templates",
          "Team workflow tools",
        ],
        cta: "Start Lite",
      },
      elite: {
        name: "Elite (Academy)",
        pricePrimary: "From €1.050 / month",
        priceLocal: "149.990 kr / mánuð",
        priceSecondary: "Best for professional clubs and multi-team organizations",
        note: "Adds AI translation layer + multi-team intelligence on top of Pro.",
        bullets: [
          "Everything in Pro plus:",
          "🧠 AI Player Summary — daily plain-language readiness narrative per player",
          "💬 AI Q&A — ask the system 8 curated questions per player (last match cost, biggest risk, minute capacity, safest drill today, etc.)",
          "🧠 Decel Narrative AI — plain-language explanation of decel intelligence numbers",
          "Counterfactual explanations — \"if X had been Y, today would be GREEN\"",
          "Tomorrow's verdict forecast — predictive readiness from streak + trajectory",
          "3 teams included (men + women + 1 youth)",
          "Additional teams: 25.000 kr/mo per team",
          "Cross-team performance analytics",
          "Organization dashboards",
          "Executive reporting",
          "Automation and smart alerts",
          "Multiple data source integrations (GPS, VALD, internal load, and more)",
          "Medical + performance oversight",
          "Multi-team management",
          "Dedicated onboarding & priority support",
        ],
        cta: "Talk to us",
      },
      trustLine: "Run monitoring, decision support, and performance intelligence from one platform.",
    },
    compare: {
      title: "Quick compare",
      // 5 columns: feature, Free, Lite, Pro, Elite (4-tier structure, May 2026)
      rows: [
        ["Daily player check-in", "✅", "✅", "✅", "✅"],
        ["Coach dashboard", "—", "✅", "✅", "✅"],
        ["Adaptive Training Engine", "—", "✅", "✅", "✅"],
        ["Squad Load 7d/28d/ACWR table", "—", "✅", "✅", "✅"],
        ["Quadrant View — volume axis", "—", "✅", "✅", "✅"],
        ["HSR Intelligence — hamstring/soft-tissue radar", "—", "✅", "✅", "✅"],
        ["Foster Monotony + Strain — overtraining detection", "—", "✅", "✅", "✅"],
        ["MD HSR Comparison — periodization helper", "—", "✅", "✅", "✅"],
        ["Catapult CSV upload (any plan)", "—", "✅", "✅", "✅"],
        ["GPS Load Monitoring — ACWR", "—", "✅", "✅", "✅"],
        ["VALD / CMJ monitoring", "—", "✅", "✅", "✅"],
        ["CMJ Required alerts", "—", "✅", "✅", "✅"],
        ["Smart push notifications", "—", "✅", "✅", "✅"],
        ["Bidirectional notifications (over+under-training)", "—", "✅", "✅", "✅"],
        ["Explainable readiness decisions", "—", "✅", "✅", "✅"],
        ["Counterfactual explanations", "—", "✅", "✅", "✅"],
        ["Multi-day rehab assignments", "—", "✅", "✅", "✅"],
        ["Decel Intelligence — 5-dim braking radar", "—", "—", "✅", "✅"],
        ["Quadrant View — B2-3 axis", "—", "—", "✅", "✅"],
        ["Indoor Load page (FMP / IMU bands)", "—", "—", "✅", "✅"],
        ["Sharp Cut load", "—", "—", "✅", "✅"],
        ["MPE Recovery", "—", "—", "✅", "✅"],
        ["Mechanical Load Index (MLI)", "—", "—", "✅", "✅"],
        ["Metabolic Load Score", "—", "—", "✅", "✅"],
        ["Neural fatigue model", "—", "—", "✅", "✅"],
        ["Catapult API live sync", "—", "—", "✅", "✅"],
        ["🧠 AI Player Summary", "—", "—", "—", "✅"],
        ["💬 AI Q&A (8 curated questions)", "—", "—", "—", "✅"],
        ["🧠 Decel Narrative AI", "—", "—", "—", "✅"],
        ["Tomorrow's verdict forecast", "—", "—", "—", "✅"],
        ["Cross-team analytics", "—", "—", "—", "✅"],
        ["Multiple GPS integrations", "—", "—", "—", "✅"],
        ["Automation & alerts", "—", "—", "—", "✅"],
      ],
    },
    demo: {
      title: "Book a demo",
      sub: "Tell us about your team — we’ll set up a walkthrough and recommend the right plan.",
      leftTitle: "What happens next?",
      leftBullets: ["20–30 min walkthrough", "Review your workflow (match week, travel, RTP)", "Rollout recommendation"],
      formTitle: "Request a demo",
      planLabel: "Plan",
      name: "Name",
      email: "Email",
      org: "Club / Organization",
      sport: "Sport",
      message: "Message (optional)",
      submit: "Submit request",
      sending: "Sending…",
      success: "✅ Request sent. We’ll get back to you shortly.",
      requiredName: "Name is required.",
      requiredEmail: "Valid email is required.",
      requiredOrg: "Club / Organization is required.",
    },
    footer: "Performance intelligence and decision support for modern team operations.",
    sports: ["Football", "Basketball", "Handball", "Volleyball", "Other"],
    preview: {
      title: "MicroPulse",
      decision: "Decision output",
      coach: "Coach control",
      team: "Team ready",
    },
  },

  IS: {
    nav: {
      back: "Til baka",
      pricing: "Verðskrá",
      demo: "Bóka demo",
      signIn: "Innskrá",
      getStarted: "Byrja frítt",
    },
    hero: {
      title: "Verðlagning fyrir performance intelligence hjá þjálfara-, performance- og medical teymum.",
      sub: "Veldu rekstrardýpt sem hentar þínu umhverfi: frá daglegu monitoring yfir í fullan ákvörðunarstuðning og multi-team yfirsýn.",
      chips: ["Þjálfarateymi", "Performance teymi", "Medical staff"],
    },
    positioning: {
      line1: "MicroPulse er meira en monitoring.",
      line2: "Kerfið breytir monitoring gögnum í æfingaákvarðanir.",
    },
    sportToggle: {
      label: "Umhverfi íþróttar",
      outdoor: "Utandyra (Fótbolti, Rugby…)",
      indoor: "Innanhúss (Körfubolti, Handbolti, Blak…)",
    },
    plans: {
      title: "Leiðir",
      sub: "Skipulagt eftir þroska teymis: monitoring, decision support og organization-level intelligence.",
      recommended: "Mælt með",
      free: {
        name: "Free",
        pricePrimary: "€0 / month",
        priceSecondary: "Fyrir smærri lið, akademíur og þjálfara sem vilja prófa kerfið.",
        note: "Byrjaðu með daglegu monitoring og grunn liðsyfirsýn.",
        bullets: [
          "Dagleg player check-in",
          "Grunn readiness score",
          "Player monitoring dashboard",
          "Einstaklingsstaða leikmanna",
          "Allt að 15 leikmenn",
          "Grunn monitoring insights",
        ],
        cta: "Byrja með Free",
      },
      pro: {
        name: "Pro (Team)",
        pricePrimary: "€349 / month",
        priceLocal: "49.990 kr / mánuð",
        priceSecondary: "Fyrir lið með Premium Catapult áskrift (B2-3 efforts eða IMU bands) — hvaða íþrótt sem er",
        note: "Bætir við Decel Intelligence, Indoor Load, Quadrant 2017 B2-3 axis, Sharp Cut, MPE Recovery ofan á allt í Lite. Lið á Lite færist sjálfkrafa hingað um leið og raunveruleg IMA-gögn fara að berast.",
        bullets: [
          "Allt í Free +",
          "Ótakmarkaður hópur",
          "Coach dashboard & liðsyfirsýn readiness",
          "Adaptive Training Engine",
          "Neural Fatigue Model",
          "Decel Intelligence — 5-vídda ACL / framanlæri / patellar tendon radar",
          "Sharp Cut load — skerping vs persónulegt norm",
          "MPE Recovery — snemma þreyta úr endurheimt-tíma",
          "GPS Load Monitoring — 7D / 28D / ACWR per leikmaður + lið",
          "Mechanical Load Index (MLI) — hæðnun, hægðun, snúningur, PlayerLoad",
          "Metabolic Load Score — power-corrected, HMLD, þreytugerð",
          "Quadrant View — readiness × álag sweet-spot með B2-3 axis",
          "Indoor Load síða (FMP-driven, IMU-only fyrir innanhúss íþróttir)",
          "Tvíátta tilkynningar — yfir- OG undirálag detection",
          "GPS tengingar: Catapult API + Catapult CSV upload (no-API leið)",
          "VALD tengingar: ForceFrame (nári) + NordBord (aftanlæri)",
          "Yesterday Load — sótt sjálfkrafa frá Catapult",
          "Leikjaviku rekstur (Week setup, TV view, Messages)",
          "Player volatility tracking",
          "Útskýranleg readiness decisions með counterfactuals",
          "Session adjustment suggestions",
          "Multi-day rehab assignments + evidence-based templates",
          "Team workflow tools",
        ],
        cta: "Bóka demo",
      },
      lite: {
        name: "Lite (Club)",
        pricePrimary: "€129 / month",
        priceLocal: "18.900 kr / mánuð",
        priceSecondary: "Fyrir neðri-deildar lið og innanhúss íþróttir án IMU vesta",
        note: "Sjálfstæð sport-science suite fyrir lið með standard Catapult Activity Reports — eða engan GPS yfirleitt. Byggð á Gabbett 2016, Malone 2017, Foster 1998, Buchheit 2018. Bætir þú Catapult IMA við síðar færist liðið sjálfkrafa upp í Pro — MicroPulse skynjar gögnin og opnar innanhúss-flötina; þú setur Catapult bara upp einu sinni.",
        bullets: [
          "Allt í Free +",
          "Ótakmarkaður hópur",
          "Coach dashboard & liðsyfirsýn readiness",
          "Quadrant view — volume-axis ACWR per leikmann",
          "HSR Intelligence — hamstring/soft-tissue álag og útsetning per leikmann",
          "Foster Monotony + Strain — overtraining-greining úr sRPE × tíma",
          "MD HSR Comparison — periodization helper, % af MD HSR náð",
          "Squad Load 7d/28d/ACWR tafla — per-leikmanns álagsþróun",
          "Catapult CSV upload (hvaða standard Activity Report sem er)",
          "VALD / CMJ monitoring flipi",
          "Tvíátta tilkynningar — yfir- OG undirálag detection",
          "Leikjaviku rekstur (Week setup, TV view, Messages)",
          "Player volatility tracking",
          "Útskýranleg readiness decisions með counterfactuals",
          "Session adjustment suggestions",
          "Multi-day rehab assignments + evidence-based templates",
          "Team workflow tools",
        ],
        cta: "Byrja Lite",
      },
      elite: {
        name: "Elite (Academy)",
        pricePrimary: "From €1.050 / month",
        priceLocal: "149.990 kr / mánuð",
        priceSecondary: "Fyrir atvinnuklúbba, multi-team skipulag og leiðtogateymi.",
        note: "Bætir AI túlkunarlagi + multi-team intelligence ofan á Pro.",
        bullets: [
          "Allt í Pro +",
          "🧠 AI Player Summary — daglegt readiness yfirlit á coach máli per leikmann",
          "💬 AI Q&A — spyrðu kerfið 8 spurninga per leikmann (síðasti leikur, mesta áhætta, mín-getu, öruggasta æfing í dag o.fl.)",
          "🧠 Decel Narrative AI — túlkun á decel-tölum á coach máli",
          "Counterfactual útskýringar — \"ef X hefði verið Y, dagurinn væri GREEN\"",
          "Spá fyrir morgundag — fyrirsjáanlegt readiness úr trend + streak",
          "3 lið innifalin (karlar + konur + 1 yngri flokkur)",
          "Auka lið: 25.000 kr/mán per lið",
          "Cross-team analytics",
          "Organization dashboards",
          "Executive reporting",
          "Automation and smart alerts",
          "Margar gagnauppsprettur (GPS, VALD, internal load o.fl.)",
          "Medical + performance oversight",
          "Multi-team management",
          "Sérsniðin innleiðing & forgangsþjónusta",
        ],
        cta: "Tala við okkur um Elite",
      },
      trustLine: "Einn vettvangur fyrir monitoring, decision support og performance intelligence.",
    },
    compare: {
      title: "Stutt samanburður",
      // 5 dálkar: feature, Free, Lite, Pro, Elite (4-tier struktúr, May 2026)
      rows: [
        ["Daglegt player check-in", "✅", "✅", "✅", "✅"],
        ["Coach dashboard", "—", "✅", "✅", "✅"],
        ["Adaptive Training Engine", "—", "✅", "✅", "✅"],
        ["Squad Load 7d/28d/ACWR tafla", "—", "✅", "✅", "✅"],
        ["Quadrant View — volume axis", "—", "✅", "✅", "✅"],
        ["HSR Intelligence — hamstring/soft-tissue radar", "—", "✅", "✅", "✅"],
        ["Foster Monotony + Strain — overtraining detection", "—", "✅", "✅", "✅"],
        ["MD HSR Comparison — periodization helper", "—", "✅", "✅", "✅"],
        ["Catapult CSV upload (hvaða plan sem er)", "—", "✅", "✅", "✅"],
        ["GPS Load Monitoring — ACWR", "—", "✅", "✅", "✅"],
        ["VALD / CMJ monitoring", "—", "✅", "✅", "✅"],
        ["CMJ Required tilkynningar", "—", "✅", "✅", "✅"],
        ["Snjall push notifications", "—", "✅", "✅", "✅"],
        ["Tvíátta tilkynningar (yfir+undir-álag)", "—", "✅", "✅", "✅"],
        ["Útskýranleg readiness decisions", "—", "✅", "✅", "✅"],
        ["Counterfactual útskýringar", "—", "✅", "✅", "✅"],
        ["Multi-day rehab assignments", "—", "✅", "✅", "✅"],
        ["Decel Intelligence — 5-dim braking radar", "—", "—", "✅", "✅"],
        ["Quadrant View — B2-3 axis", "—", "—", "✅", "✅"],
        ["Indoor Load síða (FMP / IMU bands)", "—", "—", "✅", "✅"],
        ["Sharp Cut load", "—", "—", "✅", "✅"],
        ["MPE Recovery", "—", "—", "✅", "✅"],
        ["Mechanical Load Index (MLI)", "—", "—", "✅", "✅"],
        ["Metabolic Load Score", "—", "—", "✅", "✅"],
        ["Neural fatigue model", "—", "—", "✅", "✅"],
        ["Catapult API live sync", "—", "—", "✅", "✅"],
        ["🧠 AI Player Summary", "—", "—", "—", "✅"],
        ["💬 AI Q&A (8 spurningar)", "—", "—", "—", "✅"],
        ["🧠 Decel Narrative AI", "—", "—", "—", "✅"],
        ["Spá fyrir morgundag", "—", "—", "—", "✅"],
        ["Cross-team analytics", "—", "—", "—", "✅"],
        ["Margar GPS tengingar", "—", "—", "—", "✅"],
        ["Automation & alerts", "—", "—", "—", "✅"],
      ],
    },
    demo: {
      title: "Bóka demo",
      sub: "Segðu okkur frá liðinu — við stillum upp kynningu og leggjum til rétta leið.",
      leftTitle: "Hvað gerist næst?",
      leftBullets: ["20–30 mín kynning", "Förum yfir vinnuflæði (leikjavika, ferðalög, RTP)", "Tillaga að innleiðingu"],
      formTitle: "Beiðni um demo",
      planLabel: "Leið",
      name: "Nafn",
      email: "Netfang",
      org: "Klúbbur / Skipulag",
      sport: "Íþrótt",
      message: "Skilaboð (valfrjálst)",
      submit: "Senda beiðni",
      sending: "Sendi…",
      success: "✅ Beiðni send. Við höfum samband fljótlega.",
      requiredName: "Nafn vantar.",
      requiredEmail: "Gilt netfang vantar.",
      requiredOrg: "Klúbbur / skipulag vantar.",
    },
    footer: "Performance intelligence og ákvörðunarstuðningur fyrir daglegan teymisrekstur.",
    sports: ["Fótbolti", "Körfubolti", "Handbolti", "Blak", "Annað"],
    preview: {
      title: "MicroPulse",
      decision: "Ákvörðun",
      coach: "Coach stjórn",
      team: "Ready fyrir lið",
    },
  },
} as const;

function useSmoothScroll() {
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const id = href.replace("#", "");
      const el = document.getElementById(id);
      if (!el) return;

      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", href);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function PricingPage() {
  const [lang, setLang] = React.useState<Lang>("EN");
  const t = COPY[lang];

  useSmoothScroll();

  React.useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("mp_lang") : null;
    if (saved === "IS" || saved === "EN") setLang(saved);
  }, []);
  React.useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("mp_lang", lang);
  }, [lang]);

  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [plan, setPlan] = React.useState<PlanKey>("pro");
  const [sportEnv, setSportEnv] = React.useState<"outdoor" | "indoor">("outdoor");

  const [form, setForm] = React.useState<{
    name: string;
    email: string;
    org: string;
    sport: string;
    message: string;
  }>({
    name: "",
    email: "",
    org: "",
    sport: COPY[lang].sports[0],
    message: "",
  });

  React.useEffect(() => {
    setForm((p) => ({ ...p, sport: COPY[lang].sports[0] }));
  }, [lang]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);

    if (!form.name.trim()) return setError(t.demo.requiredName);
    if (!form.email.trim() || !form.email.includes("@")) return setError(t.demo.requiredEmail);
    if (!form.org.trim()) return setError(t.demo.requiredOrg);

    try {
      setLoading(true);

      const res = await fetch("/api/public/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          org: form.org.trim(),
          sport: form.sport?.trim() || null,
          message: form.message?.trim() || null,
          plan,
          sport_env: sportEnv,
          lang,
          source: "pricing_page",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Something went wrong.");
      }

      setSent(true);
      setForm({ name: "", email: "", org: "", sport: COPY[lang].sports[0], message: "" });
      setPlan("pro");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const Plans = React.useMemo(() => {
    // 4-tier structure (May 2026 restructure): Free / Lite / Pro / Elite.
    // Pricing is anchored to data tier (Lite Catapult plan vs Premium
    // Catapult plan), not sport — Pro Indoor was retired because it had
    // no Iceland addressable market and required Premium Catapult IMU
    // plans that no Iceland indoor club had. The sportEnv toggle is now
    // informational only — adds an indoor note to GPS-dependent items
    // in the comparison table, doesn't switch tier pricing.
    return [
      {
        key: "free" as const,
        dark: false,
        recommended: false,
        name: t.plans.free.name,
        pricePrimary: t.plans.free.pricePrimary,
        priceSecondary: t.plans.free.priceSecondary,
        note: t.plans.free.note,
        bullets: t.plans.free.bullets,
        cta: { label: t.plans.free.cta, href: "/signup" },
      },
      {
        key: "lite" as const,
        dark: false,
        recommended: false,
        name: t.plans.lite.name,
        pricePrimary: t.plans.lite.pricePrimary,
        priceLocal: t.plans.lite.priceLocal,
        priceSecondary: t.plans.lite.priceSecondary,
        note: t.plans.lite.note,
        bullets: t.plans.lite.bullets,
        cta: { label: t.plans.lite.cta, href: "/signup" },
      },
      {
        key: "pro" as const,
        dark: true,
        recommended: true,
        name: t.plans.pro.name,
        pricePrimary: t.plans.pro.pricePrimary,
        priceLocal: t.plans.pro.priceLocal,
        priceSecondary: t.plans.pro.priceSecondary,
        note: t.plans.pro.note,
        bullets: t.plans.pro.bullets,
        cta: { label: t.plans.pro.cta, href: "#demo" },
      },
      {
        key: "elite" as const,
        dark: false,
        recommended: false,
        name: t.plans.elite.name,
        pricePrimary: t.plans.elite.pricePrimary,
        priceLocal: t.plans.elite.priceLocal,
        priceSecondary: t.plans.elite.priceSecondary,
        note: t.plans.elite.note,
        indoorNote: sportEnv === "indoor" ? (lang === "IS" ? "GPS tengingar eiga ekki við innanhúss — allir aðrir Elite eiginleikar að fullu tiltækir." : "GPS provider integrations not applicable for indoor sports — all other Elite features fully available.") : undefined,
        bullets: t.plans.elite.bullets,
        cta: { label: t.plans.elite.cta, href: "#demo" },
      },
    ];
  }, [t, sportEnv, lang]);

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/home" className="flex items-center gap-2">
            <div className="relative h-7 w-7 overflow-hidden rounded-lg bg-emerald-500/90">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.45),transparent_55%)]" />
            </div>
                <span className="font-semibold tracking-tight">{MICROPULSE_PRODUCT_IDENTITY.name}</span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Lang toggle */}
            <div className="flex items-center rounded-xl border bg-white p-1">
              <button
                onClick={() => setLang("IS")}
                className={classNames(
                  "rounded-lg px-2.5 py-1 text-xs transition",
                  lang === "IS" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-black"
                )}
              >
                IS
              </button>
              <button
                onClick={() => setLang("EN")}
                className={classNames(
                  "rounded-lg px-2.5 py-1 text-xs transition",
                  lang === "EN" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-black"
                )}
              >
                EN
              </button>
            </div>

            <Link href="/login" className="rounded-xl border bg-white px-4 py-2 text-sm hover:bg-neutral-50">
              {t.nav.signIn}
            </Link>
            <a
              href="#demo"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 shadow-[0_18px_40px_rgba(37,99,235,0.25)]"
            >
              {t.nav.demo}
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(59,130,246,0.10),transparent_55%),radial-gradient(circle_at_75%_20%,rgba(16,185,129,0.10),transparent_55%)]" />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-neutral-50 to-transparent" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-neutral-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {t.nav.pricing}
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">{t.hero.title}</h1>
              <p className="mt-4 max-w-xl text-neutral-600">{t.hero.sub}</p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="rounded-2xl bg-neutral-900 px-6 py-3 text-sm text-white hover:bg-neutral-800"
                >
                  {t.nav.getStarted}
                </Link>
                <a href="#demo" className="rounded-2xl border px-6 py-3 text-sm hover:bg-neutral-50">
                  {t.nav.demo}
                </a>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 text-xs text-neutral-600">
                {t.hero.chips.map((c) => (
                  <span key={c} className="rounded-full border bg-white px-3 py-1">
                    {c}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold">{t.preview.title}</div>
              <div className="mt-3 grid gap-3 text-sm text-neutral-700">
                <div className="flex items-center justify-between rounded-2xl border bg-neutral-50 px-4 py-3">
                  <span>{t.preview.decision}</span>
                  <span className="rounded-xl bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    Full / Reduced / Recovery
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border bg-neutral-50 px-4 py-3">
                  <span>{t.preview.coach}</span>
                  <span className="rounded-xl bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                    Override + Lock
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border bg-neutral-50 px-4 py-3">
                  <span>{t.preview.team}</span>
                  <span className="rounded-xl bg-neutral-900 px-3 py-1 text-xs font-semibold text-white">
                    Multi-sport
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Positioning line */}
      <section className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-3xl border bg-neutral-50 px-6 py-8 text-center">
            <p className="text-base font-semibold tracking-tight md:text-lg">
              {t.positioning.line1}
              <br />
              {t.positioning.line2}
            </p>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold md:text-3xl">{t.plans.title}</h2>
              <p className="mt-2 text-sm text-neutral-600">{t.plans.sub}</p>
            </div>

            {/* Sport environment toggle */}
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-xs text-neutral-500">{t.sportToggle.label}</span>
              <div className="flex items-center rounded-xl border bg-neutral-50 p-1 text-sm">
                <button
                  onClick={() => setSportEnv("outdoor")}
                  className={classNames(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    sportEnv === "outdoor" ? "bg-white shadow-sm text-neutral-900 border" : "text-neutral-500 hover:text-neutral-700"
                  )}
                >
                  {t.sportToggle.outdoor}
                </button>
                <button
                  onClick={() => setSportEnv("indoor")}
                  className={classNames(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    sportEnv === "indoor" ? "bg-white shadow-sm text-neutral-900 border" : "text-neutral-500 hover:text-neutral-700"
                  )}
                >
                  {t.sportToggle.indoor}
                </button>
              </div>
            </div>
          </div>

          {/* 4-tier grid (May 2026 restructure) — Free / Lite / Pro / Elite
              side-by-side on desktop. Stacks 1-col on mobile, 2-col on small
              tablets, 4-col from md breakpoint up. Smaller gap so all four
              cards fit comfortably even with narrow content widths. */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {Plans.map((p) => (
              <div
                key={p.key}
                className={classNames(
                  "relative rounded-3xl border p-6 shadow-sm",
                  p.dark ? "bg-neutral-900 text-white border-neutral-900" : "bg-white"
                )}
              >
                {p.recommended ? (
                  <div className="absolute -top-3 left-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                    {t.plans.recommended}
                  </div>
                ) : null}

                <div className={classNames("text-sm font-semibold", p.dark ? "text-white" : "text-neutral-900")}>
                  {p.name}
                </div>

                <div className="mt-2 text-3xl font-semibold">{p.pricePrimary}</div>
                {p.priceLocal ? (
                  <div className={classNames("mt-0.5 text-xs", p.dark ? "text-white/55" : "text-neutral-400")}>
                    {p.priceLocal}
                  </div>
                ) : null}
                {/* Savings badge removed in May 2026 restructure — was tied to
                    Pro Indoor's GPS discount which no longer exists. */}
                <div className={classNames("mt-1 text-sm", p.dark ? "text-white/70" : "text-neutral-500")}>
                  {p.priceSecondary}
                </div>

                <div className={classNames("mt-3 text-sm", p.dark ? "text-white/70" : "text-neutral-600")}>
                  {p.note}
                </div>

                {"indoorNote" in p && p.indoorNote ? (
                  <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    {p.indoorNote}
                  </div>
                ) : null}

                <ul className={classNames("mt-6 space-y-2 text-sm", p.dark ? "text-white/90" : "text-neutral-700")}>
                  {p.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span
                        className={classNames(
                          "mt-0.5 h-5 w-5 rounded-md flex items-center justify-center text-xs",
                          p.dark
                            ? "bg-white/10"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        )}
                      >
                        ✓
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7">
                  {p.cta.href.startsWith("#") ? (
                    <a
                      href={p.cta.href}
                      className={classNames(
                        "block rounded-2xl px-4 py-3 text-center text-sm transition",
                        p.dark ? "bg-blue-600 text-white hover:bg-blue-700" : "border bg-white hover:bg-neutral-50"
                      )}
                    >
                      {p.cta.label}
                    </a>
                  ) : (
                    <Link
                      href={p.cta.href}
                      className={classNames(
                        "block rounded-2xl px-4 py-3 text-center text-sm transition",
                        p.dark ? "bg-blue-600 text-white hover:bg-blue-700" : "border bg-white hover:bg-neutral-50"
                      )}
                    >
                      {p.cta.label}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center text-sm text-neutral-500">{t.plans.trustLine}</div>

          <div className="mt-8 rounded-3xl border bg-neutral-50 p-6 text-center">
            <h3 className="text-lg font-semibold text-neutral-900">
              {lang === "IS" ? "Ertu ekki viss hvaða leið hentar teyminu?" : "Not sure which plan fits your team?"}
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              {lang === "IS"
                ? "Byrjaðu með Free eða bókaðu demo til að sjá hvernig MicroPulse styður staff og leikmenn í daglegum rekstri."
                : "Start with Free or talk to us about how MicroPulse can support your performance staff and athletes."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="rounded-2xl border bg-white px-5 py-2.5 text-sm text-neutral-900 hover:bg-neutral-100">
                {lang === "IS" ? "Byrja með Free" : "Start Free"}
              </Link>
              <a href="#demo" className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm text-white hover:bg-blue-700">
                {lang === "IS" ? "Bóka Demo" : "Book a Demo"}
              </a>
            </div>
          </div>

          {/* Compare — 5-column 4-tier grid (May 2026) */}
          <div className="mt-10 rounded-3xl border bg-neutral-50 p-6 md:p-8">
            <h3 className="text-lg font-semibold">{t.compare.title}</h3>
            <div className="mt-5 overflow-hidden rounded-2xl border bg-white">
              <div className="grid grid-cols-5 gap-0 border-b bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-600">
                <div>Feature</div>
                <div className="text-center">Free</div>
                <div className="text-center">Lite (Club)</div>
                <div className="text-center">Pro (Team)</div>
                <div className="text-center">Elite (Academy)</div>
              </div>
              {t.compare.rows.map((r) => (
                <div key={r[0]} className="grid grid-cols-5 gap-0 border-b px-4 py-3 text-sm">
                  <div className="text-neutral-700">{r[0]}</div>
                  <div className="text-center">{r[1]}</div>
                  <div className="text-center">{r[2]}</div>
                  <div className="text-center">{r[3]}</div>
                  <div className="text-center">{r[4]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold md:text-3xl">{t.demo.title}</h2>
              <p className="mt-3 text-neutral-600">{t.demo.sub}</p>

              <div className="mt-6 rounded-3xl border bg-neutral-50 p-6">
                <div className="text-sm font-semibold">{t.demo.leftTitle}</div>
                <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                  {t.demo.leftBullets.map((b) => (
                    <li key={b}>✅ {b}</li>
                  ))}
                </ul>
              </div>
            </div>

            <form onSubmit={onSubmit} className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold">{t.demo.formTitle}</div>

              <div className="mt-5 grid gap-4">
                <div className="grid gap-2">
                  <label className="text-xs text-neutral-600">{t.demo.planLabel}</label>
                  <select
                    className="rounded-xl border px-3 py-2 text-sm"
                    value={plan}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPlan(e.target.value as PlanKey)}
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="elite">Elite</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs text-neutral-600">{t.demo.name}</label>
                  <input
                    className="rounded-xl border px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder={lang === "IS" ? "Fullt nafn" : "Full name"}
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-xs text-neutral-600">{t.demo.email}</label>
                  <input
                    className="rounded-xl border px-3 py-2 text-sm"
                    value={form.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm((p) => ({ ...p, email: e.target.value }))
                    }
                    placeholder={lang === "IS" ? "nafn@klubbur.is" : "name@club.com"}
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-xs text-neutral-600">{t.demo.org}</label>
                  <input
                    className="rounded-xl border px-3 py-2 text-sm"
                    value={form.org}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, org: e.target.value }))}
                    placeholder={lang === "IS" ? "Klúbbur / Akademía" : "Club / Academy"}
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-xs text-neutral-600">{t.demo.sport}</label>
                  <select
                    className="rounded-xl border px-3 py-2 text-sm"
                    value={form.sport}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setForm((p) => ({ ...p, sport: e.target.value }))
                    }
                  >
                    {COPY[lang].sports.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs text-neutral-600">{t.demo.message}</label>
                  <textarea
                    className="min-h-[110px] rounded-xl border px-3 py-2 text-sm"
                    value={form.message}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setForm((p) => ({ ...p, message: e.target.value }))
                    }
                    placeholder={
                      lang === "IS"
                        ? "Hvað viltu leysa? Leikjaviku? RTP? Ferðalög?"
                        : "What are you trying to solve? Match-week? RTP? Travel?"
                    }
                  />
                </div>

                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                ) : null}

                {sent ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {t.demo.success}
                  </div>
                ) : null}

                <button
                  disabled={loading}
                  className="rounded-2xl bg-blue-600 px-4 py-3 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                  type="submit"
                >
                  {loading ? t.demo.sending : t.demo.submit}
                </button>

                <div className="text-xs text-neutral-500">
                  {lang === "IS"
                    ? "Með því að senda samþykkir þú að við höfum samband varðandi MicroPulse."
                    : "By submitting, you agree that we may contact you about MicroPulse."}
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>

      <footer className="border-t py-10 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} MicroPulse • {t.footer}
        <div className="mt-2">
          <Link href="/methodology" className="text-neutral-500 underline hover:text-neutral-900">
            {lang === "IS" ? "Aðferðafræði og vísindagrunnur" : "Methodology & science basis"}
          </Link>
        </div>
      </footer>
    </main>
  );
}
