"use client";

import * as React from "react";
import Link from "next/link";
import { useLang, type Lang } from "@/lib/lang";

const COPY: Record<Lang, {
  nav: { back: string; language: string };
  hero: { title: string; sub: string };
  sections: {
    gettingStarted: { title: string; items: { q: string; a: string }[] };
    training: { title: string; items: { q: string; a: string }[] };
    drillLibrary: { title: string; items: { q: string; a: string }[] };
    readiness: { title: string; items: { q: string; a: string }[] };
    players: { title: string; items: { q: string; a: string }[] };
    billing: { title: string; items: { q: string; a: string }[] };
  };
  contact: {
    title: string;
    body: string;
    email: string;
    sla: string;
    outages: string;
    outagesBody: string;
  };
  onboarding: {
    title: string;
    body: string;
    cta: string;
  };
}> = {
  EN: {
    nav: { back: "Back to app", language: "Language" },
    hero: {
      title: "Help center",
      sub: "Guides, FAQs and support for coaches using MicroPulse.",
    },
    sections: {
      gettingStarted: {
        title: "Getting started",
        items: [
          {
            q: "How do I sign up as a coach?",
            a: "Go to /signup, choose 'Coach', and enter your club details. If your club isn't listed yet, contact us and we'll activate it for you.",
          },
          {
            q: "How do I invite my players?",
            a: "From the Coach dashboard, open Settings → Team, copy the join link, and share it with your players. Players sign up with their email and the link auto-assigns them to your team.",
          },
          {
            q: "Which browsers are supported?",
            a: "Chrome, Safari, Firefox and Edge — latest two versions. The app also works on mobile (iOS and Android).",
          },
        ],
      },
      training: {
        title: "Training sessions",
        items: [
          {
            q: "How do I plan a training session?",
            a: "Open the Week setup view, drag drills from your library onto a session, and adjust duration and intensity. Save it, then publish it so your players see 'Next training' on their dashboard.",
          },
          {
            q: "What's the difference between saved and published sessions?",
            a: "Saved sessions are drafts only you can see. Publishing makes the session visible on the team page as 'Next training'. Unpublish any time to hide it again.",
          },
          {
            q: "Can I re-use last week's plan?",
            a: "Yes — click Duplicate on any saved session, then adjust dates and any drills that changed.",
          },
        ],
      },
      drillLibrary: {
        title: "Drill library",
        items: [
          {
            q: "Where do the drills in my library come from?",
            a: "Three sources: your own coach-owned drills (travel with you between teams), team-shared drills created by other coaches at the same club, and a public pool of starter templates. Use the scope filter to switch between them.",
          },
          {
            q: "How do I share a drill with my co-coaches?",
            a: "Open the drill and click 'Share to team'. A team copy is created — your co-coaches can use it without editing your original, and can claim it into their own library.",
          },
          {
            q: "How do I convert a team drill into one of my own?",
            a: "Open a team-scoped drill and click 'Claim to my library'. A personal copy is created, with a link back to the original so you remember where it came from.",
          },
        ],
      },
      readiness: {
        title: "Readiness & load",
        items: [
          {
            q: "What's the player readiness score?",
            a: "A composite of subjective wellness (sleep, soreness, stress), recent training load and RPE. It flags when a player is likely under-recovered so you can adjust intensity or drop them from contact work.",
          },
          {
            q: "What does the RPE discrepancy warning mean?",
            a: "When a player's perceived exertion (RPE) is much higher or lower than the session's expected load, we surface it as a discrepancy. Usually this means the session was harder or easier than planned for that specific player — use it as a conversation starter.",
          },
          {
            q: "How often should players check in?",
            a: "Daily wellness before training, RPE within 30 minutes of training end. We'll remind them automatically.",
          },
        ],
      },
      players: {
        title: "Player management",
        items: [
          {
            q: "How do I remove a player from my team?",
            a: "Settings → Team → Players → click Remove. They'll keep their account but lose access to your team's data.",
          },
          {
            q: "Can players see each other's data?",
            a: "No. Players only see their own readiness, load and training plan. Aggregated team views are coach-only.",
          },
        ],
      },
      billing: {
        title: "Billing & plans",
        items: [
          {
            q: "How do I book a demo?",
            a: "Visit our Pricing page and fill out the demo-request form. We reply within 1 business day.",
          },
          {
            q: "Can I try MicroPulse before paying?",
            a: "Yes — every club starts on a Free tier with full access for 14 days, no card required.",
          },
        ],
      },
    },
    contact: {
      title: "Contact support",
      body: "If you can't find what you need above, email us. We read every message.",
      email: "support@metabolic.is",
      sla: "Reply target: within 1 business day (Mon–Fri, 09:00–17:00 GMT).",
      outages: "Is the app down?",
      outagesBody: "We'll email all club admins when there's a confirmed outage and post updates until it's resolved.",
    },
    onboarding: {
      title: "New coach?",
      body: "Our 60-minute onboarding guide walks you through your first hour in MicroPulse — sign up, set up your team, plan your first session and send the first readiness check.",
      cta: "Open onboarding guide",
    },
  },
  IS: {
    nav: { back: "Til baka í app", language: "Tungumál" },
    hero: {
      title: "Hjálparmiðstöð",
      sub: "Leiðbeiningar, algengar spurningar og stuðningur fyrir þjálfara sem nota MicroPulse.",
    },
    sections: {
      gettingStarted: {
        title: "Fyrstu skrefin",
        items: [
          {
            q: "Hvernig skrái ég mig sem þjálfari?",
            a: "Farðu á /signup, veldu 'Þjálfari' og sláðu inn upplýsingar um félagið. Ef félagið þitt er ekki þarna, hafðu samband og við virkjum það fyrir þig.",
          },
          {
            q: "Hvernig býð ég leikmönnum?",
            a: "Af þjálfaradashboardinu opnar þú Stillingar → Lið, afritar join-linkinn og sendir á leikmenn. Þegar þeir skrá sig með linknum lenda þeir sjálfkrafa í liðinu þínu.",
          },
          {
            q: "Hvaða vafrar eru studdir?",
            a: "Chrome, Safari, Firefox og Edge — tvær nýjustu útgáfurnar. Appið virkar líka á síma (iOS og Android).",
          },
        ],
      },
      training: {
        title: "Æfingaseðlar",
        items: [
          {
            q: "Hvernig skipulegg ég æfingu?",
            a: "Opnaðu vikuskipulag, dragðu æfingar úr safninu þínu á session og stilltu tíma og ákefð. Vistaðu og birtu svo leikmenn sjái 'Næsta æfing' á sinni síðu.",
          },
          {
            q: "Hver er munurinn á vistaðri og birtri æfingu?",
            a: "Vistaðar æfingar eru drög sem aðeins þú sérð. Með því að birta verður æfingin sýnileg á liðssíðunni sem 'Næsta æfing'. Hægt að taka úr birtingu hvenær sem er.",
          },
          {
            q: "Get ég endurnýtt plan frá síðustu viku?",
            a: "Já — smelltu á Afrita á vistaðri æfingu og stilltu svo dagsetningar og þær æfingar sem breytast.",
          },
        ],
      },
      drillLibrary: {
        title: "Æfingasafn",
        items: [
          {
            q: "Hvaðan koma æfingarnar í safninu mínu?",
            a: "Þrjár uppsprettur: þínar eigin æfingar (fylgja þér milli liða), æfingar sem aðrir þjálfarar hjá félaginu hafa deilt, og opinberu safn af tilbúnum templates. Notaðu scope filterinn til að skipta á milli.",
          },
          {
            q: "Hvernig deili ég æfingu með öðrum þjálfurum?",
            a: "Opnaðu æfinguna og smelltu á 'Deila með liði'. Liðsafrit verður til — aðrir þjálfarar geta notað það án þess að breyta þínu eintaki, og geta claim-að því yfir í eigið safn.",
          },
          {
            q: "Hvernig breyti ég liðsæfingu í mína eigin?",
            a: "Opnaðu æfingu með 'Lið'-scope og smelltu á 'Claim til mín'. Persónulegt eintak verður til, með linki til baka á upprunalegu æfinguna.",
          },
        ],
      },
      readiness: {
        title: "Readiness & álag",
        items: [
          {
            q: "Hvað er readiness-skor leikmanns?",
            a: "Samsett úr sjálfsmati (svefn, eymsli, streita), nýlegu æfingaálagi og RPE. Gefur vísbendingu um þegar leikmaður er líklega undir í batastigum svo þú getir stillt ákefð eða sleppt honum úr snertingum.",
          },
          {
            q: "Hvað þýðir RPE-frávik?",
            a: "Þegar skynjuð áreynsla leikmanns (RPE) er mikið hærri eða lægri en gert var ráð fyrir, flöggum við því sem fráviki. Yfirleitt þýðir það að æfingin var erfiðari eða léttari en áætlað fyrir þann leikmann — notaðu sem samtalsupphaf.",
          },
          {
            q: "Hversu oft eiga leikmenn að checka in?",
            a: "Dagleg wellness fyrir æfingu, RPE innan 30 mínútna eftir æfingu. Við minnum á sjálfkrafa.",
          },
        ],
      },
      players: {
        title: "Leikmannaumsjón",
        items: [
          {
            q: "Hvernig fjarlægi ég leikmann úr liði?",
            a: "Stillingar → Lið → Leikmenn → smelltu á Fjarlægja. Þeir halda reikningnum en missa aðgang að liðs-gögnunum.",
          },
          {
            q: "Sjá leikmenn gögn hvers annars?",
            a: "Nei. Leikmenn sjá aðeins sína eigin readiness, álag og æfingaplan. Samantektir á liðinu eru aðeins fyrir þjálfara.",
          },
        ],
      },
      billing: {
        title: "Verðskrá & áskrift",
        items: [
          {
            q: "Hvernig bóka ég demo?",
            a: "Farðu á Verðskrá-síðuna og fylltu út demo-formið. Við svörum innan eins virks dags.",
          },
          {
            q: "Get ég prófað MicroPulse áður en ég greiði?",
            a: "Já — hvert félag byrjar á Free-tier með fullum aðgangi í 14 daga, ekkert kort.",
          },
        ],
      },
    },
    contact: {
      title: "Hafa samband",
      body: "Ef þú finnur ekki það sem þú leitar að, sendu okkur póst. Við lesum öll skilaboð.",
      email: "support@metabolic.is",
      sla: "Svartími: innan eins virks dags (mán–fös, 09:00–17:00 GMT).",
      outages: "Er appið niðri?",
      outagesBody: "Við sendum póst á alla félagsadmin þegar staðfest rof verður og uppfærum þar til viðgerð er lokið.",
    },
    onboarding: {
      title: "Nýr þjálfari?",
      body: "60-mínútna onboarding-leiðbeiningarnar leiða þig í gegnum fyrstu klukkustundina í MicroPulse — skráning, setja upp lið, skipuleggja fyrstu æfingu og senda fyrstu readiness-könnunina.",
      cta: "Opna onboarding-leiðbeiningar",
    },
  },
};

