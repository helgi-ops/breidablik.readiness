"use client";

// Uppfærð heimasíða — kemur í stað src/app/home/page.tsx
// Breytingar: video-kort í hero, "video" secciónu eftir hero, númeruð skref,
// Breiðablik case-study tölur (úr MicroPulse-Case-Study-Breidablik-EN), Vimeo í "See in action",
// intelligence-skjáskot fjarlægt, video-modal (Vimeo intro).

import * as React from "react";
import Link from "next/link";

type Lang = "IS" | "EN";

const VIMEO_INTRO =
  "https://player.vimeo.com/video/1215758547?h=6128877528&title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1";
const VIMEO_WALKTHROUGH =
  "https://player.vimeo.com/video/1215812778?h=155ed35fc4&title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479";

type CopyShape = {
  nav: { video: string; how: string; platform: string; explain: string; product: string; intelligence: string; pricing: string; blog: string; cta: string };
  hero: { title: string; sub: string; primary: string; secondary: string; trust: string; watch: string };
  video: { badge: string; title: string; sub: string; bullets: string[]; play: string; demo: string; label: string };
  how: { title: string; steps: Array<{ t: string; d: string }> };
  proof: { title: string; sub: string; note: string; stats: Array<{ n: string; d: string }> };
  platform: { title: string; sub: string; cards: Array<{ icon: string; t: string; d: string }> };
  explain: { title: string; sub: string; cards: Array<{ icon: string; t: string; d: string }> };
  product: { title: string; stats: Array<{ t: string; d: string }> };
  intelligence: { title: string; sub: string; chips: string[] };
  cta: { title: string; body: string; primary: string; secondary: string };
  footer: { copyright: string; pricing: string; features: string; blog: string; methodology: string };
  auth: { signIn: string };
};

