"use client";

/**
 * /personal-trainers — the sales page for personal trainers and S&C coaches.
 *
 * Every claim here is something the product does today (lota 2, 2026-11-22):
 * starter programmes, plan builder, invite email, check-in that adapts the
 * session, the trainer's attention list (texts copied from /api/trainer/attention),
 * monthly reports, chat, EN/IS. The product frames are drawn, not screenshots,
 * so they stay sharp and never show a real client.
 *
 * Price: free in early access (decided 2026-11-22) until billing (lota 3) exists.
 */

import Link from "next/link";
import { useLang, type Lang } from "@/lib/lang";
import { OPERATOR } from "@/lib/legal/operator";

type Bi = Record<Lang, string>;

const COPY = {
  EN: {
    nav: { how: "How it works", pricing: "Price", help: "Help", signIn: "Sign in", cta: "Start free" },
    eyebrow: "For personal trainers and S&C coaches",
    h1: "Your clients' training in one app — and every session explained",
    lead: "Pick or build a programme, invite a client by email, and see who trained, who is struggling and why. Your clients get an app that tells them what to do today.",
    ctaPrimary: "Start your practice — free",
    ctaSecondary: "See how it works",
    facts: ["Set up in about 10 minutes", "English and Icelandic", "No card needed"],
    howTitle: "How it works",
    steps: [
      { t: "Sign up", d: "Your practice is created straight away, with a demo client already in it so you can try everything before inviting anyone." },
      { t: "Invite a client", d: "Type their email. They get an invitation from your practice, choose a password and open the app — on any phone, no app store." },
      { t: "They train, you see it", d: "Sets, weights and check-ins land in your dashboard. The clients who need you today are listed first, each with the reason." },
    ],
    features: [
      {
        k: "adapt",
        t: "The session adapts to how they feel",
        d: "Clients answer three questions in the morning: sleep, fatigue, soreness. On a bad day the session is made lighter by a set amount, and the app says exactly how much. You can turn check-in off for any client.",
        points: ["You set how much lighter a yellow or red day is", "The client sees the reason, not just a colour"],
      },
      {
        k: "attention",
        t: "See who needs you today",
        d: "Instead of opening every client, you get a short list: who has gone quiet, whose readiness is sliding, whose load is climbing too fast. Each flag says why, and what would clear it.",
        points: ["Plain language, no sport-science jargon", "Each flag shows how much data it rests on"],
      },
      {
        k: "programmes",
        t: "Programmes without the spreadsheet",
        d: "Start from 10 ready-made programmes of 6–12 weeks — speed, jumping, strength, muscle, beginner full body — or build your own week by week. Target weights move up from what the client actually lifts.",
        points: ["Clients log every set with a rest timer", "Move a session when life gets in the way"],
      },
      {
        k: "report",
        t: "A monthly report your client understands",
        d: "On the 1st of each month a report is built for every client: sessions done, what got stronger, how they felt. Read it, then send it to the client in the app.",
        points: ["Chat with each client in the same place", "Reminders on training days, in the client's language"],
      },
    ],
    trustTitle: "No black box",
    trust: [
      { t: "Rules decide, the app explains", d: "Every recommendation comes from a stated rule, and the reason is shown next to it. Nothing is changed without saying so." },
      { t: "Research behind each signal", d: "Session load follows Foster (1998, session RPE); strength estimates use your client's own logged sets. The methods are listed with their sources." },
      { t: "You stay in charge", d: "The app suggests; you decide. You can change any session, any programme and any setting per client." },
    ],
    methodsLink: "See the methods and sources",
    priceTitle: "Free in early access",
    priceLead: "Everything included while we're in early access. When a price comes, we'll tell you at least 30 days before, and you choose whether to stay.",
    priceItems: ["Programmes, plan builder and set logging", "Client app in English and Icelandic", "Check-in, attention list and monthly reports", "Chat and training-day reminders"],
    priceNote: "Your clients never pay.",
    faqTitle: "Questions",
    faq: [
      { q: "Do my clients need to download anything?", a: "No. They open the invitation link on their phone and can add the app to their home screen. It works on iPhone and Android." },
      { q: "Do I or my clients need a GPS vest or a watch?", a: "No. Everything works from logged sets and the morning check-in." },
      { q: "Can I try it before inviting a real client?", a: "Yes. Every new practice comes with a demo client with a few weeks of data, so you can see the dashboard working first." },
      { q: "Who owns my clients' data?", a: "Your practice decides about your clients' data; we process it on your behalf and never sell it. You can ask us to export or delete it at any time." },
      { q: "Which languages?", a: "English and Icelandic, for you and for each client separately." },
    ],
    finalTitle: "Start your practice today",
    finalLead: "It takes about 10 minutes to invite your first client.",
    footer: { terms: "Terms", privacy: "Privacy", help: "Help", clubs: "For clubs", contact: "Contact" },
  },
  IS: {
    nav: { how: "Svona virkar þetta", pricing: "Verð", help: "Hjálp", signIn: "Skrá inn", cta: "Byrja frítt" },
    eyebrow: "Fyrir einkaþjálfara og styrktarþjálfara",
    h1: "Æfingar viðskiptavinanna í einu appi — og hver æfing útskýrð",
    lead: "Veldu eða búðu til áætlun, bjóddu viðskiptavini með tölvupósti og sjáðu hver æfði, hverjum gengur illa og af hverju. Viðskiptavinirnir fá app sem segir þeim hvað á að gera í dag.",
    ctaPrimary: "Opnaðu stofuna — frítt",
    ctaSecondary: "Sjáðu hvernig þetta virkar",
    facts: ["Uppsett á um 10 mínútum", "Enska og íslenska", "Ekkert kort"],
    howTitle: "Svona virkar þetta",
    steps: [
      { t: "Skráðu þig", d: "Stofan verður til strax, með prufuviðskiptavini svo þú getir prófað allt áður en þú býður einhverjum." },
      { t: "Bjóddu viðskiptavini", d: "Sláðu inn netfangið. Hann fær boð frá stofunni þinni, velur lykilorð og opnar appið — í hvaða síma sem er, engin app-verslun." },
      { t: "Hann æfir, þú sérð það", d: "Sett, þyngdir og check-in birtast á stjórnborðinu. Þeir sem þurfa á þér að halda í dag eru efstir, hver með ástæðu." },
    ],
    features: [
      {
        k: "adapt",
        t: "Æfingin lagar sig að líðan",
        d: "Viðskiptavinir svara þremur spurningum á morgnana: svefn, þreyta, harðsperrur. Á slæmum degi verður æfingin léttari um ákveðið magn og appið segir nákvæmlega hve mikið. Þú getur slökkt á check-in fyrir hvern sem er.",
        points: ["Þú ákveður hve miklu léttari gulur eða rauður dagur er", "Viðskiptavinurinn sér ástæðuna, ekki bara lit"],
      },
      {
        k: "attention",
        t: "Sjáðu hver þarf á þér að halda í dag",
        d: "Í stað þess að opna hvern og einn færðu stuttan lista: hver hefur ekki látið í sér heyra, hjá hverjum viðbúnaður fer niður, hjá hverjum álag hækkar of hratt. Hvert flagg segir af hverju og hvað myndi hreinsa það.",
        points: ["Einfalt mál, ekkert fagmál", "Hvert flagg sýnir á hve miklum gögnum það byggir"],
      },
      {
        k: "programmes",
        t: "Áætlanir án töflureiknis",
        d: "Byrjaðu á 10 tilbúnum áætlunum, 6–12 vikna — hraði, stökk, styrkur, vöðvamassi, byrjendur — eða búðu til þína eigin viku fyrir viku. Markþyngdir hækka út frá því sem viðskiptavinurinn lyftir í raun.",
        points: ["Viðskiptavinir skrá hvert sett með hvíldarklukku", "Færðu æfingu þegar eitthvað kemur upp á"],
      },
      {
        k: "report",
        t: "Mánaðarskýrsla sem viðskiptavinurinn skilur",
        d: "1. hvers mánaðar verður til skýrsla fyrir hvern viðskiptavin: æfingar, hvað styrktist, hvernig líðanin var. Lestu hana og sendu viðskiptavininum í appinu.",
        points: ["Spjall við hvern viðskiptavin á sama stað", "Áminningar á æfingadögum, á tungumáli viðskiptavinarins"],
      },
    ],
    trustTitle: "Enginn svartur kassi",
    trust: [
      { t: "Reglur ráða, appið útskýrir", d: "Hver ráðlegging kemur frá skýrri reglu og ástæðan er sýnd við hliðina. Engu er breytt án þess að það sé sagt." },
      { t: "Rannsóknir að baki hverju merki", d: "Æfingaálag fylgir Foster (1998, session RPE); styrkmat byggir á settum viðskiptavinarins sjálfs. Aðferðirnar eru taldar upp með heimildum." },
      { t: "Þú ræður", d: "Appið stingur upp á; þú ákveður. Þú getur breytt hvaða æfingu, áætlun og stillingu sem er fyrir hvern viðskiptavin." },
    ],
    methodsLink: "Sjá aðferðir og heimildir",
    priceTitle: "Frítt á meðan á prufutíma stendur",
    priceLead: "Allt innifalið á meðan á prufutíma stendur. Þegar verð kemur látum við þig vita með minnst 30 daga fyrirvara og þú velur hvort þú heldur áfram.",
    priceItems: ["Áætlanir, áætlanagerð og skráning setta", "App viðskiptavinar á ensku og íslensku", "Check-in, athyglislisti og mánaðarskýrslur", "Spjall og áminningar á æfingadögum"],
    priceNote: "Viðskiptavinir þínir borga aldrei.",
    faqTitle: "Spurningar",
    faq: [
      { q: "Þurfa viðskiptavinir að sækja eitthvað?", a: "Nei. Þeir opna boðshlekkinn í símanum og geta sett appið á heimaskjáinn. Það virkar á iPhone og Android." },
      { q: "Þarf ég eða viðskiptavinirnir GPS-vesti eða úr?", a: "Nei. Allt virkar út frá skráðum settum og morgun-check-in." },
      { q: "Get ég prófað áður en ég býð alvöru viðskiptavini?", a: "Já. Hver ný stofa fær prufuviðskiptavin með nokkurra vikna gögnum svo þú sjáir stjórnborðið virka fyrst." },
      { q: "Hver á gögn viðskiptavinanna?", a: "Stofan þín ræður gögnum viðskiptavinanna; við vinnum þau fyrir þína hönd og seljum þau aldrei. Þú getur beðið okkur að afhenda eða eyða þeim hvenær sem er." },
      { q: "Hvaða tungumál?", a: "Enska og íslenska, fyrir þig og hvern viðskiptavin fyrir sig." },
    ],
    finalTitle: "Opnaðu stofuna í dag",
    finalLead: "Það tekur um 10 mínútur að bjóða fyrsta viðskiptavininum.",
    footer: { terms: "Skilmálar", privacy: "Persónuvernd", help: "Hjálp", clubs: "Fyrir félög", contact: "Hafa samband" },
  },
} as const;

