"use client";

/**
 * /help — two audiences: personal trainers (?for=trainers; linked from the PT
 * app and the trainer sales page) and club coaches (default). Contact email
 * comes from OPERATOR. Only describe what the product does today.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang, type Lang } from "@/lib/lang";
import { OPERATOR, PT_SELF_SERVE_PUBLIC } from "@/lib/legal/operator";

type QA = { q: string; a: string };

/** Help for personal trainers (lota 2, 2026-11-22). */
const TRAINER_HELP: Record<Lang, Array<{ title: string; items: QA[] }>> = {
  EN: [
    {
      title: "Getting started",
      items: [
        { q: "How do I start?", a: (PT_SELF_SERVE_PUBLIC ? "Sign up at /signup/trainer." : `Write to ${OPERATOR.supportEmail} and we set up your practice.`) + " Your practice and a demo client are created straight away, and the checklist on your dashboard walks you through the first steps: pick a programme, invite a client, send a first session." },
        { q: "How do I invite a client?", a: "On your dashboard, open Invitations and enter the client's name and email. They get an email from your practice with a link to choose a password. If the email can't be sent, the link is shown so you can copy it and send it yourself." },
        { q: "My client didn't get the invitation", a: "Ask them to check spam. Then press Resend next to the invitation, or copy the link and send it by text. An invitation lasts 30 days; Resend opens an expired one again." },
        { q: "What is the demo client?", a: "A sample client with a few weeks of data, so you can see the dashboard working before inviting anyone. It is never counted, reminded or included in reports." },
      ],
    },
    {
      title: "Programmes",
      items: [
        { q: "Starter programme or my own plan?", a: "Starter programmes are 10 ready-made programmes of 6–12 weeks (speed, jumping, strength, muscle, beginner full body). Your own plan is built week by week in the plan builder under Programmes. You can use both across clients." },
        { q: "Can a client move a session?", a: "Yes, in plans you built yourself: the client (or you) can move a session to another day. Starter programmes follow a fixed weekly schedule and can't be moved." },
        { q: "How are target weights set?", a: "From a strength test you record for the client. After that they rise automatically from what the client actually lifts, and the client sees that the weight was raised from their logged lifts." },
      ],
    },
    {
      title: "Check-in and the dashboard",
      items: [
        { q: "What does the morning check-in do?", a: "The client answers a few questions (sleep, fatigue, soreness). On a yellow or red day the session is made lighter by the amount set in the plan, and the client sees exactly how much. You can turn check-in off for any client." },
        { q: "What is on 'Needs attention'?", a: "Clients who need you today: gone quiet, readiness sliding, load or tonnage rising too fast, pain in corrective exercises, a strength test due. Each one says why, what would clear it, and how much data it rests on." },
      ],
    },
    {
      title: "Reports and messages",
      items: [
        { q: "How do monthly reports work?", a: "On the 1st of each month a report is built for every client. Read it on the client's page and send it; the client then finds it under Progress → Reports." },
        { q: "How do I message a client?", a: "Use Chat in the bottom bar (or Conversations on a computer). Messages stay in one place per client." },
      ],
    },
    {
      title: "Account, price and data",
      items: [
        { q: "What does it cost?", a: "Nothing while MicroPulse is in early access. Before any price, we'll email you at least 30 days in advance. Your clients never pay." },
        { q: "Can I export or delete my data?", a: `Yes. Write to ${OPERATOR.supportEmail} and we'll export your practice's and clients' data, or delete it within 30 days.` },
        { q: "Which languages?", a: "English and Icelandic. Each client picks their own language, and their reminders follow it." },
      ],
    },
  ],
  IS: [
    {
      title: "Fyrstu skrefin",
      items: [
        { q: "Hvernig byrja ég?", a: (PT_SELF_SERVE_PUBLIC ? "Skráðu þig á /signup/trainer." : `Skrifaðu á ${OPERATOR.supportEmail} og við setjum stofuna upp.`) + " Stofan og prufuviðskiptavinur verða til strax og gátlistinn á stjórnborðinu leiðir þig í gegnum fyrstu skrefin: velja áætlun, bjóða viðskiptavini, senda fyrstu æfingu." },
        { q: "Hvernig býð ég viðskiptavini?", a: "Á stjórnborðinu opnarðu Boð og slærð inn nafn og netfang. Hann fær tölvupóst frá stofunni þinni með hlekk til að velja lykilorð. Ef ekki tekst að senda póstinn birtist hlekkurinn svo þú getir afritað hann og sent sjálf(ur)." },
        { q: "Viðskiptavinurinn fékk ekki boðið", a: "Biddu hann að skoða ruslpóstinn. Ýttu svo á Senda aftur við boðið, eða afritaðu hlekkinn og sendu í SMS. Boð gildir í 30 daga; Senda aftur opnar útrunnið boð aftur." },
        { q: "Hvað er prufuviðskiptavinurinn?", a: "Sýnisviðskiptavinur með nokkurra vikna gögnum svo þú sjáir stjórnborðið virka áður en þú býður einhverjum. Hann er aldrei talinn með, fær engar áminningar og er ekki í skýrslum." },
      ],
    },
    {
      title: "Áætlanir",
      items: [
        { q: "Byrjunaráætlun eða mín eigin?", a: "Byrjunaráætlanir eru 10 tilbúnar áætlanir, 6–12 vikna (hraði, stökk, styrkur, vöðvamassi, byrjendur). Þína eigin býrðu til viku fyrir viku í áætlanagerðinni undir Áætlanir. Þú getur notað hvort tveggja." },
        { q: "Getur viðskiptavinur fært æfingu?", a: "Já, í áætlunum sem þú bjóst til: viðskiptavinurinn (eða þú) getur fært æfingu á annan dag. Byrjunaráætlanir fylgja fastri vikudagskrá og ekki er hægt að færa þær." },
        { q: "Hvernig eru markþyngdir ákveðnar?", a: "Út frá styrkprófi sem þú skráir fyrir viðskiptavininn. Eftir það hækka þær sjálfkrafa út frá því sem hann lyftir í raun og hann sér að þyngdin var hækkuð út frá skráðum lyftum." },
      ],
    },
    {
      title: "Check-in og stjórnborðið",
      items: [
        { q: "Hvað gerir morgun-check-in?", a: "Viðskiptavinurinn svarar nokkrum spurningum (svefn, þreyta, harðsperrur). Á gulum eða rauðum degi verður æfingin léttari um það magn sem er stillt í áætluninni og hann sér nákvæmlega hve mikið. Þú getur slökkt á check-in fyrir hvern sem er." },
        { q: "Hvað er á „Þurfa athygli“?", a: "Viðskiptavinir sem þurfa á þér að halda í dag: hafa ekki látið í sér heyra, viðbúnaður á niðurleið, álag eða tonnage hækkar of hratt, verkur í leiðréttingaræfingum, styrkpróf á dagskrá. Hvert atriði segir af hverju, hvað myndi hreinsa það og á hve miklum gögnum það byggir." },
      ],
    },
    {
      title: "Skýrslur og skilaboð",
      items: [
        { q: "Hvernig virka mánaðarskýrslur?", a: "1. hvers mánaðar verður til skýrsla fyrir hvern viðskiptavin. Lestu hana á síðu viðskiptavinarins og sendu; hann finnur hana svo undir Framvinda → Skýrslur." },
        { q: "Hvernig sendi ég viðskiptavini skilaboð?", a: "Notaðu Spjall í neðri stikunni (eða Samtöl í tölvu). Skilaboðin eru á einum stað fyrir hvern viðskiptavin." },
      ],
    },
    {
      title: "Aðgangur, verð og gögn",
      items: [
        { q: "Hvað kostar þetta?", a: "Ekkert á meðan MicroPulse er á prufutíma. Áður en verð kemur sendum við þér póst með minnst 30 daga fyrirvara. Viðskiptavinir þínir borga aldrei." },
        { q: "Get ég fengið gögnin mín afhent eða eytt?", a: `Já. Skrifaðu á ${OPERATOR.supportEmail} og við afhendum gögn stofunnar og viðskiptavina hennar, eða eyðum þeim innan 30 daga.` },
        { q: "Hvaða tungumál?", a: "Enska og íslenska. Hver viðskiptavinur velur sitt tungumál og áminningarnar fylgja því." },
      ],
    },
  ],
};

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
            a: "Yes — the Free plan costs nothing and needs no card. Compare what each plan includes on the Pricing page.",
          },
        ],
      },
    },
    contact: {
      title: "Contact support",
      body: "If you can't find what you need above, email us. We read every message.",
      email: OPERATOR.supportEmail,
      sla: "Reply target: within 1 business day (Mon–Fri, 09:00–17:00 GMT).",
      outages: "Is the app down?",
      outagesBody: "We'll email all club admins when there's a confirmed outage and post updates until it's resolved.",
    },
    onboarding: {
      title: "New coach?",
      body: "Start with Getting started below: sign up, invite your players and plan your first session.",
      cta: "Go to Getting started",
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
            a: "Já — Free-áskriftin kostar ekkert og ekkert kort þarf. Berðu saman hvað hver áskrift inniheldur á verðsíðunni.",
          },
        ],
      },
    },
    contact: {
      title: "Hafa samband",
      body: "Ef þú finnur ekki það sem þú leitar að, sendu okkur póst. Við lesum öll skilaboð.",
      email: OPERATOR.supportEmail,
      sla: "Svartími: innan eins virks dags (mán–fös, 09:00–17:00 GMT).",
      outages: "Er appið niðri?",
      outagesBody: "Við sendum póst á alla félagsadmin þegar staðfest rof verður og uppfærum þar til viðgerð er lokið.",
    },
    onboarding: {
      title: "Nýr þjálfari?",
      body: "Byrjaðu á „Fyrstu skrefin“ hér fyrir neðan: skráning, bjóða leikmönnum og skipuleggja fyrstu æfingu.",
      cta: "Fara í Fyrstu skrefin",
    },
  },
};

