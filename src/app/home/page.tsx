"use client";

import * as React from "react";
import Link from "next/link";

type Lang = "IS" | "EN";

type CopyShape = {
  nav: {
    how: string;
    coach: string;
    intelligence: string;
    decisions: string;
    faq: string;
    pricing: string;
    cta: string;
  };
  hero: {
    title: string;
    sub: string;
    primary: string;
    secondary: string;
    chips: string[];
    trust: string;
  };
  panel: {
    title: string;
    risk: string;
    action: string;
    needsReview: string;
    players: string;
    recommendation: string;
    piTitle: string;
    mix: string;
    volatility: string;
    baseline: string;
    neural: string;
  };
  how: {
    title: string;
    sub: string;
    steps: Array<{ t: string; d: string }>;
  };
  coach: {
    title: string;
    sub: string;
    cards: Array<{ t: string; d: string }>;
  };
  intelligence: {
    title: string;
    sub: string;
    chips: string[];
    list: Array<{ t: string; d: string }>;
    summaryTitle: string;
    summaryItems: string[];
  };
  decisions: {
    title: string;
    sub: string;
    items: string[];
  };
  testimonials: {
    title: string;
    items: Array<{ q: string; a: string }>;
  };
  faq: {
    title: string;
    items: Array<{ q: string; a: string }>;
  };
  cta: {
    title: string;
    body: string;
    start: string;
    walkthrough: string;
  };
  auth: { signIn: string };
  footer: string;
};

