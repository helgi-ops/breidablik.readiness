"use client";

import * as React from "react";
import Link from "next/link";

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
      title: "Performance decisions, made with precision.",
      sub: "MicroPulse is a performance intelligence platform built for modern teams. Turn daily readiness data into structured, accountable training decisions.",
      chips: ["Football", "Basketball", "High-performance teams"],
    },
    positioning: {
      line1: "MicroPulse isn’t a tracking tool.",
      line2: "It’s a decision intelligence system for performance departments.",
    },
    plans: {
      title: "Plans",
      sub: "Deploy at the level your performance environment requires.",
      recommended: "Recommended",
      free: {
        name: "Free",
        pricePrimary: "€0",
        priceSecondary: "0 ISK / month",
        note: "For evaluation and workflow testing.",
        bullets: ["Daily readiness inputs", "Basic decision output", "Limited team size", "Community support"],
        cta: "Start free",
      },
      pro: {
        name: "Pro",
        pricePrimary: "€349 / month",
        priceSecondary: "49,900 ISK / month",
        note: "For performance-driven teams operating in competitive environments.",
        bullets: [
          "Full team workflows",
          "Coach override + decision lock",
          "Decision templates",
          "Coach & player dashboards",
          "Match-week logic engine",
          "Stage 4 automation layer",
        ],
        cta: "Book a demo",
      },
      elite: {
        name: "Elite",
        pricePrimary: "From €1,250 / month",
        priceSecondary: "From 149,000 ISK / month",
        note: "For clubs deploying across multiple teams and departments.",
        bullets: [
          "Everything in Pro",
          "Multi-team architecture",
          "Custom workflows & integrations",
          "Structured onboarding & rollout",
          "Governance & policy controls",
          "Priority performance support",
        ],
        cta: "Talk to us",
      },
      trustLine: "Built for organizations preparing for the next generation of athlete management.",
    },
    compare: {
      title: "Quick compare",
      rows: [
        ["Daily inputs", "✅", "✅", "✅"],
        ["Decision output", "✅", "✅", "✅"],
        ["Coach override + lock", "—", "✅", "✅"],
        ["Templates & rotation", "—", "✅", "✅"],
        ["Match-week logic engine", "—", "✅", "✅"],
        ["Club rollout support", "—", "—", "✅"],
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
    footer: "Micro inputs. Clear signals. Better decisions.",
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
      title: "Ákvarðanir í afreksumhverfi — með nákvæmni.",
      sub: "MicroPulse er performance intelligence kerfi fyrir nútíma lið. Breyttu daglegum readiness gögnum í skýrar, rekjanlegar og ábyrgar æfingaákvarðanir.",
      chips: ["Fótbolti", "Körfubolti", "Afrekslið"],
    },
    positioning: {
      line1: "MicroPulse er ekki bara tracking.",
      line2: "Þetta er decision intelligence kerfi fyrir performance teymi.",
    },
    plans: {
      title: "Leiðir",
      sub: "Veldu innleiðingu sem passar þínu afreksumhverfi.",
      recommended: "Mælt með",
      free: {
        name: "Free",
        pricePrimary: "€0",
        priceSecondary: "0 ISK / mánuði",
        note: "Til að prófa vinnuflæðið og meta lausnina.",
        bullets: ["Daglegur readiness innsláttur", "Grunn-ákvörðun", "Takmörkuð liðastærð", "Community stuðningur"],
        cta: "Byrja frítt",
      },
      pro: {
        name: "Pro",
        pricePrimary: "€349 / mánuði",
        priceSecondary: "49.900 ISK / mánuði",
        note: "Fyrir lið og performance teymi í samkeppnisumhverfi.",
        bullets: [
          "Fullt teymisvinnuflæði",
          "Coach override + læsing",
          "Ákvörðunarsnið (templates)",
          "Coach & player dashboards",
          "Leikjaviku rökfræði (match-week)",
          "Stage 4 automation layer",
        ],
        cta: "Bóka demo",
      },
      elite: {
        name: "Elite",
        pricePrimary: "Frá €1,250 / mánuði",
        priceSecondary: "Frá 149.000 ISK / mánuði",
        note: "Fyrir klúbba sem innleiða á mörg lið og deildir.",
        bullets: [
          "Allt í Pro",
          "Multi-team architecture",
          "Sérsniðin vinnuflæði & tengingar",
          "Onboarding + innleiðing",
          "Governance & policy controls",
          "Forgangsstuðningur",
        ],
        cta: "Tala við okkur",
      },
      trustLine: "Fyrir félög sem eru að byggja upp næstu kynslóð athlete management.",
    },
    compare: {
      title: "Stutt samanburður",
      rows: [
        ["Daglegur innsláttur", "✅", "✅", "✅"],
        ["Ákvörðun", "✅", "✅", "✅"],
        ["Coach override + læsing", "—", "✅", "✅"],
        ["Snið + rotation", "—", "✅", "✅"],
        ["Leikjaviku rökfræði", "—", "✅", "✅"],
        ["Innleiðingarstuðningur", "—", "—", "✅"],
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
    footer: "Micro inputs. Clear signals. Better decisions.",
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

      // TODO: Hook this into /api/demo-request or Supabase insert.
      await new Promise((r) => setTimeout(r, 700));

      setSent(true);
      setForm({ name: "", email: "", org: "", sport: COPY[lang].sports[0], message: "" });
      setPlan("pro");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const Plans = [
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
      key: "pro" as const,
      dark: true,
      recommended: true,
      name: t.plans.pro.name,
      pricePrimary: t.plans.pro.pricePrimary,
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
      priceSecondary: t.plans.elite.priceSecondary,
      note: t.plans.elite.note,
      bullets: t.plans.elite.bullets,
      cta: { label: t.plans.elite.cta, href: "#demo" },
    },
  ];

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/home" className="flex items-center gap-2">
            <div className="relative h-7 w-7 overflow-hidden rounded-lg bg-emerald-500/90">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.45),transparent_55%)]" />
            </div>
            <span className="font-semibold tracking-tight">MicroPulse</span>
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
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold md:text-3xl">{t.plans.title}</h2>
              <p className="mt-2 text-sm text-neutral-600">{t.plans.sub}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
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
                <div className={classNames("text-sm", p.dark ? "text-white/70" : "text-neutral-500")}>
                  {p.priceSecondary}
                </div>

                <div className={classNames("mt-3 text-sm", p.dark ? "text-white/70" : "text-neutral-600")}>
                  {p.note}
                </div>

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

          {/* Compare */}
          <div className="mt-10 rounded-3xl border bg-neutral-50 p-6 md:p-8">
            <h3 className="text-lg font-semibold">{t.compare.title}</h3>
            <div className="mt-5 overflow-hidden rounded-2xl border bg-white">
              <div className="grid grid-cols-4 gap-0 border-b bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-600">
                <div>Feature</div>
                <div className="text-center">Free</div>
                <div className="text-center">Pro</div>
                <div className="text-center">Elite</div>
              </div>
              {t.compare.rows.map((r) => (
                <div key={r[0]} className="grid grid-cols-4 gap-0 border-b px-4 py-3 text-sm">
                  <div className="text-neutral-700">{r[0]}</div>
                  <div className="text-center">{r[1]}</div>
                  <div className="text-center">{r[2]}</div>
                  <div className="text-center">{r[3]}</div>
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
      </footer>
    </main>
  );
}