const AUDIENCE_COPY: Record<Lang, { trainers: string; clubs: string; trainersSub: string; aria: string }> = {
  EN: { trainers: "Personal trainers", clubs: "Clubs", trainersSub: "Answers for personal trainers and S&C coaches using MicroPulse with their clients.", aria: "Who this help is for" },
  IS: { trainers: "Einkaþjálfarar", clubs: "Félög", trainersSub: "Svör fyrir einkaþjálfara og styrktarþjálfara sem nota MicroPulse með viðskiptavinum sínum.", aria: "Fyrir hvern hjálpin er" },
};

function QAList({ items }: { items: QA[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details key={item.q} className="group rounded-lg border border-slate-200 bg-white p-4 [&_summary]:cursor-pointer">
          <summary className="flex items-center justify-between gap-3 font-medium text-slate-900">
            <span>{item.q}</span>
            <span className="text-slate-400 transition group-open:rotate-90">›</span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export default function HelpPage() {
  return (
    <React.Suspense fallback={null}>
      <HelpInner />
    </React.Suspense>
  );
}

function HelpInner() {
  const [lang, setLang] = useLang();
  const t = COPY[lang];
  const a = AUDIENCE_COPY[lang];
  const router = useRouter();
  const forTrainers = useSearchParams().get("for") === "trainers";
  const trainerLegal = forTrainers && PT_SELF_SERVE_PUBLIC;
  const setAudience = (trainers: boolean) => router.replace(trainers ? "/help?for=trainers" : "/help", { scroll: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-slate-900">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href={forTrainers ? "/coach" : "/"}
          className="text-sm text-slate-500 hover:text-slate-900 hover:underline"
        >
          ← {t.nav.back}
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">{t.nav.language}:</span>
          {(["EN", "IS"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded px-2 py-1 ${lang === l ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t.hero.title}</h1>
        <p className="mt-2 text-slate-600">{forTrainers ? a.trainersSub : t.hero.sub}</p>
      </header>

      <div role="tablist" aria-label={a.aria} className="mb-8 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        {([[true, a.trainers], [false, a.clubs]] as const).map(([k, label]) => (
          <button key={label} type="button" role="tab" aria-selected={forTrainers === k} onClick={() => setAudience(k)}
            className={`flex-1 rounded-lg px-3 py-2 ${forTrainers === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>
            {label}
          </button>
        ))}
      </div>

      {forTrainers ? (
        TRAINER_HELP[lang].map((section) => (
          <section key={section.title} className="mb-8">
            <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
            <QAList items={section.items} />
          </section>
        ))
      ) : (
        <>
          <section className="mb-10 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-lg font-semibold">{t.onboarding.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{t.onboarding.body}</p>
            <a href="#getting-started" className="mt-3 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
              {t.onboarding.cta}
            </a>
          </section>

          {(["gettingStarted", "training", "drillLibrary", "readiness", "players", "billing"] as const).map((key) => {
            const section = t.sections[key];
            return (
              <section key={key} id={key === "gettingStarted" ? "getting-started" : undefined} className="mb-8 scroll-mt-6">
                <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
                <QAList items={section.items} />
              </section>
            );
          })}
        </>
      )}

      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">{t.contact.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{t.contact.body}</p>
        <p className="mt-3 select-all text-sm font-medium text-blue-600">{t.contact.email}</p>
        <p className="mt-1 text-xs text-slate-500">{t.contact.sla}</p>

        <hr className="my-4 border-slate-200" />

        <h3 className="text-sm font-semibold">{t.contact.outages}</h3>
        <p className="mt-1 text-sm text-slate-600">{t.contact.outagesBody}</p>
      </section>

      <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-500">
        {/* Practice terms + privacy only once they are public (PT_SELF_SERVE_PUBLIC). */}
        <Link href={trainerLegal ? "/terms" : "/pricing"} className="hover:text-slate-900">{trainerLegal ? (lang === "IS" ? "Skilmálar" : "Terms") : (lang === "IS" ? "Verð" : "Pricing")}</Link>
        <Link href={trainerLegal ? "/privacy/practices" : "/privacy"} className="hover:text-slate-900">{lang === "IS" ? "Persónuvernd" : "Privacy"}</Link>
      </nav>
    </main>
  );
}