/* ── Drawn product frames ─────────────────────────────────────────────── */

function PulseMark({ className = "" }: { className?: string }) {
  // The MicroPulse dot waveform (public/brand/micropulse-mark.svg), in the cobalt token.
  const pts: Array<[number, number]> = [
    [20, 120], [52, 120], [84, 120], [116, 100], [148, 120], [180, 108], [196, 74], [208, 40], [220, 74],
    [232, 110], [248, 138], [264, 120], [296, 104], [328, 120], [360, 120],
  ];
  return (
    <svg viewBox="0 30 380 120" aria-hidden="true" className={className}>
      {pts.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={9} className="fill-primary" />)}
    </svg>
  );
}

function Phone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} className="w-[248px] shrink-0 rounded-[34px] border border-slate-300 bg-slate-900 p-2 shadow-xl">
      <div className="overflow-hidden rounded-[27px] bg-background">
        <div className="flex h-6 items-center justify-center"><div className="h-1.5 w-16 rounded-full bg-slate-300" /></div>
        <div className="space-y-2.5 px-3 pb-4" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}

function Browser({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
      </div>
      <div className="p-4" aria-hidden="true">{children}</div>
    </div>
  );
}

const DOT = { good: "bg-emerald-600", warn: "bg-amber-500", bad: "bg-red-600" } as const;

