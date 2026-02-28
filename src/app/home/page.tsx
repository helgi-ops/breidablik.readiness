"use client";

import * as React from "react";
import Link from "next/link";

type Lang = "IS" | "EN";

const COPY = {
  EN: {
    nav: {
      how: "How it works",
      features: "Features",
      usecases: "Use cases",
      faq: "FAQ",
      pricing: "Pricing",
      cta: "Get started",
    },
    hero: {
      title: "Micro inputs. Clear signals. Better decisions.",
      sub:
        "A readiness platform that ends in a decision — not a dashboard. Daily inputs become a clear call: Full / Reduced / Recovery.",
      primary: "Start tracking",
      secondary: "View demo",
      chips: ["Football", "Basketball", "Any team sport"],
      trust: "Used by performance teams",
    },
    panel: {
      coach: "Coach Dashboard — Today",
      player: "Player View — Today",
      signal: "Team Signal",
      green: "GREEN — Ready",
      decision: "Today's Decision",
      full: "FULL",
      locked: "Plan locked",
      status: "Status",
      ready: "READY — Full Training",
      note: "Plan locked • Low soreness • Green signal",
      logic: "Logic & Analysis",
    },
    how: {
      title: "Micro inputs → Decision Engine → Clear action",
      a: { t: "1) Inputs", d: "Sleep • Soreness • Readiness" },
      b: { t: "2) Logic", d: "Rules + context (match week, travel, load)" },
      c: { t: "3) Decision", d: "Green / Yellow / Red — with coach control" },
      badges: { g: "GREEN — Full", y: "YELLOW — Reduced", r: "RED — Recovery" },
    },
    features: {
      title: "Built for high performance",
      cards: [
        { t: "Decision-first workflow", d: "Every day ends with a clear training call — not more charts." },
        { t: "Coach override + lock", d: "Lock plans, override signals, keep staff aligned." },
        { t: "Explainability", d: "Show athletes the “why” behind the signal." },
        { t: "Works in groups", d: "Coach view supports squads, not just 1-on-1." },
        { t: "Match-week ready", d: "Microdosing logic supports MD-4 → MD+1 flows." },
        { t: "Sport-agnostic", d: "Same engine works for football, basketball and more." },
      ],
    },
    usecases: {
      title: "Pro use cases",
      items: [
        "Match-week microdosing",
        "Return-to-play protocols",
        "Travel fatigue management",
        "Group training signals",
        "Academy load control",
        "Coach override workflows",
      ],
    },
    testimonials: {
      title: "Trusted because it’s simple",
      items: [
        { q: "Finally a readiness tool that actually ends in a decision.", a: "Head Coach" },
        { q: "Players understand it. Staff trusts it. That's rare.", a: "Performance Staff" },
        { q: "Less noise for coaches, clearer expectations for players.", a: "Sport Scientist" },
      ],
    },
    faq: {
      title: "FAQ",
      items: [
        {
          q: "Is this only for football?",
          a: "No. The engine is sport-agnostic: football, basketball, handball, volleyball, academy teams and more.",
        },
        {
          q: "What inputs are required?",
          a: "You can start with simple daily inputs like sleep, soreness and readiness — and add context rules later.",
        },
        {
          q: "Can coaches override the decision?",
          a: "Yes. MicroPulse is coach-controlled: override, lock plans, and keep decisions consistent across staff.",
        },
      ],
    },
    cta: {
      title: "Start with clarity. Scale with structure.",
      body: "Turn daily micro inputs into a clean, coach-controlled training decision.",
      start: "Start free",
      walkthrough: "Book a demo",
    },
    auth: { signIn: "Sign in", startFree: "Start free" },
    footer: "Micro inputs. Clear signals. Better decisions.",
  },

  IS: {
    nav: {
      how: "Hvernig virkar",
      features: "Eiginleikar",
      usecases: "Notkun",
      faq: "Spurningar",
      pricing: "Verðskrá",
      cta: "Byrja",
    },
    hero: {
      title: "Micro inputs. Clear signals. Better decisions.",
      sub:
        "Readiness kerfi sem endar í ákvörðun — ekki dashboard. Daglegur innsláttur verður að skýrri æfingaákvörðun: Full / Reduced / Recovery.",
      primary: "Byrja að skrá",
      secondary: "Bóka demo",
      chips: ["Fótbolti", "Körfubolti", "Öll liðasport"],
      trust: "Notað af afreks teymum",
    },
    panel: {
      coach: "Coach Dashboard — Í dag",
      player: "Player View — Í dag",
      signal: "Liðssignal",
      green: "GREEN — Tilbúið",
      decision: "Ákvörðun dagsins",
      full: "FULL",
      locked: "Plan læst",
      status: "Staða",
      ready: "READY — Full æfing",
      note: "Plan læst • Lítil eymsli • Grænt signal",
      logic: "Logic & Analysis",
    },
    how: {
      title: "Micro inputs → Decision Engine → Skýr aðgerð",
      a: { t: "1) Innsláttur", d: "Svefn • Eymsli • Readiness" },
      b: { t: "2) Rökfræði", d: "Reglur + samhengi (leikjavika, ferðalag, álag)" },
      c: { t: "3) Ákvörðun", d: "Green / Yellow / Red — með stjórn þjálfara" },
      badges: { g: "GREEN — Full", y: "YELLOW — Reduced", r: "RED — Recovery" },
    },
    features: {
      title: "Hannað fyrir afreksumhverfi",
      cards: [
        { t: "Ákvörðun fyrst", d: "Dagurinn endar í skýrri æfingaákvörðun — ekki fleiri grafa." },
        { t: "Override + læsing", d: "Læstu dagsplani, override-aðu signöl, samstilltu teymið." },
        { t: "Skýring á 'af hverju'", d: "Leikmenn sjá rök og skilja af hverju ákvörðunin kom." },
        { t: "Virkar í hóp", d: "Coach view styður lið, ekki bara 1-á-1." },
        { t: "Leikjavikur flæði", d: "Microdosing rökfræði styður MD-4 → MD+1." },
        { t: "Óháð íþrótt", d: "Sami mótor virkar fyrir fótbolta, körfu og fleira." },
      ],
    },
    usecases: {
      title: "Notkun í afreksumhverfi",
      items: [
        "Microdosing í leikjaviku",
        "Return-to-play ferlar",
        "Stjórnun ferðþreytu",
        "Signöl í hópþjálfun",
        "Álagsstýring í akademíu",
        "Coach override vinnuflæði",
      ],
    },
    testimonials: {
      title: "Traust vegna einfaldleika",
      items: [
        { q: "Loks readiness kerfi sem endar í ákvörðun.", a: "Aðalþjálfari" },
        { q: "Leikmenn skilja þetta. Starfsfólk treystir því. Sjaldgæft.", a: "Performance teymi" },
        { q: "Minni hávaði, meiri skýrleiki — bæði fyrir þjálfara og leikmenn.", a: "Sport Scientist" },
      ],
    },
    faq: {
      title: "Algengar spurningar",
      items: [
        {
          q: "Er þetta bara fyrir fótbolta?",
          a: "Nei. Kerfið er óháð íþrótt: fótbolti, körfubolti, handbolti, blak, akademíur og fleira.",
        },
        {
          q: "Hvaða mælingar þarf?",
          a: "Þú getur byrjað með einfaldan daglegan innslátt (svefn, eymsli, readiness) og bætt reglum/samhengi seinna.",
        },
        {
          q: "Geta þjálfarar override-að ákvörðun?",
          a: "Já. MicroPulse er coach-controlled: override, læsing á plani og samræmi í teymi.",
        },
      ],
    },
    cta: {
      title: "Byrjaðu með skýrleika. Skalaðu með strúktúr.",
      body: "Umbreyttu micro inputs í skýra, coach-controlled æfingaákvörðun.",
      start: "Byrja frítt",
      walkthrough: "Bóka demo",
    },
    auth: { signIn: "Innskrá", startFree: "Byrja frítt" },
    footer: "Micro inputs. Clear signals. Better decisions.",
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

export default function HomeLanding() {
  const [lang, setLang] = React.useState<Lang>("EN");
  const t = COPY[lang];

  useSmoothScroll();

  // Remember choice
  React.useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("mp_lang") : null;
    if (saved === "IS" || saved === "EN") setLang(saved);
  }, []);
  React.useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("mp_lang", lang);
  }, [lang]);

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Background: cinematic blend */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/hero-football.jpg)" }} />
          <div
            className="absolute inset-0 bg-cover bg-center opacity-60 mix-blend-overlay"
            style={{ backgroundImage: "url(/hero-basketball.jpg)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/80" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.25),transparent_45%),radial-gradient(circle_at_75%_30%,rgba(16,185,129,0.18),transparent_45%)]" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-white via-white/70 to-transparent" />
        </div>

        {/* NAV */}
        <header className="relative z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2">
              <div className="relative h-7 w-7 overflow-hidden rounded-lg bg-emerald-500/90">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.45),transparent_55%)]" />
              </div>
              <span className="text-white/90 font-semibold tracking-tight">MicroPulse</span>
            </div>

            <nav className="hidden items-center gap-7 text-sm text-white/80 md:flex">
              <a href="#how" className="hover:text-white">{t.nav.how}</a>
              <a href="#features" className="hover:text-white">{t.nav.features}</a>
              <a href="#usecases" className="hover:text-white">{t.nav.usecases}</a>
              <a href="#faq" className="hover:text-white">{t.nav.faq}</a>

              {/* ✅ NEW: Pricing page */}
              <Link href="/pricing" className="hover:text-white">
                {t.nav.pricing}
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              {/* Lang toggle */}
              <div className="flex items-center rounded-xl border border-white/20 bg-white/5 p-1">
                <button
                  onClick={() => setLang("IS")}
                  className={`rounded-lg px-2.5 py-1 text-xs transition ${
                    lang === "IS" ? "bg-white/15 text-white" : "text-white/70 hover:text-white"
                  }`}
                >
                  IS
                </button>
                <button
                  onClick={() => setLang("EN")}
                  className={`rounded-lg px-2.5 py-1 text-xs transition ${
                    lang === "EN" ? "bg-white/15 text-white" : "text-white/70 hover:text-white"
                  }`}
                >
                  EN
                </button>
              </div>

              <Link
                href="/login"
                className="rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 transition"
              >
                {t.auth.signIn}
              </Link>

              {/* ✅ Optional: take users to pricing as “Get started” */}
              <Link
                href="/pricing"
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 transition shadow-[0_18px_40px_rgba(37,99,235,0.35)]"
              >
                {t.nav.cta}
              </Link>
            </div>
          </div>
        </header>

        {/* HERO CONTENT */}
        <div className="relative z-10">
          <div className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pb-24 md:pt-14">
            <div className="grid items-center gap-10 md:grid-cols-2">
              <div>
                <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl drop-shadow-[0_8px_30px_rgba(0,0,0,0.55)]">
                  {t.hero.title}
                </h1>

                <p className="mt-5 max-w-xl text-white/80 md:text-lg">{t.hero.sub}</p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="/signup"
                    className="rounded-2xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 transition shadow-[0_20px_55px_rgba(37,99,235,0.35)]"
                  >
                    {t.hero.primary}
                  </Link>

                  {/* ✅ NEW: demo goes to /pricing#demo */}
                  <Link
                    href="/pricing#demo"
                    className="rounded-2xl border border-white/25 bg-white/5 px-6 py-3 text-white hover:bg-white/10 transition"
                  >
                    {t.hero.secondary}
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-white/60">
                  {t.hero.chips.map((c) => (
                    <span key={c} className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">
                      {c}
                    </span>
                  ))}
                </div>

                <div className="mt-10 flex items-center gap-3 text-xs text-white/55">
                  <span className="tracking-widest">{t.hero.trust.toUpperCase()}</span>
                  <span className="h-1 w-1 rounded-full bg-white/30" />
                  <span>Academy</span>
                  <span>Pro</span>
                  <span>Elite</span>
                </div>
              </div>

              {/* Premium mockups (óbreytt) */}
              <div className="relative">
                <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[40px] bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.22),transparent_60%),radial-gradient(circle_at_75%_20%,rgba(16,185,129,0.18),transparent_60%)] blur-2xl" />

                <div className="relative mx-auto max-w-xl">
                  <div className="rounded-3xl bg-white/95 shadow-[0_40px_90px_rgba(0,0,0,0.45)] ring-1 ring-black/10 overflow-hidden">
                    <div className="flex items-center justify-between border-b bg-white px-5 py-3">
                      <div className="text-sm font-semibold text-neutral-800">{t.panel.coach}</div>
                      <div className="flex gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
                        <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
                        <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
                      </div>
                    </div>

                    <div className="grid gap-4 p-5 md:grid-cols-2">
                      <div className="rounded-2xl border bg-white p-4 shadow-sm">
                        <div className="text-xs text-neutral-500">{t.panel.signal}</div>
                        <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 text-emerald-800">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          <span className="text-sm font-semibold">{t.panel.green}</span>
                        </div>

                        <div className="mt-4 space-y-2 text-sm text-neutral-700">
                          <div className="flex justify-between"><span>Sleep</span><span className="text-emerald-700">+0.6</span></div>
                          <div className="flex justify-between"><span>Soreness</span><span className="text-emerald-700">-0.4</span></div>
                          <div className="flex justify-between"><span>Readiness</span><span className="text-emerald-700">+0.3</span></div>
                        </div>
                      </div>

                      <div className="rounded-2xl border bg-white p-4 shadow-sm">
                        <div className="text-xs text-neutral-500">{t.panel.decision}</div>
                        <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-white shadow-[0_18px_40px_rgba(16,185,129,0.25)]">
                          <span className="text-sm font-semibold">{t.panel.full}</span>
                          <span className="text-xs opacity-90">{t.panel.locked}</span>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-xl bg-emerald-100 px-2 py-2 text-center text-emerald-800">Full</div>
                          <div className="rounded-xl bg-amber-100 px-2 py-2 text-center text-amber-800">Reduced</div>
                          <div className="rounded-xl bg-red-100 px-2 py-2 text-center text-red-800">Recovery</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="absolute -bottom-10 -right-4 w-[78%] rounded-3xl bg-neutral-950/85 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur md:-right-8 md:w-[64%]">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-white/90">{t.panel.player}</div>
                      <div className="text-[10px] text-white/60">{t.panel.logic}</div>
                    </div>
                    <div className="mt-3 rounded-2xl bg-white/5 p-3">
                      <div className="text-[10px] text-white/60">{t.panel.status}</div>
                      <div className="mt-1 text-sm font-semibold text-white">{t.panel.ready}</div>
                      <div className="mt-2 text-[11px] text-white/70">{t.panel.note}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-16 hidden text-center text-xs text-white/55 md:block">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 backdrop-blur">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Decision locked • Staff aligned • Players informed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-3xl border bg-neutral-50 p-6 md:p-10 shadow-sm">
            <h2 className="text-center text-2xl font-semibold md:text-3xl">{t.how.title}</h2>

            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {[t.how.a, t.how.b, t.how.c].map((s) => (
                <div key={s.t} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                  <div className="text-sm font-semibold">{s.t}</div>
                  <div className="mt-2 text-sm text-neutral-600">{s.d}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs">
              <span className="rounded-2xl bg-emerald-100 px-4 py-2 text-emerald-800">{t.how.badges.g}</span>
              <span className="rounded-2xl bg-amber-100 px-4 py-2 text-amber-800">{t.how.badges.y}</span>
              <span className="rounded-2xl bg-red-100 px-4 py-2 text-red-800">{t.how.badges.r}</span>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-end justify-between gap-6">
            <h3 className="text-2xl font-semibold md:text-3xl">{t.features.title}</h3>
            <div className="hidden md:block text-sm text-neutral-500">
              MicroPulse = decision engine + coach control + player clarity
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {t.features.cards.map((c) => (
              <div key={c.t} className="rounded-3xl border bg-white p-6 shadow-sm hover:shadow-md transition">
                <div className="text-sm font-semibold">{c.t}</div>
                <div className="mt-2 text-sm text-neutral-600">{c.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES + CTA CARD */}
      <section id="usecases" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="md:col-span-2">
              <h3 className="text-2xl font-semibold">{t.usecases.title}</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {t.usecases.items.map((x) => (
                  <div key={x} className="rounded-2xl border bg-white p-4 text-sm text-neutral-700 shadow-sm">
                    ✅ {x}
                  </div>
                ))}
              </div>
            </div>

            <div id="cta" className="rounded-3xl border bg-neutral-50 p-6 shadow-sm">
              <h4 className="text-lg font-semibold">{t.cta.title}</h4>
              <p className="mt-2 text-sm text-neutral-600">{t.cta.body}</p>
              <div className="mt-5 grid gap-3">
                <Link
                  href="/signup"
                  className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-white hover:bg-blue-700 transition shadow-[0_18px_40px_rgba(37,99,235,0.28)]"
                >
                  {t.cta.start}
                </Link>

                {/* ✅ NEW: walkthrough goes to /pricing#demo */}
                <Link
                  href="/pricing#demo"
                  className="rounded-2xl border bg-white px-4 py-3 text-center hover:bg-neutral-50 transition"
                >
                  {t.cta.walkthrough}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h3 className="text-2xl font-semibold md:text-3xl">{t.testimonials.title}</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {t.testimonials.items.map((x) => (
              <div key={x.q} className="rounded-3xl border bg-white p-6 shadow-sm">
                <div className="text-sm text-neutral-700">“{x.q}”</div>
                <div className="mt-4 text-xs text-neutral-500">— {x.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h3 className="text-2xl font-semibold md:text-3xl">{t.faq.title}</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {t.faq.items.map((x) => (
              <details key={x.q} className="group rounded-3xl border bg-white p-6 shadow-sm">
                <summary className="cursor-pointer list-none text-sm font-semibold">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-600" />
                    {x.q}
                  </span>
                  <span className="float-right text-neutral-400 group-open:rotate-180 transition">⌄</span>
                </summary>
                <p className="mt-3 text-sm text-neutral-600">{x.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-10 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} MicroPulse • {t.footer}
      </footer>
    </main>
  );
}