const COPY: Record<Lang, CopyShape> = {
  EN: {
    nav: { video: "Watch the demo", how: "How it works", platform: "Platform", explain: "Explainability", product: "Product", intelligence: "Intelligence", pricing: "Pricing", blog: "Blog", cta: "Get started" },
    hero: {
      title: "Know who's ready — and why.",
      sub: "One daily view for coaching, performance, and medical staff — built on the GPS data you already own. Every verdict is explained in plain language, with no analyst required.",
      primary: "Start with Free",
      secondary: "Book a demo",
      trust: "Trusted by Breiðablik performance staff · Explainable Performance Intelligence",
      watch: "Watch the intro",
    },
    video: {
      badge: "Video introduction",
      title: "See a real training day, start to finish.",
      sub: "Watch how check-ins, GPS load, and readiness verdicts come together into one morning picture — and how the coach confirms the day plan in minutes.",
      bullets: ["Clear signals, no guesswork", "A daily routine for staff and players", "Built for football, basketball, and performance teams"],
      play: "Play the intro",
      demo: "Book a demo",
      label: "▶ MicroPulse intro",
    },
    how: {
      title: "From check-in to training plan — in minutes.",
      steps: [
        { t: "Players check in", d: "Daily readiness and wellness data from your squad in 60 seconds per player." },
        { t: "See the squad in one view", d: "Risk level, team action, and flagged players surfaced instantly." },
        { t: "Review flagged players", d: "Understand why each player was flagged and what to do." },
        { t: "Confirm the day plan", d: "Set FULL / REDUCED / RECOVERY and lock the decision. Every staff member sees the same picture." },
      ],
    },
    proof: {
      title: "Proven with Breiðablik UBK",
      sub: "Three months on top of Catapult with the Men's First Team — February to May 2026.",
      note: "Numbers from Breiðablik UBK Men's First Team, used with permission.",
      stats: [
        { n: "2,265", d: "Readiness verdicts issued" },
        { n: "28", d: "Players monitored daily" },
        { n: "96%", d: "Verdict acceptance by the coach" },
        { n: "25", d: "Risk alerts fired automatically" },
      ],
    },
    platform: {
      title: "One platform. Six pillars.",
      sub: "Everything your performance staff needs — from daily readiness to return-to-play.",
      cards: [
        { icon: "📊", t: "Readiness Score", d: "Daily automatic readiness from check-in, GPS, and force plate data combined into one score." },
        { icon: "⚡", t: "Load Monitoring", d: "GPS velocity bands, ACWR, mechanical load index, and metabolic load per player." },
        { icon: "🏐", t: "Indoor / Outdoor Mode", d: "Toggle between GPS and FMP signals. Data always collected for both." },
        { icon: "💪", t: "Force Testing", d: "VALD ForceDecks and ForceFrame with CMJ alerts and bilateral asymmetry tracking." },
        { icon: "🏃", t: "Return-to-Play", d: "6-stage clinical RTP protocol with evidence-based criteria at each stage." },
        { icon: "🎯", t: "Match-week Ops", d: "Week setup, yesterday load, TV display, messages, and staff alignment in one view." },
      ],
    },
    explain: {
      title: "Every verdict explains itself.",
      sub: "MicroPulse doesn't just flag a player — it shows the coach, and the player, exactly why. In plain language, traceable to the data, with the AI labelled as AI.",
      cards: [
        { icon: "💬", t: "Ask the system", d: "One tap on any flagged player gives a plain-language answer — written from that player's own data and citing the signals behind it. For coaches and players alike." },
        { icon: "🔍", t: "Decision trace", d: "Tap any number to see exactly how it was computed — the formula, the inputs, the threshold, and the research paper behind it." },
        { icon: "📝", t: "Override audit", d: "Every time you override the system, it's logged with your reason. See your own pattern over time — and the system learns from your judgement." },
        { icon: "📱", t: "Players see why", d: "Players read why they're green, yellow or red in their own app, in plain language — so they stop asking and start understanding." },
      ],
    },
    product: {
      title: "See MicroPulse in action",
      stats: [
        { t: "Risk level", d: "Understand your team's readiness at a glance." },
        { t: "Fatigue", d: "Detect systemic and individual fatigue patterns." },
        { t: "Needs review", d: "Prioritize attention where it matters most." },
        { t: "Recommendation", d: "Get evidence-based guidance for your training day." },
      ],
    },
    intelligence: {
      title: "More than monitoring — a full intelligence stack.",
      sub: "Every signal below is computed daily, compared to each player's personal norm, and explained in plain language. Each one carries the research paper behind it.",
      chips: ["Personal-norm readiness", "Day-over-day delta", "Sequence escalation", "Volatility", "ACWR", "GPS velocity bands", "Metabolic load", "Mechanical Load Index", "Decel : Accel coupling", "Decel : Sprint (STEN)", "IMA Free Running", "Indoor / FMP load", "Quadrant intelligence", "Neural load", "CMJ force-time", "VALD asymmetry", "Microcycle periodization", "Counterfactuals", "Physical assessment battery", "Return-to-play"],
    },
    cta: { title: "Ready to run smarter training days?", body: "Get your team started with MicroPulse today.", primary: "Start free", secondary: "Watch the intro" },
    footer: { copyright: "© 2026 MicroPulse. All rights reserved.", pricing: "Pricing", features: "Features", blog: "Blog", methodology: "Methodology" },
    auth: { signIn: "Sign in" },
  },
  IS: {
    nav: { video: "Sjá kynningu", how: "Hvernig virkar", platform: "Vettvangur", explain: "Útskýringar", product: "Vöru", intelligence: "Greind", pricing: "Verðlagning", blog: "Greinum", cta: "Byrjaðu" },
    hero: {
      title: "Veistu hverjir eru tilbúnir — og hvers vegna.",
      sub: "Eitt daglegt yfirlit fyrir þjálfara-, performance- og medical staff — byggt á GPS-gögnunum sem þú átt nú þegar. Hver niðurstaða er útskýrð á mannamáli, án greiningarmanns.",
      primary: "Byrjaðu ókeypis",
      secondary: "Bókaðu demo",
      trust: "Notað af performance teymi Breiðabliks · Útskýranleg ákvarðanataka",
      watch: "Horfðu á kynninguna",
    },
    video: {
      badge: "Myndbandskynning",
      title: "Sjáðu alvöru æfingardag, frá upphafi til enda.",
      sub: "Sjáðu hvernig check-in, GPS-álag og readiness niðurstöður mynda eina morgunmynd — og hvernig þjálfarinn staðfestir dagsplanið á nokkrum mínútum.",
      bullets: ["Skýr merki, engar getgátur", "Dagleg rútína fyrir staff og leikmenn", "Hentar fótbolta, körfu og performance teymum"],
      play: "Spila kynninguna",
      demo: "Bókaðu demo",
      label: "▶ Kynning á MicroPulse",
    },
    how: {
      title: "Frá check-in yfir í æfingarplan — á nokkrum mínútum.",
      steps: [
        { t: "Leikmenn skrá sig inn", d: "Daglegir readiness og wellness gögn frá hópnum þínum á 60 sekúndum á leikmann." },
        { t: "Sjáðu hópinn í einum glugga", d: "Áhættustig, teymis aðgerð og flaggaðir leikmenn birtir samstundis." },
        { t: "Farðu yfir flaggaða leikmenn", d: "Skilja hvers vegna hver leikmaður var flaggaður og hvað á að gera." },
        { t: "Staðfestu daginn áætlun", d: "Settu FULL / REDUCED / RECOVERY og lása ákvarðanir. Allir starfsmenn sjá sömu mynd." },
      ],
    },
    proof: {
      title: "Sannreynt með Breiðablik UBK",
      sub: "Þrír mánuðir ofan á Catapult með meistaraflokki karla — febrúar til maí 2026.",
      note: "Tölur frá meistaraflokki karla hjá Breiðablik UBK, notaðar með leyfi.",
      stats: [
        { n: "2.265", d: "Readiness niðurstöður gefnar" },
        { n: "28", d: "Leikmenn vaktaðir daglega" },
        { n: "96%", d: "Niðurstöður samþykktar af þjálfara" },
        { n: "25", d: "Áhættuviðvaranir sendar sjálfkrafa" },
      ],
    },
    platform: {
      title: "Einn vettvangur. Sex stoðir.",
      sub: "Allt sem performance staff þarf — frá daglegri readiness til return-to-play.",
      cards: [
        { icon: "📊", t: "Readiness Score", d: "Dagleg sjálfvirk readiness úr check-in, GPS og kraftplatagögnum sameinaðir í einn stig." },
        { icon: "⚡", t: "Load Monitoring", d: "GPS hraðaböndum, ACWR, vélrænni hlaðningarvísitölu og efnaskiptaöktum á leikmann." },
        { icon: "🏐", t: "Innanhúss / Úti Hamur", d: "Skiptu á milli GPS og FMP merkja. Gögn alltaf söfnuð fyrir báða." },
        { icon: "💪", t: "Kraftmælingar", d: "VALD ForceDecks og ForceFrame með CMJ viðvörunum og samhverfu rakstum." },
        { icon: "🏃", t: "Return-to-Play", d: "6 stigaflokk klínískt RTP samskiptareglur með sannanir-byggðum viðmiðum á hverju stigi." },
        { icon: "🎯", t: "Leik-vikunni Ops", d: "Vikuuppsetningu, gæðum af gær, sjónvarps birtu, skilaboðum og starfsmanns samhæfingu í einum glugga." },
      ],
    },
    explain: {
      title: "Hver niðurstaða útskýrir sig sjálf.",
      sub: "MicroPulse flaggar ekki bara leikmann — það sýnir þjálfaranum, og leikmanninum, nákvæmlega hvers vegna. Á mannamáli, rekjanlegt til gagnanna, og AI merkt sem AI.",
      cards: [
        { icon: "💬", t: "Spyrja kerfið", d: "Eitt snerti á hvaða flaggaðan leikmann sem er gefur svar á mannamáli — skrifað úr hans eigin gögnum og vísar í merkin á bak við. Fyrir bæði þjálfara og leikmenn." },
        { icon: "🔍", t: "Útreikningur sýndur", d: "Smelltu á hvaða tölu sem er og sjáðu nákvæmlega hvernig hún var reiknuð — formúluna, gögnin, þröskuldinn og rannsóknina á bak við." },
        { icon: "📝", t: "Yfirferðir skráðar", d: "Í hvert sinn sem þú breytir ákvörðun kerfisins er það skráð með ástæðu þinni. Sjáðu þitt eigið mynstur — og kerfið lærir af þínu mati." },
        { icon: "📱", t: "Leikmenn sjá af hverju", d: "Leikmenn lesa hvers vegna þeir eru grænir, gulir eða rauðir í sínu eigin appi, á mannamáli — svo þeir hætta að spyrja og byrja að skilja." },
      ],
    },
    product: {
      title: "Sjáðu MicroPulse í notkun",
      stats: [
        { t: "Áhættustig", d: "Skildu tilbúnileika hópsins þíns á augnablikinu." },
        { t: "Þreyta", d: "Greina kerfisbundna og einstaka þreytu mynstur." },
        { t: "Þarf yfirferð", d: "Forgangsraðaðu athygli þar sem það skiptir mestu." },
        { t: "Tilmæli", d: "Fáðu sannanir-byggða leiðsögn fyrir æfingardag þinn." },
      ],
    },
    intelligence: {
      title: "Meira en eftirlit — heill greindarstafli.",
      sub: "Hvert merki hér að neðan er reiknað daglega, borið saman við persónulega norm hvers leikmanns og útskýrt á mannamáli. Hvert ber rannsóknina á bak við.",
      chips: ["Persónuleg readiness", "Breyting frá í gær", "Sequence escalation", "Flökt", "ACWR", "GPS hraðabönd", "Efnaskiptaálag", "Mechanical Load Index", "Decel : Accel coupling", "Decel : Sprint (STEN)", "IMA Free Running", "Innanhúss / FMP álag", "Quadrant greind", "Taugaálag", "CMJ force-time", "VALD ósamhverfa", "Microcycle periodization", "Counterfactuals", "Líkamlegt mat", "Return-to-play"],
    },
    cta: { title: "Tilbúinn að keyra betri æfingardaga?", body: "Byrjaðu með MicroPulse í dag.", primary: "Byrjaðu ókeypis", secondary: "Horfðu á kynninguna" },
    footer: { copyright: "© 2026 MicroPulse. Öll réttindi áskilin.", pricing: "Verðlagning", features: "Eiginleikar", blog: "Greinum", methodology: "Aðferðafræði" },
    auth: { signIn: "Skrá sig inn" },
  },
};