function ClientTodayFrame({ lang }: { lang: Lang }) {
  const is = lang === "IS";
  return (
    <Phone label={is ? "App viðskiptavinar: léttari æfing í dag, með ástæðu" : "Client app: a lighter session today, with the reason"}>
      <div className="pt-1">
        <div className="font-display text-lg font-extrabold leading-tight text-slate-900">{is ? "Hæ, Sara" : "Hi, Sara"}</div>
        <div className="text-[10px] text-slate-500">{is ? "Þjálfari: Strong Lab" : "Trainer: Strong Lab"}</div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-card p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800">
          <span className={`h-2 w-2 rounded-full ${DOT.warn}`} />{is ? "Gát" : "Caution"}
        </div>
        <div className="mt-0.5 font-display text-[15px] font-extrabold leading-tight text-slate-900">{is ? "Léttari æfing í dag" : "Lighter session today"}</div>
        <div className="mt-0.5 text-[10px] leading-snug text-slate-700">
          {is ? "Stillt eftir líðan: 20% minna magn og 10% minni þyngd, svo þú haldir góðum gæðum." : "Adjusted to how you feel: 20% less volume and 10% less weight, so you keep good quality."}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-card p-2.5">
        <div className="text-[9px] font-semibold text-slate-500">{is ? "Æfing dagsins · Vika 3 af 8" : "Today's session · Week 3 of 8"}</div>
        <div className="font-display text-[13px] font-bold text-slate-900">{is ? "Neðri líkami — styrkur" : "Lower body — strength"}</div>
        {[
          ["Back squat", "3 × 5", "72.5 kg"],
          ["Romanian deadlift", "3 × 8", "60 kg"],
          ["Walking lunge", "2 × 10", "16 kg"],
        ].map(([ex, sr, kg]) => (
          <div key={ex} className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-[10px]">
            <span className="truncate text-slate-800">{ex}</span>
            <span className="shrink-0 tabular-nums text-slate-500">{sr} · {kg}</span>
          </div>
        ))}
        <div className="mt-2 flex h-8 items-center justify-center rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground">
          {is ? "Byrja æfingu" : "Start session"}
        </div>
      </div>
    </Phone>
  );
}