const COPY: Record<Lang, CopyShape> = {
  EN: {
    nav: {
      how: "How it works",
      coach: "Coach Dashboard",
      intelligence: "Team Intelligence",
      decisions: "Team Decisions",
      faq: "FAQ",
      pricing: "Pricing",
      cta: "Get started",
    },
    hero: {
      title: "From readiness inputs to today's training decision.",
      sub: "MicroPulse is a coach-controlled operating system for daily readiness: scan the squad, review flagged players, and confirm a clear team call (FULL / REDUCED / RECOVERY).",
      primary: "Start free",
      secondary: "Book a demo",
      chips: ["Today Command Center", "Performance Intelligence — Team", "Needs review workflow", "Check-in reminders", "Match-week tools"],
      trust: "Built for coaching operations",
    },
    panel: {
      title: "Today Command Center",
      risk: "Risk level: CAUTION",
      action: "Team action: REDUCED",
      needsReview: "Needs review: 7 players",
      players: "Total players: 30",
      recommendation: "Team plan recommendation: keep quality high, reduce volume, and apply individual mods for flagged players.",
      piTitle: "Performance Intelligence — Team",
      mix: "Readiness mix: 20% RED / 53% YELLOW / 27% GREEN",
      volatility: "Volatility: 60%",
      baseline: "Baseline: BUILDING",
      neural: "Team intelligence: dominant neural load rising, next-day risk moderate",
    },
    how: {
      title: "A daily coaching workflow, not dashboard noise",
      sub: "MicroPulse connects check-ins, team context, and staff review into one operational flow.",
      steps: [
        { t: "1) Players check in", d: "Daily readiness and wellness inputs are captured across the squad." },
        { t: "2) MicroPulse scans the team", d: "Command Center summarizes risk, action state, and who needs review." },
        { t: "3) Staff review flagged players", d: "Coaches use the review queue, reasons, and team context to decide fast." },
        { t: "4) Confirm and lock the plan", d: "Set FULL / REDUCED / RECOVERY, apply templates, save, and lock." },
      ],
    },
    coach: {
      title: "Coach Dashboard built for match-week reality",
      sub: "The dashboard is designed for scan → decide → confirm under time pressure.",
      cards: [
        { t: "Today Command Center", d: "Immediate team snapshot: risk, action, flagged players, and recommendation in one strip." },
        { t: "Players needing review", d: "Operational queue for players that need attention before training starts." },
        { t: "Coach controls", d: "Set FULL / REDUCED / RECOVERY, apply templates, save and lock decisions." },
        { t: "Performance Intelligence — Team", d: "Readiness mix, baseline, volatility, status snapshot, and plan recommendation." },
        { t: "Compliance monitoring", d: "Track missing check-ins, send reminders, and keep daily input coverage high." },
        { t: "Match-week operations", d: "Week setup, match minutes, templates, messages, TV view, and yesterday load context." },
      ],
    },
    intelligence: {
      title: "Supporting team intelligence that helps staff act early",
      sub: "Performance Intelligence and Team Intelligence sit under the daily command layer to support better calls.",
      chips: ["Baseline", "Volatility", "Readiness mix", "Neural load", "Fatigue pattern", "Unit alerts"],
      list: [
        { t: "Performance Intelligence — Team", d: "Macro context for the day: readiness distribution, stability, and team recommendation." },
        { t: "Team intelligence", d: "Dominant state, trajectory, next-day risk, and high-risk count in a concise coach view." },
        { t: "Neural + fatigue signal", d: "Spot rising neural load or systemic strain before it becomes a session problem." },
        { t: "Unit alerts", d: "Catch affected player groups early and coordinate decisions across staff." },
      ],
      summaryTitle: "Example team summary",
      summaryItems: [
        "Status snapshot: CAUTION",
        "Dominant fatigue pattern: MIXED",
        "Neural load: RISING",
        "Next-day risk: MODERATE",
        "High-risk players: 4",
      ],
    },
    decisions: {
      title: "Review the right players. Confirm the right plan.",
      sub: "Daily decision workspace for coaching staff.",
      items: [
        "Needs review queue with clear context",
        "Why / action clarity for each player",
        "Template-assisted plan decisions",
        "Save + lock for staff alignment",
        "Check-in reminders and missing-input follow-up",
        "Operational tools: messages, week setup, match minutes, TV view",
      ],
    },
    testimonials: {
      title: "Trusted in daily staff workflow",
      items: [
        { q: "We stopped debating dashboards and started confirming plans faster.", a: "Head Coach" },
        { q: "The review queue tells us exactly where to spend attention.", a: "Performance Staff" },
        { q: "Command Center + team intelligence gives us clear daily alignment.", a: "Sport Scientist" },
      ],
    },
    faq: {
      title: "FAQ",
      items: [
        { q: "Is this only for football?", a: "No. MicroPulse supports team-sport workflows across football, basketball, handball, volleyball, and academies." },
        { q: "What does the coach dashboard actually help with?", a: "It helps staff scan team status, review flagged players, decide faster, and confirm the plan for the day." },
        { q: "How do FULL / REDUCED / RECOVERY decisions work?", a: "The system turns daily readiness + context into a team action recommendation, with coach controls to adjust, save, and lock." },
        { q: "What is Performance Intelligence — Team?", a: "A team-level layer with readiness mix, volatility, baseline, status snapshot, and recommendation to support day-level calls." },
        { q: "Does MicroPulse help identify neural fatigue / next-day risk?", a: "Yes. Team intelligence surfaces dominant fatigue and neural load context, including trajectory and next-day risk summaries." },
        { q: "Can coaches lock decisions and use templates?", a: "Yes. Coaches can use templates and lock the final daily plan for staff consistency." },
        { q: "Does it support match-week operations?", a: "Yes. Workflows include week setup, match minutes, templates, messages, TV view, and compliance support." },
      ],
    },
    cta: {
      title: "Run today's readiness workflow with clarity.",
      body: "Give coaches one place to scan the squad, review flagged players, understand team intelligence, and confirm the training plan.",
      start: "Start free",
      walkthrough: "Book a demo",
    },
    auth: { signIn: "Sign in" },
    footer: "Coach-controlled readiness and team decisions.",
  },

  IS: {
    nav: {
      how: "Hvernig virkar",
      coach: "Coach Dashboard",
      intelligence: "Liðsgreind",
      decisions: "Ákvarðanir",
      faq: "Spurningar",
      pricing: "Verðskrá",
      cta: "Byrja",
    },
    hero: {
      title: "Frá readiness innslætti í skýra ákvörðun dagsins.",
      sub: "MicroPulse er coach-controlled stýrikerfi fyrir daglegt readiness: skannaðu hópinn, farðu yfir flagged leikmenn og staðfestu skýra liðákvörðun (FULL / REDUCED / RECOVERY).",
      primary: "Byrja frítt",
      secondary: "Bóka demo",
      chips: ["Today Command Center", "Performance Intelligence — Team", "Needs review workflow", "Check-in reminders", "Leikjaviku verkfæri"],
      trust: "Byggt fyrir þjálfarateymi",
    },
    panel: {
      title: "Today Command Center",
      risk: "Áhættustig: CAUTION",
      action: "Liðsaðgerð: REDUCED",
      needsReview: "Needs review: 7 leikmenn",
      players: "Heildarfjöldi: 30",
      recommendation: "Team plan recommendation: halda gæðum háum, lækka heildarálag og nota einstaklingsaðlögun fyrir flagged leikmenn.",
      piTitle: "Performance Intelligence — Team",
      mix: "Readiness mix: 20% RED / 53% YELLOW / 27% GREEN",
      volatility: "Volatility: 60%",
      baseline: "Baseline: BUILDING",
      neural: "Team intelligence: dominant neural load rising, next-day risk moderate",
    },
    how: {
      title: "Daglegt coach workflow, ekki dashboard hávaði",
      sub: "MicroPulse tengir check-in, liðssamhengi og staff review í eitt hagnýtt flæði.",
      steps: [
        { t: "1) Leikmenn skrá inn", d: "Dagleg readiness- og vellíðanargögn safnast fyrir allan hópinn." },
        { t: "2) MicroPulse skannar hópinn", d: "Command Center sýnir áhættu, liðsaðgerð og hverjir þurfa review." },
        { t: "3) Teymið fer yfir flagged leikmenn", d: "Þjálfarar nota review queue, skýringar og samhengi til að taka hraðari ákvarðanir." },
        { t: "4) Staðfesta og læsa plani", d: "Setja FULL / REDUCED / RECOVERY, velja template, vista og læsa." },
      ],
    },
    coach: {
      title: "Coach Dashboard fyrir raunverulegan leikjaviku-dag",
      sub: "Dashboardið er hannað fyrir skanna → ákveða → staðfesta undir tímamörkum.",
      cards: [
        { t: "Today Command Center", d: "Skýr samantekt dagsins: áhætta, liðsaðgerð, flagged leikmenn og ráðlegging í einu view." },
        { t: "Players needing review", d: "Hagnýt review röð fyrir þá leikmenn sem þurfa athygli fyrir æfingu." },
        { t: "Coach controls", d: "Setja FULL / REDUCED / RECOVERY, velja templates, vista og læsa ákvörðun." },
        { t: "Performance Intelligence — Team", d: "Readiness mix, baseline, volatility, status snapshot og liðsráðlegging." },
        { t: "Compliance monitoring", d: "Fylgjast með vantar check-in, senda reminders og bæta daglega gagnaskráningu." },
        { t: "Leikjaviku verkfæri", d: "Week setup, match minutes, templates, messages, TV view og yesterday load samhengi." },
      ],
    },
    intelligence: {
      title: "Liðsgreind sem hjálpar teyminu að bregðast fyrr við",
      sub: "Performance Intelligence og Team Intelligence styðja daglega ákvörðun, án óþarfa flækju.",
      chips: ["Baseline", "Volatility", "Readiness mix", "Neural load", "Fatigue pattern", "Unit alerts"],
      list: [
        { t: "Performance Intelligence — Team", d: "Yfirsýn dagsins: readiness dreifing, stöðugleiki og liðsráðlegging." },
        { t: "Team intelligence", d: "Dominant state, trajectory, next-day risk og high-risk count í stuttri coach samantekt." },
        { t: "Neural + fatigue signal", d: "Sjá rising neural load eða systemic þreytu áður en það verður æfingavandamál." },
        { t: "Unit alerts", d: "Greina snemma hvaða leikmannahópar eru undir álagi og samhæfa teymisákvarðanir." },
      ],
      summaryTitle: "Dæmi um liðsyfirlit",
      summaryItems: [
        "Status snapshot: CAUTION",
        "Dominant fatigue pattern: MIXED",
        "Neural load: RISING",
        "Next-day risk: MODERATE",
        "High-risk players: 4",
      ],
    },
    decisions: {
      title: "Farðu yfir rétta leikmenn. Staðfestu rétt plan.",
      sub: "Daglegt ákvarðanavinnusvæði fyrir þjálfarateymi.",
      items: [
        "Needs review röð með skýru samhengi",
        "Skýrleiki í why / action fyrir hvern leikmann",
        "Template-studdar ákvarðanir",
        "Vista + læsa fyrir samræmi í teymi",
        "Check-in reminders og eftirfylgni þegar input vantar",
        "Rekstrarverkfæri: messages, week setup, match minutes, TV view",
      ],
    },
    testimonials: {
      title: "Treyst í daglegu teymisflæði",
      items: [
        { q: "Við hættum að rökræða dashboard og fórum að staðfesta plan hraðar.", a: "Aðalþjálfari" },
        { q: "Review röðin segir okkur nákvæmlega hvar við eigum að setja athygli.", a: "Performance teymi" },
        { q: "Command Center + liðsgreind gefur skýra daglega samstillingu.", a: "Sport Scientist" },
      ],
    },
    faq: {
      title: "Algengar spurningar",
      items: [
        { q: "Er þetta bara fyrir fótbolta?", a: "Nei. MicroPulse styður vinnuflæði fyrir mismunandi liðasport, m.a. fótbolta, körfu, handbolta, blak og akademíur." },
        { q: "Hvernig nýtist coach dashboardið í raun?", a: "Það hjálpar teyminu að skanna stöðu liðsins, fara yfir flagged leikmenn, taka hraðari ákvörðun og staðfesta dagsplanið." },
        { q: "Hvernig virkar FULL / REDUCED / RECOVERY?", a: "Kerfið sameinar readiness og samhengi í liðsaðgerð, með coach stjórnun til að breyta, vista og læsa endanlegri ákvörðun." },
        { q: "Hvað er Performance Intelligence — Team?", a: "Liðslag sem sýnir readiness mix, volatility, baseline, status snapshot og liðsráðleggingu fyrir daginn." },
        { q: "Hjálpar MicroPulse með neural fatigue / next-day risk?", a: "Já. Team intelligence sýnir dominant fatigue og neural load samhengi, ásamt trajectory og next-day risk samantekt." },
        { q: "Geta þjálfarar læst ákvörðunum og notað templates?", a: "Já. Þjálfarar geta unnið með templates og læst daglegri niðurstöðu fyrir samræmi í staffi." },
        { q: "Styður kerfið leikjaviku rekstur?", a: "Já. Flæðið styður week setup, match minutes, templates, messages, TV view og compliance eftirfylgni." },
      ],
    },
    cta: {
      title: "Keyrðu readiness workflow dagsins með skýrleika.",
      body: "Gefðu þjálfurum einn stað til að skanna hópinn, fara yfir flagged leikmenn, skilja liðsgreind og staðfesta æfingaplan dagsins.",
      start: "Byrja frítt",
      walkthrough: "Bóka demo",
    },
    auth: { signIn: "Innskrá" },
    footer: "Coach-controlled readiness og liðsákvarðanir.",
  },
};

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