function useSmoothScroll() {
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const el = document.getElementById(href.replace("#", ""));
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

function PlayIcon({ size = 26, color = "#171717" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5v14l11-7L8 5z" fill={color} />
    </svg>
  );
}

function VideoPosterCard({ onPlay, label, className }: { onPlay: () => void; label: string; className?: string }) {
  return (
    <button
      onClick={onPlay}
      aria-label="Play MicroPulse introduction video"
      className={cx("group relative block w-full overflow-hidden rounded-2xl border text-left shadow-2xl", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/micropulse-video-poster.jpg" alt="MicroPulse intro video" className="aspect-video w-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="rounded-full bg-white/95 p-4 shadow-lg transition group-hover:scale-105">
          <PlayIcon />
        </div>
      </div>
      <div className="absolute bottom-4 left-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-neutral-900">{label}</div>
      </div>
    </button>
  );
}

export default function HomeLanding() {
  const [lang, setLang] = React.useState<Lang>("EN");
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [videoOpen, setVideoOpen] = React.useState(false);
  const t = COPY[lang];

  useSmoothScroll();

  React.useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("mp_lang") : null;
    if (saved === "IS" || saved === "EN") setLang(saved);
  }, []);

  React.useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("mp_lang", lang);
  }, [lang]);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setVideoOpen(false);
    }
    if (videoOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [videoOpen]);

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/hero-football.jpg)" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/85" />
        </div>

        <header className="relative z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-emerald-500/90" />
              <span className="font-semibold tracking-tight text-white/95">MicroPulse</span>
            </div>

            <nav className="hidden items-center gap-6 text-sm text-white/80 md:flex">
              <a href="#video" className="hover:text-white">{t.nav.video}</a>
              <a href="#how" className="hover:text-white">{t.nav.how}</a>
              <a href="#platform" className="hover:text-white">{t.nav.platform}</a>
              <a href="#explain" className="hover:text-white">{t.nav.explain}</a>
              <a href="#product" className="hover:text-white">{t.nav.product}</a>
              <Link href="/pricing" className="hover:text-white">{t.nav.pricing}</Link>
              <Link href="/blog" className="hover:text-white">{t.nav.blog}</Link>
            </nav>

            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-xl border border-white/20 bg-white/5 p-1">
                <button onClick={() => setLang("IS")} className={cx("rounded-lg px-2.5 py-1 text-xs transition", lang === "IS" ? "bg-white/15 text-white" : "text-white/70 hover:text-white")}>IS</button>
                <button onClick={() => setLang("EN")} className={cx("rounded-lg px-2.5 py-1 text-xs transition", lang === "EN" ? "bg-white/15 text-white" : "text-white/70 hover:text-white")}>EN</button>
              </div>
              <Link href="/login" className="hidden rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 md:block">{t.auth.signIn}</Link>
              <Link href="/pricing" className="hidden rounded-xl bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 md:block">{t.nav.cta}</Link>
              <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/5 text-white md:hidden" onClick={() => setMobileMenuOpen((v) => !v)} aria-label="Toggle menu">
                {mobileMenuOpen ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                )}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="absolute left-0 right-0 top-full z-50 border-t border-white/10 bg-black/90 px-6 py-4 backdrop-blur md:hidden">
              <nav className="flex flex-col gap-1 text-sm text-white/80">
                {[
                  { href: "#video", label: t.nav.video },
                  { href: "#how", label: t.nav.how },
                  { href: "#platform", label: t.nav.platform },
                  { href: "#explain", label: t.nav.explain },
                  { href: "#product", label: t.nav.product },
                ].map((item) => (
                  <a key={item.href} href={item.href} className="rounded-xl px-3 py-2.5 hover:bg-white/10 hover:text-white" onClick={() => setMobileMenuOpen(false)}>{item.label}</a>
                ))}
                <Link href="/pricing" className="rounded-xl px-3 py-2.5 hover:bg-white/10 hover:text-white" onClick={() => setMobileMenuOpen(false)}>{t.nav.pricing}</Link>
                <Link href="/blog" className="rounded-xl px-3 py-2.5 hover:bg-white/10 hover:text-white" onClick={() => setMobileMenuOpen(false)}>{t.nav.blog}</Link>
                <div className="mt-2 flex gap-2 border-t border-white/10 pt-3">
                  <Link href="/login" className="flex-1 rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-center text-sm text-white transition hover:bg-white/10">{t.auth.signIn}</Link>
                  <Link href="/pricing" className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-center text-sm text-white transition hover:bg-blue-700">{t.nav.cta}</Link>
                </div>
              </nav>
            </div>
          )}
        </header>

        <div className="relative z-10">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-14 md:grid-cols-[1.1fr_0.9fr] md:pb-24 md:pt-16">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-white md:text-[3.5rem] md:leading-[1.08]">{t.hero.title}</h1>
              <p className="mt-6 text-lg text-white/85">{t.hero.sub}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/login" className="rounded-2xl bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700">{t.hero.primary}</Link>
                <Link href="/pricing#demo" className="rounded-2xl border border-white/25 bg-white/5 px-6 py-3 text-white transition hover:bg-white/10">{t.hero.secondary}</Link>
              </div>
              <p className="mt-8 text-sm text-white/70">{t.hero.trust}</p>
            </div>
            <div className="flex justify-center">
              <VideoPosterCard onPlay={() => setVideoOpen(true)} label={t.hero.watch} className="max-w-[480px] border-white/20" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== VIDEO SECTION ===== */}
      <section id="video" className="border-t border-neutral-100 bg-neutral-50 py-20 md:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 md:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm text-neutral-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t.video.badge}
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{t.video.title}</h2>
            <p className="mt-5 text-lg text-neutral-600">{t.video.sub}</p>
            <ul className="mt-6 space-y-2 text-neutral-700">
              {t.video.bullets.map((b, i) => (<li key={i}>• {b}</li>))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => setVideoOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-6 py-3 font-medium text-white transition hover:opacity-90">
                <PlayIcon size={16} color="#ffffff" />
                {t.video.play}
              </button>
              <Link href="/pricing#demo" className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-3 font-medium text-neutral-900 transition hover:bg-neutral-100">{t.video.demo}</Link>
            </div>
          </div>
          <VideoPosterCard onPlay={() => setVideoOpen(true)} label={t.video.label} className="border-neutral-200" />
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" className="border-t border-neutral-100 bg-white py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mx-auto max-w-2xl text-center text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">{t.how.title}</h2>
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {t.how.steps.map((step, idx) => (
              <div key={idx} className="rounded-3xl border border-neutral-100 bg-neutral-50 p-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{idx + 1}</div>
                <h3 className="mt-4 font-semibold text-neutral-900">{step.t}</h3>
                <p className="mt-2 text-sm text-neutral-600">{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF (case-study numbers) ===== */}
      <section id="proof" className="border-t border-neutral-100 bg-neutral-50 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl">{t.proof.title}</h2>
          <p className="mt-3 text-neutral-600">{t.proof.sub}</p>
          <div className="mx-auto mt-10 grid max-w-4xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {t.proof.stats.map((s, idx) => (
              <div key={idx} className="rounded-3xl border border-neutral-200 bg-white p-6">
                <div className="text-3xl font-bold tracking-tight text-neutral-900">{s.n}</div>
                <div className="mt-1.5 text-sm text-neutral-600">{s.d}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-neutral-400">{t.proof.note}</p>
        </div>
      </section>

      {/* ===== PLATFORM ===== */}
      <section id="platform" className="border-t border-neutral-100 bg-white py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">{t.platform.title}</h2>
            <p className="mt-4 text-lg text-neutral-600">{t.platform.sub}</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {t.platform.cards.map((card, idx) => (
              <div key={idx} className="rounded-3xl border border-neutral-200 bg-neutral-50 p-7 shadow-sm">
                <div className="text-3xl">{card.icon}</div>
                <h3 className="mt-4 font-semibold text-neutral-900">{card.t}</h3>
                <p className="mt-2 text-sm text-neutral-600">{card.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== EXPLAINABILITY ===== */}
      <section id="explain" className="border-t border-neutral-100 bg-neutral-50 py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">{t.explain.title}</h2>
            <p className="mt-4 text-lg text-neutral-600">{t.explain.sub}</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-2">
            {t.explain.cards.map((card, idx) => (
              <div key={idx} className="rounded-3xl border border-neutral-200 bg-white p-7 shadow-sm">
                <div className="text-3xl">{card.icon}</div>
                <h3 className="mt-4 font-semibold text-neutral-900">{card.t}</h3>
                <p className="mt-2 text-sm text-neutral-600">{card.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRODUCT / SEE IN ACTION (Vimeo walkthrough) ===== */}
      <section id="product" className="border-t border-neutral-100 bg-white py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">{t.product.title}</h2>
          <div className="mt-10 overflow-hidden rounded-3xl border border-neutral-200 bg-black">
            <div style={{ padding: "56.25% 0 0 0", position: "relative" }}>
              <iframe
                src={VIMEO_WALKTHROUGH}
                frameBorder="0"
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                title="micropulsesystemwalk"
              />
            </div>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {t.product.stats.map((stat, idx) => (
              <div key={idx} className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6">
                <h3 className="font-semibold text-neutral-900">{stat.t}</h3>
                <p className="mt-2 text-sm text-neutral-600">{stat.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== INTELLIGENCE (chips only, no screenshot) ===== */}
      <section id="intelligence" className="border-t border-neutral-100 bg-neutral-50 py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">{t.intelligence.title}</h2>
            <p className="mt-4 text-lg text-neutral-600">{t.intelligence.sub}</p>
          </div>
          <div className="mt-10 flex flex-wrap gap-2">
            {t.intelligence.chips.map((chip, idx) => (
              <span key={idx} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700">{chip}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section id="cta" className="border-t border-neutral-100 bg-neutral-900 py-20 text-white md:py-24">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{t.cta.title}</h2>
          <p className="mt-4 text-lg text-neutral-400">{t.cta.body}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login" className="rounded-2xl bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700">{t.cta.primary}</Link>
            <button onClick={() => setVideoOpen(true)} className="rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-white transition hover:bg-white/15">{t.cta.secondary}</button>
          </div>
          <div className="mt-12 flex flex-wrap justify-center gap-6 border-t border-white/10 pt-8 text-sm">
            <Link href="/pricing" className="text-neutral-400 hover:text-white">{t.footer.pricing}</Link>
            <Link href="/#platform" className="text-neutral-400 hover:text-white">{t.footer.features}</Link>
            <Link href="/blog" className="text-neutral-400 hover:text-white">{t.footer.blog}</Link>
            <Link href="/methodology" className="text-neutral-400 hover:text-white">{t.footer.methodology}</Link>
          </div>
        </div>
      </section>

      <footer className="bg-neutral-900 py-8 text-center text-sm text-neutral-500">
        <div className="mx-auto max-w-6xl px-6"><p>{t.footer.copyright}</p></div>
      </footer>

      {/* ===== VIDEO MODAL (Vimeo intro) ===== */}
      {videoOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" onClick={() => setVideoOpen(false)} role="dialog" aria-modal="true">
          <div className="mx-auto flex h-full max-w-5xl items-center px-6">
            <div className="relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setVideoOpen(false)} className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white">
                {lang === "IS" ? "Loka" : "Close"}
              </button>
              <div style={{ padding: "56.25% 0 0 0", position: "relative" }}>
                <iframe
                  src={VIMEO_INTRO}
                  frameBorder="0"
                  allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                  title="MicroPulse intro"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