const ATTENTION: Array<{ name: string; tone: keyof typeof DOT; title: Bi; why: Bi }> = [
  {
    name: "Jón K.", tone: "bad",
    title: { EN: "Load rising too fast", IS: "Álag hækkar of hratt" },
    why: { EN: "Has trained 1.7 times a normal week. If this week comes back to 1.5 times normal or less, this clears.", IS: "Hefur æft 1,7 sinnum venjulega viku. Ef vikan fer aftur niður í 1,5 sinnum venjulega eða minna hverfur þetta." },
  },
  {
    name: "Sara M.", tone: "warn",
    title: { EN: "Readiness sliding", IS: "Viðbúnaður á niðurleið" },
    why: { EN: "Down 9 points over the last 4 check-ins.", IS: "Niður um 9 stig í síðustu 4 check-in." },
  },
  {
    name: "Anna B.", tone: "warn",
    title: { EN: "Gone quiet", IS: "Hefur ekki látið í sér heyra" },
    why: { EN: "No session logged for 6 days, and no break is set. If one session is logged, this clears.", IS: "Engin æfing skráð í 6 daga og ekkert frí skráð. Ef ein æfing er skráð hverfur þetta." },
  },
];

function AttentionFrame({ lang }: { lang: Lang }) {
  const is = lang === "IS";
  return (
    <Browser label={is ? "Stjórnborð þjálfara: hverjir þurfa athygli í dag og af hverju" : "Trainer dashboard: who needs attention today, and why"}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-display text-base font-extrabold text-slate-900">{is ? "Þurfa athygli í dag" : "Needs attention today"}</div>
        <div className="text-[11px] text-slate-500">{is ? "3 af 14 viðskiptavinum" : "3 of 14 clients"}</div>
      </div>
      <ul className="mt-3 space-y-2">
        {ATTENTION.map((a) => (
          <li key={a.name} className="rounded-xl border border-slate-200 bg-background/60 p-3">
            <div className="flex items-center gap-2 text-[13px]">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[a.tone]}`} />
              <span className="font-semibold text-slate-900">{a.name}</span>
              <span className="text-slate-500">· {a.title[lang]}</span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-slate-600">{a.why[lang]}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 text-[11px] text-slate-500">{is ? "11 viðskiptavinir á réttri leið" : "11 clients on track"}</div>
    </Browser>
  );
}

function ProgrammeFrame({ lang }: { lang: Lang }) {
  const is = lang === "IS";
  const days = is ? ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const plan: Array<string | null> = is
    ? ["Neðri — styrkur", null, "Efri — styrkur", null, "Stökk + hraði", null, null]
    : ["Lower — strength", null, "Upper — strength", null, "Jumps + speed", null, null];
  return (
    <Browser label={is ? "Áætlun: vika með þremur æfingum" : "Programme: a week with three sessions"}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-display text-base font-extrabold text-slate-900">{is ? "Styrkur 3 daga · 8 vikur" : "Strength 3-day · 8 weeks"}</div>
        <div className="text-[11px] text-slate-500">{is ? "Vika 3" : "Week 3"}</div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {days.map((d, i) => (
          <div key={d} className="min-w-0">
            <div className="text-center text-[10px] font-semibold text-slate-500">{d}</div>
            <div className={`mt-1 flex h-16 items-center justify-center rounded-lg p-1 text-center text-[10px] leading-tight ${plan[i] ? "bg-primary/10 font-semibold text-primary" : "bg-slate-100 text-slate-400"}`}>
              {plan[i] ?? "—"}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
        ↑ {is ? "Back squat: markþyngd hækkuð í 75 kg út frá skráðum lyftum." : "Back squat: target raised to 75 kg from logged lifts."}
      </div>
    </Browser>
  );
}

function ReportFrame({ lang }: { lang: Lang }) {
  const is = lang === "IS";
  return (
    <Browser label={is ? "Mánaðarskýrsla viðskiptavinar" : "A client's monthly report"}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Nóvember · Sara M." : "November · Sara M."}</div>
      <div className="mt-1 font-display text-lg font-extrabold leading-tight text-slate-900">
        {is ? "Góður mánuður: 11 af 12 æfingum og sterkari í hnébeygju" : "A good month: 11 of 12 sessions and a stronger squat"}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          [is ? "Æfingar" : "Sessions", "11 / 12"],
          ["Back squat", "+7.5 kg"],
          [is ? "Lyft alls" : "Lifted", "38,400 kg"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 p-2">
            <div className="text-[10px] text-slate-500">{k}</div>
            <div className="font-display text-sm font-bold tabular-nums text-slate-900">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <span className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground">{is ? "Senda til viðskiptavinar" : "Send to client"}</span>
      </div>
    </Browser>
  );
}

const FRAMES: Record<string, (p: { lang: Lang }) => React.ReactElement> = {
  adapt: ClientTodayFrame,
  attention: AttentionFrame,
  programmes: ProgrammeFrame,
  report: ReportFrame,
};

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function TrainersLanding() {
  const [lang, setLang] = useLang();
  const t = COPY[lang];
  const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className={`${container} flex h-14 items-center justify-between gap-3`}>
          <Link href="/personal-trainers" className="flex items-center gap-2">
            <PulseMark className="h-5 w-auto" />
            <span className="font-display text-[17px] font-extrabold tracking-tight">MicroPulse</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-3">
            <a href="#how" className="hidden rounded-lg px-2 py-1.5 text-slate-600 hover:text-slate-900 md:block">{t.nav.how}</a>
            <a href="#price" className="hidden rounded-lg px-2 py-1.5 text-slate-600 hover:text-slate-900 md:block">{t.nav.pricing}</a>
            <Link href="/help?for=trainers" className="hidden rounded-lg px-2 py-1.5 text-slate-600 hover:text-slate-900 md:block">{t.nav.help}</Link>
            <div role="group" aria-label={lang === "IS" ? "Tungumál" : "Language"} className="flex rounded-lg bg-slate-200/70 p-0.5 text-xs font-semibold">
              {(["EN", "IS"] as const).map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                  className={`min-h-7 rounded-md px-2 ${lang === l ? "bg-card text-slate-900" : "text-slate-600"}`}>
                  {l}
                </button>
              ))}
            </div>
            <Link href="/login" className="hidden rounded-lg px-2 py-1.5 text-slate-700 hover:text-slate-900 sm:block">{t.nav.signIn}</Link>
            <Link href="/signup/trainer" className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:opacity-90">{t.nav.cta}</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero: the verdict first, three plain facts, then the product. */}
        <section className={`${container} grid items-center gap-10 py-12 md:grid-cols-[1.05fr_1fr] md:py-20`}>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{t.eyebrow}</div>
            <h1 className="mt-3 text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl">{t.h1}</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-slate-700">{t.lead}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup/trainer" className="rounded-xl bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground hover:opacity-90">{t.ctaPrimary}</Link>
              <a href="#how" className="rounded-xl border border-slate-300 bg-card px-5 py-3 text-[15px] font-semibold text-slate-900 hover:bg-slate-50">{t.ctaSecondary}</a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              {t.facts.map((f) => (
                <li key={f} className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${DOT.good}`} />{f}</li>
              ))}
            </ul>
          </div>
          {/* The client's phone; the trainer's dashboard follows in "See who needs you today". */}
          <div className="flex min-w-0 justify-center">
            <ClientTodayFrame lang={lang} />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-y border-border/70 bg-card">
          <div className={`${container} py-14`}>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">{t.howTitle}</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {t.steps.map((s, i) => (
                <li key={s.t} className="min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-display text-base font-bold text-primary-foreground">{i + 1}</div>
                  <h3 className="mt-3 font-display text-lg font-bold text-slate-900">{s.t}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features, alternating with drawn frames */}
        <section className={`${container} space-y-16 py-16`}>
          {t.features.map((f, i) => {
            const Frame = FRAMES[f.k];
            return (
              <div key={f.k} className={`grid items-center gap-8 md:grid-cols-2 ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}>
                <div className="min-w-0">
                  <h2 className="text-balance font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{f.t}</h2>
                  <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-slate-700">{f.d}</p>
                  <ul className="mt-4 space-y-1.5 text-[15px] text-slate-700">
                    {f.points.map((p) => (
                      <li key={p} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{p}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex min-w-0 justify-center"><Frame lang={lang} /></div>
              </div>
            );
          })}
        </section>

        {/* Explainability */}
        <section className="border-y border-border/70 bg-card">
          <div className={`${container} py-14`}>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">{t.trustTitle}</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {t.trust.map((x) => (
                <div key={x.t} className="min-w-0 rounded-2xl border border-slate-200 bg-background/60 p-5">
                  <h3 className="font-display text-lg font-bold text-slate-900">{x.t}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{x.d}</p>
                </div>
              ))}
            </div>
            <Link href="/methodology" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">{t.methodsLink} →</Link>
          </div>
        </section>

        {/* Price */}
        <section id="price" className={`${container} scroll-mt-16 py-16`}>
          <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-card p-6 shadow-sm sm:p-8">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">{t.priceTitle}</h2>
            <p className="mt-2 text-[16px] leading-relaxed text-slate-700">{t.priceLead}</p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {t.priceItems.map((p) => (
                <li key={p} className="flex gap-2 text-[15px] text-slate-800"><span className="font-bold text-emerald-700">✓</span>{p}</li>
              ))}
            </ul>
            <div className="mt-5 text-sm text-slate-600">{t.priceNote}</div>
            <Link href="/signup/trainer" className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground hover:opacity-90">{t.ctaPrimary}</Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-border/70 bg-card">
          <div className={`${container} max-w-3xl py-14`}>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">{t.faqTitle}</h2>
            <div className="mt-6 space-y-3">
              {t.faq.map((q) => (
                <details key={q.q} className="group rounded-xl border border-slate-200 bg-background/60 p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-900">
                    <span>{q.q}</span><span className="text-slate-400 transition group-open:rotate-90">›</span>
                  </summary>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{q.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={`${container} py-16 text-center`}>
          <h2 className="text-balance font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{t.finalTitle}</h2>
          <p className="mt-2 text-[16px] text-slate-600">{t.finalLead}</p>
          <Link href="/signup/trainer" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-primary px-6 text-[15px] font-semibold text-primary-foreground hover:opacity-90">{t.ctaPrimary}</Link>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className={`${container} flex flex-col gap-4 py-8 text-sm text-slate-600 md:flex-row md:items-center md:justify-between`}>
          <div className="flex items-center gap-2">
            <PulseMark className="h-4 w-auto" />
            <span>MicroPulse · {OPERATOR.name}</span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/terms" className="hover:text-slate-900">{t.footer.terms}</Link>
            <Link href="/privacy/practices" className="hover:text-slate-900">{t.footer.privacy}</Link>
            <Link href="/help?for=trainers" className="hover:text-slate-900">{t.footer.help}</Link>
            <Link href="/home" className="hover:text-slate-900">{t.footer.clubs}</Link>
            <span>{t.footer.contact}: <span className="select-all text-slate-800">{OPERATOR.supportEmail}</span></span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