export default function HelpPage() {
  const [lang, setLang] = useLang();
  const t = COPY[lang];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-slate-900">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-900 hover:underline"
        >
          ← {t.nav.back}
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">{t.nav.language}:</span>
          <button
            type="button"
            onClick={() => setLang("EN")}
            className={`rounded px-2 py-1 ${
              lang === "EN"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang("IS")}
            className={`rounded px-2 py-1 ${
              lang === "IS"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            IS
          </button>
        </div>
      </div>

      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">{t.hero.title}</h1>
        <p className="mt-2 text-slate-600">{t.hero.sub}</p>
      </header>

      <section className="mb-10 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-lg font-semibold">{t.onboarding.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{t.onboarding.body}</p>
        <a
          href="/docs/60min-onboarding-guide.docx"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          {t.onboarding.cta}
        </a>
      </section>

      {(
        [
          "gettingStarted",
          "training",
          "drillLibrary",
          "readiness",
          "players",
          "billing",
        ] as const
      ).map((key) => {
        const section = t.sections[key];
        return (
          <section key={key} className="mb-8">
            <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
            <div className="space-y-3">
              {section.items.map((item, i) => (
                <details
                  key={i}
                  className="group rounded-lg border border-slate-200 bg-white p-4 [&_summary]:cursor-pointer"
                >
                  <summary className="flex items-center justify-between font-medium text-slate-900">
                    <span>{item.q}</span>
                    <span className="text-slate-400 transition group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </section>
        );
      })}

      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">{t.contact.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{t.contact.body}</p>
        <p className="mt-3">
          <a
            href={`mailto:${t.contact.email}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            {t.contact.email}
          </a>
        </p>
        <p className="mt-1 text-xs text-slate-500">{t.contact.sla}</p>

        <hr className="my-4 border-slate-200" />

        <h3 className="text-sm font-semibold">{t.contact.outages}</h3>
        <p className="mt-1 text-sm text-slate-600">{t.contact.outagesBody}</p>
      </section>
    </main>
  );
}
