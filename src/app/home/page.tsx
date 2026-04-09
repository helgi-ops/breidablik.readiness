"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  MICROPULSE_PRODUCT_IDENTITY,
  ORDERED_PLAN_DEFINITIONS,
  getPlanSummary,
} from "@/lib/micropulse/product";

type Lang = "IS" | "EN";

type CopyShape = {
  nav: {
    how: string;
    platform: string;
    product: string;
    intelligence: string;
    pricing: string;
    blog: string;
    cta: string;
  };
  hero: {
    title: string;
    sub: string;
    primary: string;
    secondary: string;
    trust: string;
  };
  how: {
    title: string;
    steps: Array<{ t: string; d: string }>;
  };
  platform: {
    title: string;
    sub: string;
    cards: Array<{
      icon: string;
      t: string;
      d: string;
    }>;
  };
  product: {
    title: string;
    stats: Array<{ t: string; d: string }>;
  };
  intelligence: {
    title: string;
    sub: string;
    chips: string[];
  };
  cta: {
    title: string;
    body: string;
    primary: string;
    secondary: string;
  };
  footer: {
    copyright: string;
    pricing: string;
    features: string;
    blog: string;
  };
  auth: {
    signIn: string;
  };
};

const COPY: Record<Lang, CopyShape> = {
  EN: {
    nav: {
      how: "How it works",
      platform: "Platform",
      product: "Product",
      intelligence: "Intelligence",
      pricing: "Pricing",
      blog: "Blog",
      cta: "Get started",
    },
    hero: {
      title: "Know who's ready — before training starts.",
      sub: "One daily view for coaching, performance, and medical staff. Built on real GPS, FMP, and force plate data from your squad.",
      primary: "Start with Free",
      secondary: "Book a demo",
      trust: "Performance Intelligence Platform",
    },
    how: {
      title: "From check-in to training plan — in minutes.",
      steps: [
        {
          t: "1) Players check in",
          d: "Daily readiness and wellness data from your squad in 60 seconds per player.",
        },
        {
          t: "2) See the squad in one view",
          d: "Risk level, team action, and flagged players surfaced instantly.",
        },
        {
          t: "3) Review flagged players",
          d: "Understand why each player was flagged and what to do.",
        },
        {
          t: "4) Confirm the day plan",
          d: "Set FULL / REDUCED / RECOVERY and lock the decision. Every staff member sees the same picture.",
        },
      ],
    },
    platform: {
      title: "One platform. Six pillars.",
      sub: "Everything your performance staff needs — from daily readiness to return-to-play.",
      cards: [
        {
          icon: "📊",
          t: "Readiness Score",
          d: "Daily automatic readiness from check-in, GPS, and force plate data combined into one score.",
        },
        {
          icon: "⚡",
          t: "Load Monitoring",
          d: "GPS velocity bands, ACWR, mechanical load index, and metabolic load per player.",
        },
        {
          icon: "🏐",
          t: "Indoor / Outdoor Mode",
          d: "Toggle between GPS and FMP signals. Data always collected for both.",
        },
        {
          icon: "💪",
          t: "Force Testing",
          d: "VALD ForceDecks and ForceFrame with CMJ alerts and bilateral asymmetry tracking.",
        },
        {
          icon: "🏃",
          t: "Return-to-Play",
          d: "6-stage clinical RTP protocol with evidence-based criteria at each stage.",
        },
        {
          icon: "🎯",
          t: "Match-week Ops",
          d: "Week setup, yesterday load, TV display, messages, and staff alignment in one view.",
        },
      ],
    },
    product: {
      title: "See MicroPulse in action",
      stats: [
        {
          t: "Risk level",
          d: "Understand your team's readiness at a glance.",
        },
        {
          t: "Fatigue",
          d: "Detect systemic and individual fatigue patterns.",
        },
        {
          t: "Needs review",
          d: "Prioritize attention where it matters most.",
        },
        {
          t: "Recommendation",
          d: "Get evidence-based guidance for your training day.",
        },
      ],
    },
    intelligence: {
      title: "More than monitoring.",
      sub: "Combine readiness, risk, and decision support in one system.",
      chips: [
        "Baseline",
        "Volatility",
        "Neural Load",
        "ACWR",
        "MLI",
        "FMP",
        "VALD",
        "RTP",
      ],
    },
    cta: {
      title: "Ready to run smarter training days?",
      body: "Get your team started with MicroPulse today.",
      primary: "Start free",
      secondary: "Book demo",
    },
    footer: {
      copyright: "© 2026 MicroPulse. All rights reserved.",
      pricing: "Pricing",
      features: "Features",
      blog: "Blog",
    },
    auth: {
      signIn: "Sign in",
    },
  },
  IS: {
    nav: {
      how: "Hvernig virkar",
      platform: "Vettvangur",
      product: "Vöru",
      intelligence: "Greind",
      pricing: "Verðlagning",
      blog: "Greinum",
      cta: "Byrjaðu",
    },
    hero: {
      title: "Veistu hverjir eru tilbúnir — áður en æfingin byrjar.",
      sub: "Eitt daglegt yfirlit fyrir þjálfara-, performance- og medical staff. Byggt á raunverulegum GPS, FMP og kraftplatagögnum frá hópnum þínum.",
      primary: "Byrjaðu ókeypis",
      secondary: "Bókaðu demo",
      trust: "Performance Intelligence Platform",
    },
    how: {
      title: "Frá check-in yfir í æfingarplan — á nokkrum mínútum.",
      steps: [
        {
          t: "1) Leikmenn skrá sig inn",
          d: "Daglegir readiness og wellness gögn frá hópnum þínum á 60 sekúndum á leikmann.",
        },
        {
          t: "2) Sjáðu hópinn í einum glugga",
          d: "Áhættustig, teymis aðgerð og flaggaðir leikmenn birtir samstundis.",
        },
        {
          t: "3) Farðu yfir flaggaða leikmenn",
          d: "Skilja hvers vegna hver leikmaður var flaggaður og hvað á að gera.",
        },
        {
          t: "4) Staðfestu daginn áætlun",
          d: "Settu FULL / REDUCED / RECOVERY og lása ákvarðanir. Allir starfsmenn sjá sömu mynd.",
        },
      ],
    },
    platform: {
      title: "Einn vettvangur. Sex stoðir.",
      sub: "Allt sem performance staff þarf — frá daglegri readiness til return-to-play.",
      cards: [
        {
          icon: "📊",
          t: "Readiness Score",
          d: "Dagleg sjálfvirk readiness úr check-in, GPS og kraftplatagögnum sameinaðir í einn stig.",
        },
        {
          icon: "⚡",
          t: "Load Monitoring",
          d: "GPS hraðaböndum, ACWR, vélrænni hlaðningarvísitölu og efnaskiptaöktum á leikmann.",
        },
        {
          icon: "🏐",
          t: "Innanhúss / Úti Hamur",
          d: "Skiptu á milli GPS og FMP merkja. Gögn alltaf söfnuð fyrir báða.",
        },
        {
          icon: "💪",
          t: "Kraftmælingar",
          d: "VALD ForceDecks og ForceFrame með CMJ viðvörunum og samhverfu rakstum.",
        },
        {
          icon: "🏃",
          t: "Return-to-Play",
          d: "6 stigaflokk klínískt RTP samskiptareglur með sannanir-byggðum viðmiðum á hverju stigi.",
        },
        {
          icon: "🎯",
          t: "Leik-vikunni Ops",
          d: "Vikuuppsetningu, gæðum af gær, sjónvarps birtu, skilaboðum og starfsmanns samhæfingu í einum glugga.",
        },
      ],
    },
    product: {
      title: "Sjáðu MicroPulse í notkun",
      stats: [
        {
          t: "Áhættustig",
          d: "Skildu tilbúnileika hópsins þíns á augnablikinu.",
        },
        {
          t: "Þreyta",
          d: "Greina kerfisbundna og einstaka þreytu mynstur.",
        },
        {
          t: "Þarf yfirferð",
          d: "Forgangsraðaðu athygli þar sem það skiptir mestu.",
        },
        {
          t: "Tilmæli",
          d: "Fáðu sannanir-byggða leiðsögn fyrir æfingardag þinn.",
        },
      ],
    },
    intelligence: {
      title: "Meira en eftirlitsúttektir.",
      sub: "Sameinaðu readiness, áhættu og ákvarðanatækna stuðning í einu kerfi.",
      chips: [
        "Grundlína",
        "Flökt",
        "Taugaflutningaálag",
        "ACWR",
        "MLI",
        "FMP",
        "VALD",
        "RTP",
      ],
    },
    cta: {
      title: "Tilbúinn að keyra betri æfingardaga?",
      body: "Byrjaðu með MicroPulse í dag.",
      primary: "Byrjaðu ókeypis",
      secondary: "Bókaðu demo",
    },
    footer: {
      copyright: "© 2026 MicroPulse. Öll réttindi áskilin.",
      pricing: "Verðlagning",
      features: "Eiginleikar",
      blog: "Greinum",
    },
    auth: {
      signIn: "Skrá sig inn",
    },
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

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function HomeLanding() {
  const [lang, setLang] = React.useState<Lang>("EN");
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
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
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url(/hero-football.jpg)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/85" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-white via-white/70 to-transparent" />
        </div>

        {/* Header / Nav */}
        <header className="relative z-10">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-emerald-500/90" />
              <span className="font-semibold tracking-tight text-white/95">MicroPulse</span>
            </div>

            <nav className="hidden items-center gap-6 text-sm text-white/80 md:flex">
              <a href="#how" className="hover:text-white">
                {t.nav.how}
              </a>
              <a href="#platform" className="hover:text-white">
                {t.nav.platform}
              </a>
              <a href="#product" className="hover:text-white">
                {t.nav.product}
              </a>
              <a href="#intelligence" className="hover:text-white">
                {t.nav.intelligence}
              </a>
              <Link href="/pricing" className="hover:text-white">
                {t.nav.pricing}
              </Link>
              <Link href="/blog" className="hover:text-white">
                {t.nav.blog}
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-xl border border-white/20 bg-white/5 p-1">
                <button
                  onClick={() => setLang("IS")}
                  className={cx(
                    "rounded-lg px-2.5 py-1 text-xs transition",
                    lang === "IS" ? "bg-white/15 text-white" : "text-white/70 hover:text-white"
                  )}
                >
                  IS
                </button>
                <button
                  onClick={() => setLang("EN")}
                  className={cx(
                    "rounded-lg px-2.5 py-1 text-xs transition",
                    lang === "EN" ? "bg-white/15 text-white" : "text-white/70 hover:text-white"
                  )}
                >
                  EN
                </button>
              </div>

              <Link
                href="/login"
                className="hidden rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 md:block"
              >
                {t.auth.signIn}
              </Link>
              <Link
                href="/pricing"
                className="hidden rounded-xl bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 md:block"
              >
                {t.nav.cta}
              </Link>

              {/* Hamburger — mobile only */}
              <button
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/5 text-white md:hidden"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mobile menu dropdown */}
          {mobileMenuOpen && (
            <div className="absolute left-0 right-0 top-full z-50 border-t border-white/10 bg-black/90 px-6 py-4 backdrop-blur md:hidden">
              <nav className="flex flex-col gap-1 text-sm text-white/80">
                {[
                  { href: "#how", label: t.nav.how },
                  { href: "#platform", label: t.nav.platform },
                  { href: "#product", label: t.nav.product },
                  { href: "#intelligence", label: t.nav.intelligence },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="rounded-xl px-3 py-2.5 hover:bg-white/10 hover:text-white"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
                <Link
                  href="/pricing"
                  className="rounded-xl px-3 py-2.5 hover:bg-white/10 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t.nav.pricing}
                </Link>
                <Link
                  href="/blog"
                  className="rounded-xl px-3 py-2.5 hover:bg-white/10 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t.nav.blog}
                </Link>
                <div className="mt-2 flex gap-2 border-t border-white/10 pt-3">
                  <Link
                    href="/login"
                    className="flex-1 rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-center text-sm text-white transition hover:bg-white/10"
                  >
                    {t.auth.signIn}
                  </Link>
                  <Link
                    href="/pricing"
                    className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-center text-sm text-white transition hover:bg-blue-700"
                  >
                    {t.nav.cta}
                  </Link>
                </div>
              </nav>
            </div>
          )}
        </header>

        {/* Hero Content */}
        <div className="relative z-10">
          <div className="mx-auto max-w-5xl px-6 pb-16 pt-10 md:pb-24 md:pt-14">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
                {t.hero.title}
              </h1>
              <p className="mt-6 text-lg text-white/85">{t.hero.sub}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="rounded-2xl bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700"
                >
                  {t.hero.primary}
                </Link>
                <Link
                  href="/pricing#demo"
                  className="rounded-2xl border border-white/25 bg-white/5 px-6 py-3 text-white transition hover:bg-white/10"
                >
                  {t.hero.secondary}
                </Link>
              </div>

              <p className="mt-8 text-sm text-white/70">{t.hero.trust}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS SECTION ===== */}
      <section id="how" className="border-t border-neutral-100 bg-neutral-50 py-20 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              {t.how.title}
            </h2>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {t.how.steps.map((step, idx) => (
              <div key={idx} className="rounded-3xl bg-neutral-50 p-6">
                <h3 className="font-semibold text-neutral-900">{step.t}</h3>
                <p className="mt-3 text-sm text-neutral-600">{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PLATFORM PILLARS SECTION ===== */}
      <section id="platform" className="border-t border-neutral-100 bg-white py-20 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              {t.platform.title}
            </h2>
            <p className="mt-4 text-lg text-neutral-600">{t.platform.sub}</p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {t.platform.cards.map((card, idx) => (
              <div key={idx} className="rounded-3xl border border-neutral-200 bg-neutral-50 p-8 shadow-sm">
                <div className="text-4xl">{card.icon}</div>
                <h3 className="mt-4 font-semibold text-neutral-900">{card.t}</h3>
                <p className="mt-2 text-sm text-neutral-600">{card.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRODUCT SECTION ===== */}
      <section id="product" className="border-t border-neutral-100 bg-neutral-50 py-20 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
            {t.product.title}
          </h2>

          <div className="mt-12 overflow-hidden rounded-3xl bg-neutral-100">
            <div className="relative h-96 w-full bg-neutral-200">
              <Image
                src="/screenshots/today.png"
                alt="MicroPulse Dashboard"
                fill
                className="object-cover"
              />
            </div>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {t.product.stats.map((stat, idx) => (
              <div key={idx} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-neutral-900">{stat.t}</h3>
                <p className="mt-2 text-sm text-neutral-600">{stat.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== INTELLIGENCE SECTION ===== */}
      <section id="intelligence" className="border-t border-neutral-100 bg-white py-20 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              {t.intelligence.title}
            </h2>
            <p className="mt-4 text-lg text-neutral-600">{t.intelligence.sub}</p>
          </div>

          <div className="mt-12 overflow-hidden rounded-3xl bg-neutral-100">
            <div className="relative h-96 w-full bg-neutral-200">
              <Image
                src="/screenshots/intelligence.png"
                alt="Intelligence Dashboard"
                fill
                className="object-cover"
              />
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-2">
            {t.intelligence.chips.map((chip, idx) => (
              <span
                key={idx}
                className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section id="cta" className="border-t border-neutral-100 bg-neutral-900 py-20 text-white md:py-24">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            {t.cta.title}
          </h2>
          <p className="mt-4 text-lg text-neutral-400">{t.cta.body}</p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/login"
              className="rounded-2xl bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700"
            >
              {t.cta.primary}
            </Link>
            <Link
              href="/pricing#demo"
              className="rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-white transition hover:bg-white/15"
            >
              {t.cta.secondary}
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-6 border-t border-white/10 pt-8 text-sm">
            <Link href="/pricing" className="text-neutral-400 hover:text-white">
              {t.footer.pricing}
            </Link>
            <Link href="/features" className="text-neutral-400 hover:text-white">
              {t.footer.features}
            </Link>
            <Link href="/blog" className="text-neutral-400 hover:text-white">
              {t.footer.blog}
            </Link>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-neutral-900 py-8 text-center text-sm text-neutral-500">
        <div className="mx-auto max-w-5xl px-6">
          <p>{t.footer.copyright}</p>
        </div>
      </footer>
    </main>
  );
}