export default function HomeLanding() {
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

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/hero-football.jpg)" }} />
          <div className="absolute inset-0 bg-cover bg-center opacity-60 mix-blend-overlay" style={{ backgroundImage: "url(/hero-basketball.jpg)" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/80" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-white via-white/75 to-transparent" />
        </div>

        <header className="relative z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2">
              <div className="relative h-7 w-7 overflow-hidden rounded-lg bg-emerald-500/90" />
              <span className="font-semibold tracking-tight text-white/90">MicroPulse</span>
            </div>

            <nav className="hidden items-center gap-7 text-sm text-white/80 md:flex">
              <a href="#how" className="hover:text-white">{t.nav.how}</a>
              <a href="#coach" className="hover:text-white">{t.nav.coach}</a>
              <a href="#intelligence" className="hover:text-white">{t.nav.intelligence}</a>
              <a href="#decisions" className="hover:text-white">{t.nav.decisions}</a>
              <a href="#faq" className="hover:text-white">{t.nav.faq}</a>
              <Link href="/pricing" className="hover:text-white">{t.nav.pricing}</Link>
            </nav>

            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-xl border border-white/20 bg-white/5 p-1">
                <button onClick={() => setLang("IS")} className={`rounded-lg px-2.5 py-1 text-xs transition ${lang === "IS" ? "bg-white/15 text-white" : "text-white/70 hover:text-white"}`}>IS</button>
                <button onClick={() => setLang("EN")} className={`rounded-lg px-2.5 py-1 text-xs transition ${lang === "EN" ? "bg-white/15 text-white" : "text-white/70 hover:text-white"}`}>EN</button>
              </div>

              <Link href="/login" className="rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10">
                {t.auth.signIn}
              </Link>
              <Link href="/pricing" className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition hover:bg-blue-700">
                {t.nav.cta}
              </Link>
            </div>
          </div>
        </header>

        <div className="relative z-10">
          <div className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pb-24 md:pt-14">
            <div className="grid items-center gap-10 md:grid-cols-2">
              <div>
                <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">{t.hero.title}</h1>
                <p className="mt-5 max-w-xl text-white/80 md:text-lg">{t.hero.sub}</p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/signup" className="rounded-2xl bg-blue-600 px-6 py-3 text-white shadow-[0_20px_55px_rgba(37,99,235,0.35)] transition hover:bg-blue-700">{t.hero.primary}</Link>
                  <Link href="/pricing#demo" className="rounded-2xl border border-white/25 bg-white/5 px-6 py-3 text-white transition hover:bg-white/10">{t.hero.secondary}</Link>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-white/60">
                  {t.hero.chips.map((chip) => (
                    <span key={chip} className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">{chip}</span>
                  ))}
                </div>

                <div className="mt-8 text-xs tracking-widest text-white/55">{t.hero.trust.toUpperCase()}</div>
              </div>

              <div className="relative mx-auto w-full max-w-xl">
                <div className="rounded-3xl bg-white/95 p-5 shadow-[0_40px_90px_rgba(0,0,0,0.45)] ring-1 ring-black/10">
                  <div className="text-sm font-semibold text-neutral-900">{t.panel.title}</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border bg-white p-3 text-sm font-medium text-neutral-800">{t.panel.risk}</div>
                    <div className="rounded-2xl border bg-white p-3 text-sm font-medium text-neutral-800">{t.panel.action}</div>
                    <div className="rounded-2xl border bg-white p-3 text-sm font-medium text-neutral-800">{t.panel.needsReview}</div>
                    <div className="rounded-2xl border bg-white p-3 text-sm font-medium text-neutral-800">{t.panel.players}</div>
                  </div>
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t.panel.recommendation}</div>

                  <div className="mt-5 rounded-2xl border bg-neutral-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t.panel.piTitle}</div>
                    <div className="mt-2 space-y-1.5 text-sm text-neutral-700">
                      <div>{t.panel.mix}</div>
                      <div>{t.panel.volatility}</div>
                      <div>{t.panel.baseline}</div>
                      <div>{t.panel.neural}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold md:text-3xl">{t.how.title}</h2>
          <p className="mt-3 max-w-3xl text-sm text-neutral-600">{t.how.sub}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {t.how.steps.map((step) => (
              <div key={step.t} className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold">{step.t}</div>
                <div className="mt-2 text-sm text-neutral-600">{step.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="coach" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h3 className="text-2xl font-semibold md:text-3xl">{t.coach.title}</h3>
          <p className="mt-3 max-w-3xl text-sm text-neutral-600">{t.coach.sub}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {t.coach.cards.map((card) => (
              <div key={card.t} className="rounded-3xl border bg-white p-6 shadow-sm">
                <div className="text-sm font-semibold">{card.t}</div>
                <div className="mt-2 text-sm text-neutral-600">{card.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="intelligence" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h3 className="text-2xl font-semibold md:text-3xl">{t.intelligence.title}</h3>
              <p className="mt-3 text-sm text-neutral-600">{t.intelligence.sub}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {t.intelligence.chips.map((chip) => (
                  <span key={chip} className="rounded-full border bg-white px-3 py-1 text-xs text-neutral-700 shadow-sm">{chip}</span>
                ))}
              </div>
              <div className="mt-6 space-y-3">
                {t.intelligence.list.map((item) => (
                  <div key={item.t} className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="text-sm font-semibold">{item.t}</div>
                    <div className="mt-1.5 text-sm text-neutral-600">{item.d}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border bg-neutral-50 p-6 shadow-sm">
              <div className="text-sm font-semibold">{t.intelligence.summaryTitle}</div>
              <div className="mt-4 space-y-2">
                {t.intelligence.summaryItems.map((line) => (
                  <div key={line} className="rounded-2xl border bg-white px-4 py-3 text-sm text-neutral-700">{line}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="decisions" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="md:col-span-2">
              <h3 className="text-2xl font-semibold">{t.decisions.title}</h3>
              <p className="mt-3 text-sm text-neutral-600">{t.decisions.sub}</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {t.decisions.items.map((item) => (
                  <div key={item} className="rounded-2xl border bg-white p-4 text-sm text-neutral-700 shadow-sm">✅ {item}</div>
                ))}
              </div>
            </div>

            <div id="cta" className="rounded-3xl border bg-neutral-50 p-6 shadow-sm">
              <h4 className="text-lg font-semibold">{t.cta.title}</h4>
              <p className="mt-2 text-sm text-neutral-600">{t.cta.body}</p>
              <div className="mt-5 grid gap-3">
                <Link href="/signup" className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-white transition hover:bg-blue-700">{t.cta.start}</Link>
                <Link href="/pricing#demo" className="rounded-2xl border bg-white px-4 py-3 text-center transition hover:bg-neutral-50">{t.cta.walkthrough}</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h3 className="text-2xl font-semibold md:text-3xl">{t.testimonials.title}</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {t.testimonials.items.map((item) => (
              <div key={item.q} className="rounded-3xl border bg-white p-6 shadow-sm">
                <div className="text-sm text-neutral-700">“{item.q}”</div>
                <div className="mt-4 text-xs text-neutral-500">— {item.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h3 className="text-2xl font-semibold md:text-3xl">{t.faq.title}</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {t.faq.items.map((item) => (
              <details key={item.q} className="group rounded-3xl border bg-white p-6 shadow-sm">
                <summary className="cursor-pointer list-none text-sm font-semibold">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-600" />
                    {item.q}
                  </span>
                  <span className="float-right text-neutral-400 transition group-open:rotate-180">⌄</span>
                </summary>
                <p className="mt-3 text-sm text-neutral-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-10 text-center text-xs text-neutral-500">© {new Date().getFullYear()} MicroPulse • {t.footer}</footer>
    </main>
  );
}
