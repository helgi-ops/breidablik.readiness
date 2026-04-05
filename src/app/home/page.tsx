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
    coach: string;
    intelligence: string;
    decisions: string;
    ate: string;
    features: string;
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
    review: string;
    players: string;
    recommendation: string;
    piTitle: string;
    baseline: string;
    volatility: string;
    mix: string;
    fatigue: string;
    neural: string;
    nextRisk: string;
    ate: string;
    cmj: string;
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
    items: Array<{ t: string; d: string }>;
    summaryTitle: string;
    summaryRows: string[];
  };
  decisions: {
    title: string;
    sub: string;
    actions: string[];
    scenariosTitle: string;
    scenarios: Array<{ t: string; d: string }>;
  };
  ate: {
    title: string;
    sub: string;
    cards: Array<{ t: string; d: string }>;
    note: string;
  };
  features: {
    title: string;
    groups: Array<{
      name: string;
      items: string[];
    }>;
  };
  pricing: {
    title: string;
    sub: string;
    plans: Array<{
      name: string;
      bestFor: string;
      price: string;
      priceLocal?: string;
      summary: string;
      features: string[];
      cta: string;
      href: string;
      highlight?: boolean;
    }>;
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
    demo: string;
  };
  auth: { signIn: string };
  footer: string;
};

const COPY: Record<Lang, CopyShape> = {
  EN: {
    nav: {
      how: "How it works",
      coach: "Coach OS",
      intelligence: "Performance Intelligence",
      decisions: "Team Decisions",
      ate: "Training Engine",
      features: "Features",
      faq: "FAQ",
      pricing: "Pricing",
      cta: "Get started",
    },
    hero: {
      title: "Know who needs attention — before training starts.",
      sub: "MicroPulse gives staff one daily view: who's at risk, what to adjust, and why — built on real monitoring data from your squad.",
      primary: "Start with Free",
      secondary: "Book a demo",
      chips: [
        "Daily readiness scan",
        "GPS load & ACWR",
        "Player Load & IMA — basketball ready",
        "FULL / REDUCED / RECOVERY",
        "Fatigue & neural load",
        "VALD force plate monitoring",
        "CMJ required alerts",
        "Match-week operations",
        "Adaptive Training Engine",
      ],
      trust: "Performance Intelligence Platform",
    },
    panel: {
      title: "Today Command Center",
      risk: "Risk Level: CAUTION",
      action: "Team Action: REDUCED",
      review: "Needs review: 7 players",
      players: "Total players: 30",
      recommendation: "Team Recommendation: keep quality high, reduce volume, and use individual modifications for flagged players.",
      piTitle: "Performance Intelligence — Team",
      baseline: "Baseline: On track",
      volatility: "Volatility: Elevated",
      mix: "Readiness Mix: 20% RED · 53% YELLOW · 27% GREEN",
      fatigue: "Team Fatigue: Dominant systemic pattern",
      neural: "Team Neural Load: Rising",
      nextRisk: "Next-day Risk: Moderate",
      ate: "ATE: Session guidance ready for S&C review",
      cmj: "CMJ Required: 4 players flagged for testing today",
    },
    how: {
      title: "From check-in to training plan — in minutes.",
      sub: "Players check in, MicroPulse scans the squad, staff review what matters and confirm the day. One flow, every day.",
      steps: [
        { t: "1) Players check in", d: "60 seconds per player. Daily readiness and wellness data collected across the squad." },
        { t: "2) See the squad in one view", d: "Risk level, team action, and the players who need attention — surfaced instantly." },
        { t: "3) Review flagged players", d: "See why each player was flagged and what to do — before you walk on the pitch." },
        { t: "4) Confirm the day plan", d: "Set FULL / REDUCED / RECOVERY, lock the decision. Every staff member sees the same picture." },
      ],
    },
    coach: {
      title: "Built for coaching, performance, and medical alignment",
      sub: "A shared decision engine so coaches, S&C, performance directors, and medical staff can work from one operational picture.",
      cards: [
        { t: "Today Command Center", d: "Understand the team in seconds with risk level, team action, players needing review, and recommendation." },
        { t: "Players Needing Review", d: "Direct staff attention to the right athletes before training begins." },
        { t: "Decision Controls", d: "Apply FULL / REDUCED / RECOVERY, use templates, and keep decisions consistent with save + lock." },
        { t: "Compliance Monitoring", d: "Track check-in reminders, missing players, and daily response coverage." },
        { t: "GPS Load Monitoring", d: "Track 7-day acute load, 28-day chronic load, and ACWR per player from Catapult. Football teams see velocity bands and acceleration zones; basketball teams automatically switch to Player Load, IMA Accels/Decels, IMA COD, and Max Velocity." },
        { t: "Mechanical Load Index (MLI)", d: "Composite score normalised to each player's own 28-day baseline — combining decelerations, accelerations, change-of-direction events, and PlayerLoad density. Flags decel spikes and dense mechanical sessions before they become injuries." },
        { t: "Metabolic Load Score", d: "0–100 score from metabolic power, HML distance, and time above threshold — z-score normalised per player. Classifies fatigue as mechanical, metabolic, global, or perceived mismatch when RPE is elevated but GPS is not." },
        { t: "Match-week Operations", d: "Run Week setup, Match minutes, TV view, and Messages from one workflow. Yesterday Load auto-populated from Catapult." },
        { t: "VALD / CMJ Monitoring", d: "See which players need a CMJ test today — flagged by neuromuscular concern, protocol day (MD-2/MD+1), or stale/missing baseline. VALD force plate data feeds directly into readiness and injury risk scores." },
        { t: "Smart Push Notifications", d: "Players receive check-in reminders timed to training. CMJ alerts fire automatically after check-in — no duplicate notifications." },
        { t: "MD-day Comparison (STEN)", d: "Compare every player's GPS session against the team's own historical MD-day averages. STEN 1–10 scoring on duration, total distance, HIR, Player Load, velocity bands, accelerations/decelerations, max velocity, and sprint distance — with a clickable team drill-down per metric." },
        { t: "Session Planning Benchmarks", d: "Before training starts, see the typical duration, distance, Player Load, and mechanical load for any MD context (MD-5 through MD+3). Mean ± 1σ bands drawn from the team's own history — plan the session before it happens." },
        { t: "Weekly GPS Load", d: "Team-level weekly load view directly inside the GPS tab — rolling acute load and trend for each player, so coaches see cumulative GPS exposure at a glance alongside MD-day scores and ACWR." },
        { t: "Manual GPS Entry", d: "When a player forgets their GPS unit, enter values directly from a dedicated form. Supports 8 metrics (distance, Player Load, velocity bands, accelerations, decelerations, accel/decel band 2-3) and flags which sessions are manual vs Catapult." },
        { t: "Staff Alignment", d: "Keep coach, performance, and support staff aligned on one daily plan." },
      ],
    },
    intelligence: {
      title: "More than monitoring.",
      sub: "MicroPulse combines explainable readiness and risk logic with decision support and workflow execution.",
      chips: ["Baseline", "Volatility", "Readiness Mix", "Team Fatigue", "Team Neural Load", "Next-day Risk", "GPS ACWR", "Player Load", "IMA COD", "MLI", "Metabolic Load", "MD-day STEN", "Planning Benchmarks", "VALD / CMJ"],
      items: [
        { t: "Detect fatigue and instability earlier", d: "Surface neural fatigue, volatility, and trend shifts before they become costly." },
        { t: "Mechanical Load Index — per player, per session", d: "Composite score (0–100) from decelerations, accelerations, CoD, and PlayerLoad — normalised to the player's own 28-day baseline. Bands from LOW to EXTREME. Residual MLI tracks accumulated mechanical stress across 3 days." },
        { t: "Metabolic Load Score — fatigue type classification", d: "0–100 score from metabolic power and HML distance. Classifies each day as mechanical fatigue, metabolic fatigue, global fatigue, perceived mismatch (RPE elevated but GPS normal), or recovery mismatch." },
        { t: "GPS load monitoring per player", d: "Football: 7-day acute, 28-day chronic, ACWR, velocity bands, and acceleration zones. Basketball: Player Load, PL/min, IMA COD, IMA Accels/Decels, Max Velocity — automatically switching based on team sport." },
        { t: "VALD force plate data in the readiness score", d: "CMJ drop, hamstring asymmetry (NordBoard), and isometric strength (ForceFrame) feed directly into readiness adjustment and injury risk scoring." },
        { t: "MD-day STEN comparison & planning benchmarks", d: "Scores each GPS session on a 1–10 STEN scale against the team's own historical MD-day distribution — so MD-2 is compared to prior MD-2 sessions, not to a generic average. Also produces pre-session planning bands (μ ± 1σ) for duration, distance, Player Load, velocity bands, and accelerations/decelerations." },
        { t: "Keep departments aligned", d: "Coordinate coaching, performance, and medical decisions with one source of truth." },
      ],
      summaryTitle: "Example team summary",
      summaryRows: [
        "Status: Stable",
        "Baseline: On track",
        "Readiness Mix: Balanced with yellow concentration",
        "Dominant Fatigue: Systemic",
        "Neural Load: Rising",
        "Next-day Risk: Moderate",
        "GPS ACWR: 3 players below 0.8 (low load)",
        "CMJ Required: 4 players flagged for testing today",
      ],
    },
    decisions: {
      title: "Better decisions, less guesswork.",
      sub: "MicroPulse helps teams make faster, clearer, and more consistent decisions by combining monitoring, performance context, and decision support in one operational system.",
      actions: [
        "Review flagged players with context",
        "See recommended action states",
        "Use templates in the same flow",
        "Save and lock final team decisions",
        "Run Generate Today Decisions and confirm outputs",
      ],
      scenariosTitle: "Operational use cases",
      scenarios: [
        { t: "Daily squad readiness review", d: "Scan team status before field or gym starts." },
        { t: "Flagged-player triage", d: "Prioritize interventions where it matters most." },
        { t: "Neural fatigue management", d: "Adjust plan when neural load and next-day risk trend up." },
        { t: "Match-week support", d: "Coordinate decisions with Week setup and Match minutes context." },
      ],
    },
    ate: {
      title: "Adaptive Training Engine (ATE)",
      sub: "Deterministic strength & conditioning decision support layered on top of MicroPulse workflows.",
      cards: [
        { t: "Coach-support, not coach-replacement", d: "ATE supports staff decisions; coaches keep final control." },
        { t: "Context-aware session guidance", d: "Uses readiness, fatigue, neural load, md context, and yesterday load to guide sessions." },
        { t: "Microdose-template aligned", d: "Keeps session identity anchored to current microdose templates while applying small, explainable adjustments." },
        { t: "Faster S&C decisions", d: "Helps staff translate daily signals into practical programming choices with consistency." },
      ],
      note: "ATE is integrated as decision support inside the existing coach workflow and session decision layer.",
    },
    features: {
      title: "One platform across monitoring, intelligence, decisions, and operations",
      groups: [
        {
          name: "Monitoring",
          items: [
            "Daily player check-ins",
            "Readiness and wellness tracking",
            "Team-level status visibility",
          ],
        },
        {
          name: "Intelligence",
          items: [
            "Performance Intelligence — Team",
            "Neural fatigue and volatility context",
            "GPS load monitoring — 7D acute, 28D chronic, ACWR",
            "Four-zone ACWR colour coding (low / optimal / elevated / high)",
            "Basketball GPS — Player Load, PL/min, IMA COD, IMA Accels/Decels, Max Velocity",
            "Mechanical Load Index (MLI) — 0–100 per player, 28-day normalised",
            "Metabolic Load Score — fatigue type classification per session",
            "VALD force plate data in readiness score and injury risk",
            "CMJ freshness tracking — fresh / stale / missing baseline",
          ],
        },
        {
          name: "Decision Support",
          items: [
            "FULL / REDUCED / RECOVERY guidance",
            "Adaptive Training Engine support",
            "Explainable player-state and match-week context logic",
            "CMJ Required flag — neuromuscular, protocol day, or stale data",
          ],
        },
        {
          name: "Workflow / Operations",
          items: [
            "Players needing review workflow",
            "Check-in and RPE reminders — timed to training schedule",
            "CMJ push alerts — sent after check-in, no duplicate notifications",
            "Week setup, match context, and staff coordination",
            "Yesterday Load auto-populated from Catapult",
          ],
        },
      ],
    },
    testimonials: {
      title: "Built for daily staff decisions",
      items: [
        { q: "We used to spend 20 minutes before training figuring out who needs what. Now it takes two minutes.", a: "Head Coach, Professional Football Club" },
        { q: "The GPS ACWR view tells me instantly who's underloaded going into a match week.", a: "S&C Coach, Elite Academy" },
        { q: "ATE helps us keep S&C programming consistent with the day context.", a: "Strength & Conditioning Coach, Pro Club" },
      ],
    },
    faq: {
      title: "FAQ",
      items: [
        { q: "Is this only for football?", a: "No. MicroPulse supports multi-sport team environments, including football, basketball, handball, volleyball, and academies." },
        { q: "What does the coach dashboard help staff do?", a: "It helps staff scan the squad, review flagged players, understand team intelligence, and confirm the day plan." },
        { q: "How do FULL / REDUCED / RECOVERY decisions work?", a: "MicroPulse combines daily inputs and context into a recommended team action that coaches can adjust, save, and lock." },
        { q: "What is Performance Intelligence — Team?", a: "A team-level layer for baseline, volatility, readiness mix, status snapshot, and recommendation." },
        { q: "How does MicroPulse help with neural fatigue / neural load?", a: "It surfaces Team Neural Load trend, dominant fatigue context, and next-day risk so staff can adjust earlier." },
        { q: "Can staff save and lock decisions?", a: "Yes. Coaches can confirm the final daily call using save and lock controls." },
        { q: "Does MicroPulse support match-week operations?", a: "Yes. Current workflow includes Week setup, Match minutes, Messages, TV view, and Yesterday Load — automatically populated from Catapult." },
        { q: "What is GPS Load Monitoring?", a: "A dedicated squad view showing 7-day acute load, 28-day chronic load, and ACWR per player from Catapult, using true rolling calendar windows. ACWR is colour-coded across four zones: blue (<0.8 underloaded), green (0.8–1.3 optimal), amber (1.3–1.5 elevated), red (>1.5 high risk)." },
        { q: "Does MicroPulse support basketball GPS metrics?", a: "Yes. For basketball teams using Catapult (BMP/Vector T7), MicroPulse automatically displays Player Load, Player Load per minute, IMA Changes of Direction, IMA Accelerations, IMA Decelerations, Total Distance, and Max Velocity. The GPS tab switches automatically based on the team's sport — no manual configuration needed. Football teams are unaffected." },
        { q: "What is Adaptive Training Engine (ATE)?", a: "ATE is a deterministic decision support layer for strength & conditioning planning inside the existing MicroPulse workflow." },
        { q: "Is ATE replacing the coach?", a: "No. ATE supports coaches and performance staff; final decisions remain coach-led." },
        { q: "How does ATE support strength & conditioning staff?", a: "It helps convert readiness and team context into practical, explainable session guidance with better day-to-day consistency." },
        { q: "Does MicroPulse integrate with VALD Performance devices?", a: "Yes. ForceDecks (CMJ / force plate), NordBoard (hamstring), and ForceFrame (isometric) all sync to MicroPulse. The data feeds directly into readiness score adjustments and injury risk calculations." },
        { q: "What is the CMJ Required flag?", a: "A daily alert that tells staff which players should do a countermovement jump test before training — triggered by a neuromuscular flag, a protocol day (MD-2 or MD+1), or a stale/missing CMJ baseline." },
        { q: "How does the CMJ push notification work?", a: "After a player submits their check-in, MicroPulse sends them a push notification if a CMJ test is required that day. It fires at the second check-in slot — around training time — so players get the reminder when it's actionable." },
        { q: "How do check-in and RPE notifications work?", a: "Check-in reminders fire 60 minutes before training. RPE notifications go out after training — timed to the actual session end, not a fixed morning slot. All notifications use the player's registered push subscription." },
      ],
    },
    cta: {
      title: "Ready to run smarter training days?",
      body: "Start for free and see how MicroPulse changes your daily preparation — or book a 20-minute demo and we'll walk you through it.",
      start: "Start free — no setup needed",
      demo: "Book a 20-min demo",
    },
    auth: { signIn: "Sign in" },
    footer: "Performance intelligence and decision support for coaching, performance, and medical teams.",
    pricing: {
      title: "Choose the MicroPulse plan that fits your team",
      sub: "MicroPulse scales from simple daily monitoring to full performance intelligence for coaching, performance, and medical staff.",
      plans: [
        {
          name: "Free",
          bestFor: "Best for small teams, academies, and coaches testing the platform.",
          price: "€0 / month",
          summary: "Start with daily monitoring and basic team visibility.",
          features: [
            "Daily player check-in",
            "Basic readiness score",
            "Player monitoring dashboard",
            "Individual player status",
            "Up to 15 players",
            "Basic monitoring insights",
          ],
          cta: "Start with Free",
          href: "/pricing",
        },
        {
          name: "Pro",
          bestFor: "Best for S&C coaches, performance staff, and single-team environments.",
          price: "€349 / month",
          priceLocal: "49.990 kr / mánuð",
          summary: "Run daily team operations with smarter readiness and session decision support.",
          features: [
            "Unlimited squad size",
            "Coach dashboard & team readiness overview",
            "Adaptive Training Engine",
            "Neural Fatigue Model",
            "GPS Load Monitoring — 7D / 28D / ACWR",
            "Weekly GPS Load — team view inside GPS tab",
            "MD-day Comparison (STEN 1–10) with clickable drill-down",
            "Manual GPS Entry — backup for missing units",
            "Basketball GPS — Player Load, PL/min, IMA COD, IMA Accels/Decels",
            "Mechanical Load Index (MLI) — decel, accel, CoD, PlayerLoad",
            "Metabolic Load Score — metabolic power, HML distance, fatigue type",
            "GPS integration",
            "Yesterday Load — auto-populated from Catapult",
            "VALD / CMJ monitoring tab",
            "CMJ Required alerts — per player, with reason",
            "VALD force plate data in readiness & risk scores",
            "Smart push notifications — check-in, RPE & CMJ",
            "Match-week operations",
            "Explainable readiness decisions",
            "Team workflow tools",
          ],
          cta: "Book a demo",
          href: "/pricing#demo",
          highlight: true,
        },
        {
          name: "Elite",
          bestFor: "Best for professional clubs, multi-team organizations, and leadership staff.",
          price: "From €1250 / month",
          priceLocal: "149.990 kr / mánuð",
          summary: "Scale performance intelligence across teams, departments, and leadership.",
          features: [
            "Everything in Pro",
            "Session Planning Benchmarks — μ ± 1σ bands per MD-day",
            "Performance Intelligence platform",
            "Injury risk modelling and load forecasting",
            "Neural + volatility intelligence",
            "Cross-team analytics and organization dashboards",
            "Executive reporting",
            "Multiple data source integrations (GPS, VALD, internal load, and more)",
            "Automation and smart alerts",
            "Medical + performance oversight",
            "Dedicated onboarding & priority support",
          ],
          cta: "Talk to us about Elite",
          href: "/pricing#demo",
        },
      ],
    },
  },

  IS: {
    nav: {
      how: "Hvernig virkar",
      coach: "Coach OS",
      intelligence: "Performance Intelligence",
      decisions: "Daglegar ákvarðanir",
      ate: "Þjálfunarvél",
      features: "Eiginleikar",
      faq: "Spurningar",
      pricing: "Verðskrá",
      cta: "Byrja",
    },
    hero: {
      title: "Veistu hverjir þurfa athygli — áður en æfingin byrjar.",
      sub: "MicroPulse gefur staffi eina daglega mynd: hverjir eru í hættu, hvað á að breyta og hvers vegna — byggt á raunverulegum gögnum frá hópnum þínum.",
      primary: "Byrja með Free",
      secondary: "Bóka demo",
      chips: [
        "Dagleg readiness skönnun",
        "GPS álag & ACWR",
        "Player Load & IMA — körfubolti studdur",
        "FULL / REDUCED / RECOVERY",
        "Þreyta & neural load",
        "VALD kraftplata monitoring",
        "CMJ áminningar",
        "Leikjaviku rekstur",
        "Adaptive Training Engine",
      ],
      trust: "Performance Intelligence Platform",
    },
    panel: {
      title: "Today Command Center",
      risk: "Áhættustig: CAUTION",
      action: "Liðsaðgerð: REDUCED",
      review: "Needs review: 7 leikmenn",
      players: "Heildarfjöldi leikmanna: 30",
      recommendation: "Team Recommendation: halda gæðum háum, draga úr magni og beita einstaklingsaðlögun fyrir flagged leikmenn.",
      piTitle: "Performance Intelligence — Team",
      baseline: "Baseline: On track",
      volatility: "Volatility: Elevated",
      mix: "Readiness Mix: 20% RED · 53% YELLOW · 27% GREEN",
      fatigue: "Team Fatigue: dominant systemic pattern",
      neural: "Team Neural Load: Rising",
      nextRisk: "Next-day Risk: Moderate",
      ate: "ATE: session guidance tilbúið fyrir S&C review",
      cmj: "CMJ Required: 4 leikmenn flaggaðir í próf í dag",
    },
    how: {
      title: "Frá check-in yfir í æfingarplan — á nokkrum mínútum.",
      sub: "Leikmenn skrá inn, MicroPulse skannar hópinn, staff fer yfir það sem skiptir máli og staðfestir daginn. Eitt flæði, á hverjum degi.",
      steps: [
        { t: "1) Leikmenn skrá inn", d: "60 sekúndur á leikmann. Dagleg readiness- og vellíðanargögn safnast fyrir allan hópinn." },
        { t: "2) Sjáðu hópinn í einni mynd", d: "Áhættustig, liðsaðgerð og leikmenn sem þurfa athygli — sýnt samstundis." },
        { t: "3) Farðu yfir flagged leikmenn", d: "Sjáðu hvers vegna og hvað á að gera — áður en þú labbar á völlinn." },
        { t: "4) Staðfestu daginn", d: "FULL / REDUCED / RECOVERY, læstu ákvörðuninni. Allir staff sjá sömu mynd." },
      ],
    },
    coach: {
      title: "Byggt fyrir samhæfingu þjálfara, performance og medical staff",
      sub: "Eitt ákvörðunarlag sem heldur deildum samstilltum í daglegum rekstri.",
      cards: [
        { t: "Today Command Center", d: "Skildu stöðu liðsins á sekúndum: áhætta, liðsaðgerð, needs review og ráðlegging." },
        { t: "Players Needing Review", d: "Beindu athygli staffs á réttu leikmennina fyrir æfingu." },
        { t: "Decision Controls", d: "Settu FULL / REDUCED / RECOVERY, notaðu templates og haltu samræmi með save + lock." },
        { t: "Compliance Monitoring", d: "Fylgstu með check-in reminders, vantar leikmenn og svörun dagsins." },
        { t: "GPS Load Monitoring", d: "Sjáðu 7-daga acute load, 28-daga chronic load og ACWR fyrir hvern leikmann frá Catapult. Fótboltaliðin sjá hraðasvið og hraðnunarsvæði; körfuboltaliðin skipta sjálfkrafa yfir í Player Load, IMA Accels/Decels, IMA COD og Max Velocity." },
        { t: "Mechanical Load Index (MLI)", d: "Samsett tala (0–100) normalized á 28-daga baseline hvers leikmanna — byggð á hraðnun, hægðun, snúnings-atburðum og PlayerLoad þéttleika. Flaggar decel spikes og þétt vélrænt álag." },
        { t: "Metabolic Load Score", d: "0–100 tala frá metabolic power og HML distance — z-score normalized per leikmann. Flokkar þreytu sem vélræna, metabolic, global, eða perceived mismatch þegar RPE er hærra en GPS sýnir." },
        { t: "Match-week Operations", d: "Keyrðu Week setup, Match minutes, TV view og Messages. Yesterday Load sóttur sjálfkrafa frá Catapult." },
        { t: "VALD / CMJ Monitoring", d: "Sjáðu hvaða leikmenn þurfa CMJ próf í dag — flaggaðir vegna neuromuscular áhyggna, protocol dags (MD-2/MD+1) eða gamalla/vantar baseline gagna. VALD kraftplata gögn renna beint inn í readiness og injury risk." },
        { t: "Snjall push notifications", d: "Leikmenn fá check-in áminningar tímasettir að æfingu. CMJ tilkynningar berast sjálfkrafa eftir check-in — engar tvíteknar tilkynningar." },
        { t: "MD-dags samanburður (STEN)", d: "Beri saman GPS session hvers leikmanns við sögulegt meðaltal liðsins fyrir sama MD-dag. STEN 1–10 skor fyrir tímalengd, heildarvegalengd, HIR, Player Load, hraðasvið, hröðun/hægðun, hámarkshraða og sprettvegalengd — með drill-down á hvern mælikvarða." },
        { t: "Session Planning Benchmarks", d: "Áður en æfing byrjar: sjáðu dæmigerða tímalengd, vegalengd, Player Load og mekanískt álag fyrir hvern MD-dag (MD-5 til MD+3). Meðaltal ± 1σ bönd byggð á sögu liðsins — plan-aðu session áður en hún gerist." },
        { t: "Vikuálag (Weekly GPS Load)", d: "Liðsyfirlit yfir vikuálag beint inni á GPS flipanum — rúllandi acute load og trend fyrir hvern leikmann, svo þjálfarar sjá uppsafnað GPS álag samhliða MD-dags skori og ACWR." },
        { t: "Handvirk GPS skráning", d: "Þegar leikmaður gleymir GPS kubbnum má slá inn tölur beint í eyðublað. Styður 8 breytur (vegalengd, Player Load, hraðabönd, hröðun, hægðun, accel/decel band 2-3) og flaggar hvaða sessions eru handvirkar vs Catapult." },
        { t: "Staff Alignment", d: "Samræmdu þjálfara, performance og stuðningsstaff á einu dagsplani." },
      ],
    },
    intelligence: {
      title: "Meira en monitoring.",
      sub: "MicroPulse sameinar útskýranlega readiness/risk rökfræði, ákvörðunarstuðning og rekstrarflæði.",
      chips: ["Baseline", "Volatility", "Readiness Mix", "Team Fatigue", "Team Neural Load", "Next-day Risk", "GPS ACWR", "Player Load", "IMA COD", "MLI", "Metabolic Load", "MD-dags STEN", "Planning viðmið", "VALD / CMJ"],
      items: [
        { t: "Performance Intelligence — Team", d: "Staða dagsins fyrir readiness prófíl, baseline, volatility og ráðleggingu." },
        { t: "Team Fatigue samhengi", d: "Sjáðu dominant fatigue pattern og hvar álag er að safnast í hópnum." },
        { t: "Mechanical Load Index — per leikmann, per session", d: "Samsett tala (0–100) normalized á 28-daga baseline — byggð á hraðnun, hægðun, snúningum og PlayerLoad þéttleika. Residual MLI rekur uppsafnað vélrænt álag yfir 3 daga." },
        { t: "Metabolic Load Score — þreytugerð flokkun", d: "0–100 tala frá metabolic power og HML distance. Flokkar hvern dag sem vélræna þreytu, metabolic þreytu, global þreytu, perceived mismatch (RPE hækkað en GPS ekki), eða recovery mismatch." },
        { t: "GPS load monitoring per leikmann", d: "Fótbolti: 7-daga acute load, 28-daga chronic, ACWR og hraðasvið. Körfubolti: Player Load, PL/min, IMA COD, IMA Accels/Decels og Max Velocity — skiptir sjálfkrafa yfir eftir íþrótt liðsins." },
        { t: "VALD kraftplata gögn í readiness score", d: "CMJ lækkun, hamstring asymmetri (NordBoard) og isometric styrkur (ForceFrame) hafa bein áhrif á readiness adjustment og injury risk scoring." },
        { t: "MD-dags STEN samanburður og planning viðmið", d: "Skorar hverja GPS session á 1–10 STEN kvarða miðað við sögu liðsins fyrir sama MD-dag — þannig að MD-2 er borinn saman við fyrri MD-2 sessions, ekki almennt meðaltal. Gefur líka planning bönd (μ ± 1σ) fyrir tímalengd, vegalengd, Player Load, hraðabönd og hröðun/hægðun fyrir session." },
      ],
      summaryTitle: "Dæmi um liðsyfirlit",
      summaryRows: [
        "Status: Stable",
        "Baseline: On track",
        "Readiness Mix: Jafnvægi með yellow þéttni",
        "Dominant Fatigue: Systemic",
        "Neural Load: Rising",
        "Next-day Risk: Moderate",
        "GPS ACWR: 3 leikmenn undir 0.8 (of lítið álag)",
        "CMJ Required: 4 leikmenn flaggaðir í próf í dag",
      ],
    },
    decisions: {
      title: "Betri ákvarðanir, minni getgáta.",
      sub: "MicroPulse hjálpar teymum að taka hraðari, skýrari og samræmdari ákvarðanir með því að tengja monitoring, performance samhengi og ákvörðunarstuðning í eitt kerfi.",
      actions: [
        "Fara yfir flagged leikmenn með samhengi",
        "Sjá ráðlagðar action states",
        "Nota templates í sama flæði",
        "Vista og læsa endanlegum liðákvörðunum",
        "Keyra Generate Today Decisions og staðfesta niðurstöður",
      ],
      scenariosTitle: "Dæmigerð notkun",
      scenarios: [
        { t: "Dagleg readiness yfirferð", d: "Skannaðu liðsstöðu áður en völlur eða salur byrjar." },
        { t: "Triage fyrir flagged leikmenn", d: "Forgangsraðaðu inngripum þar sem þau skipta mestu." },
        { t: "Neural fatigue stýring", d: "Stilltu plan þegar neural load og next-day risk hækka." },
        { t: "Leikjaviku stuðningur", d: "Samhæfðu ákvarðanir með Week setup og Match minutes samhengi." },
      ],
    },
    ate: {
      title: "Adaptive Training Engine (ATE)",
      sub: "Deterministic stuðningur fyrir styrktar- og þolþjálfun ofan á núverandi MicroPulse vinnuflæði.",
      cards: [
        { t: "Stuðningur, ekki staðgengill", d: "ATE styður staff ákvörðun; þjálfarar halda lokaákvörðun." },
        { t: "Samhengismiðuð session guidance", d: "Notar readiness, fatigue, neural load, md context og yesterday load til að styðja session planning." },
        { t: "Samræmt microdose templates", d: "Heldur session identity í núverandi templates og bætir við litlum, útskýranlegum breytingum." },
        { t: "Hraðari S&C ákvarðanir", d: "Hjálpar staffi að breyta daglegum merkjum í hagnýtar og stöðugar programming ákvarðanir." },
      ],
      note: "ATE er notað sem ákvörðunarstuðningur inni í núverandi coach workflow og session decision layer.",
    },
    features: {
      title: "Einn vettvangur fyrir monitoring, intelligence, decisions og operations",
      groups: [
        {
          name: "Monitoring",
          items: [
            "Dagleg player check-in",
            "Readiness og wellness tracking",
            "Liðsyfirsýn í rauntíma",
          ],
        },
        {
          name: "Intelligence",
          items: [
            "Performance Intelligence — Team",
            "Neural fatigue og volatility samhengi",
            "GPS load monitoring — 7D acute, 28D chronic, ACWR",
            "Fjögurra lita ACWR litakerfi (lítið / kjörið / hækkað / hátt)",
            "Körfubolta GPS — Player Load, PL/min, IMA COD, IMA Accels/Decels, Max Velocity",
            "Mechanical Load Index (MLI) — 0–100 per leikmann, 28-daga normalized",
            "Metabolic Load Score — þreytugerð flokkun per session",
            "VALD kraftplata gögn í readiness score og injury risk",
            "CMJ freshness tracking — fresh / stale / missing baseline",
          ],
        },
        {
          name: "Decision Support",
          items: [
            "FULL / REDUCED / RECOVERY guidance",
            "Adaptive Training Engine stuðningur",
            "Útskýranleg player-state og match-week context rökfræði",
            "CMJ Required flag — neuromuscular, protocol dagur eða gömul gögn",
          ],
        },
        {
          name: "Workflow / Operations",
          items: [
            "Players needing review workflow",
            "Check-in og RPE reminders — tímasettir að æfingum",
            "CMJ push tilkynningar — sendar eftir check-in, engar tvítekningar",
            "Week setup, match samhengi og staff samhæfing",
            "Yesterday Load sóttur sjálfkrafa frá Catapult",
          ],
        },
      ],
    },
    testimonials: {
      title: "Byggt fyrir daglegar staff ákvarðanir",
      items: [
        { q: "Við vorum áður að eyða 20 mínútum fyrir æfingu í að finna út hverjir þurfa hvað. Núna tekur það tvær mínútur.", a: "Aðalþjálfari, Atvinnumannaliðs-klúbbur" },
        { q: "GPS ACWR yfirlitið sýnir mér samstundis hverjir eru underloaded þegar við förum inn í leikjavikuna.", a: "S&C þjálfari, Elite Akademía" },
        { q: "ATE hjálpar okkur að halda S&C skipulagningu samræmdri við samhengi dagsins.", a: "Strength & Conditioning þjálfari, Pro klúbbur" },
      ],
    },
    faq: {
      title: "Algengar spurningar",
      items: [
        { q: "Er þetta aðeins fyrir fótbolta?", a: "Nei. MicroPulse styður fjölbreytt liðasport, m.a. fótbolta, körfu, handbolta, blak og akademíur." },
        { q: "Hvernig hjálpar coach dashboardið staffi í daglegu starfi?", a: "Það hjálpar staffi að skanna hópinn, fara yfir flagged leikmenn, skilja liðsgreind og staðfesta dagsplan." },
        { q: "Hvernig virka FULL / REDUCED / RECOVERY ákvarðanir?", a: "MicroPulse sameinar dagleg inntök og samhengi í ráðlagða liðsaðgerð sem þjálfarar geta breytt, vistað og læst." },
        { q: "Hvað er Performance Intelligence — Team?", a: "Liðslag fyrir baseline, volatility, readiness mix, status snapshot og ráðleggingu dagsins." },
        { q: "Hvernig styður MicroPulse neural fatigue / neural load?", a: "Kerfið sýnir Team Neural Load trend, dominant fatigue samhengi og next-day risk svo staff geti brugðist fyrr við." },
        { q: "Getur staff vistað og læst ákvörðunum?", a: "Já. Þjálfarar geta staðfest lokaákvörðun dagsins með save og lock." },
        { q: "Styður MicroPulse leikjaviku rekstur?", a: "Já. Núverandi workflow styður Week setup, Match minutes, Messages, TV view og Yesterday Load — sótt sjálfkrafa frá Catapult." },
        { q: "Hvað er GPS Load Monitoring?", a: "Sérstakt liðsyfirlit sem sýnir 7-daga acute load, 28-daga chronic load og ACWR fyrir hvern leikmann frá Catapult, með raunverulegum rúllandi almanaksgluggum. ACWR litakerfi: blár (<0.8 of lítið álag), grænn (0.8–1.3 kjörið), gult (1.3–1.5 hækkað), rautt (>1.5 hátt)." },
        { q: "Styður MicroPulse körfubolta GPS mælingar?", a: "Já. Fyrir körfuboltaliðin sem nota Catapult (BMP/Vector T7) sýnir MicroPulse sjálfkrafa Player Load, Player Load á mínútu, IMA Changes of Direction, IMA Accelerations, IMA Decelerations, heildarvegalengd og Max Velocity. GPS flipinn skiptir sjálfkrafa yfir eftir íþrótt liðsins — engar handstillingar þarf. Fótboltaliðin eru óhrifin." },
        { q: "Hvað er Adaptive Training Engine (ATE)?", a: "ATE er deterministic ákvörðunarstuðningur fyrir styrktar- og þolþjálfun innan núverandi MicroPulse workflow." },
        { q: "Er ATE að taka yfir þjálfarann?", a: "Nei. ATE er stuðningur fyrir þjálfara og performance staff; lokaákvörðun er alltaf hjá staffi." },
        { q: "Hvernig styður ATE styrktar- og þolþjálfarateymi?", a: "Það hjálpar að breyta readiness og liðsamhengi í hagnýta, útskýranlega session guidance með betra samræmi milli daga." },
        { q: "Er MicroPulse tengt við VALD Performance tæki?", a: "Já. ForceDecks (CMJ / kraftplata), NordBoard (hamstring) og ForceFrame (isometric) samstillast við MicroPulse. Gögnin hafa bein áhrif á readiness score leiðréttingar og injury risk útreikninga." },
        { q: "Hvað er CMJ Required flaggið?", a: "Dagleg ábending sem segir staffi hvaða leikmenn ættu að gera countermovement jump próf fyrir æfingu — kveikt af neuromuscular flaggi, protocol degi (MD-2 eða MD+1), eða gömlum/vantandi CMJ baseline." },
        { q: "Hvernig virka CMJ push tilkynningar?", a: "Þegar leikmaður skilar inn check-in sendir MicroPulse honum push tilkynningu ef CMJ próf er þörf þann dag. Hún berst við seinni check-in raufina — um æfingatíma — svo leikmennirnir fái áminninguna þegar hún er gagnleg." },
        { q: "Hvernig virka check-in og RPE tilkynningar?", a: "Check-in áminningar berast 60 mínútum fyrir æfingu. RPE tilkynningar fara út eftir æfingu — tímasettar að raunverulegum æfingatíma, ekki fastri morguntíma. Allar tilkynningar nota push subscription leikmannsins." },
      ],
    },
    cta: {
      title: "Tilbúinn að keyra betri æfingardaga?",
      body: "Byrjaðu frítt og sjáðu hvernig MicroPulse breytir undirbúningi dagsins — eða bókaðu 20 mínútna demo og við förum með þér í gegnum kerfið.",
      start: "Byrja frítt — engar uppsetningar",
      demo: "Bóka 20 mín demo",
    },
    auth: { signIn: "Innskrá" },
    footer: "Performance intelligence og ákvörðunarstuðningur fyrir þjálfara-, performance- og medical teymi.",
    pricing: {
      title: "Veldu MicroPulse leiðina sem hentar teyminu þínu",
      sub: "MicroPulse skalar frá einföldu daglegu monitoring yfir í fullt performance intelligence fyrir þjálfara-, performance- og medical staff.",
      plans: [
        {
          name: "Free",
          bestFor: "Fyrir smærri lið, akademíur og þjálfara sem vilja prófa kerfið.",
          price: "€0 / month",
          summary: "Byrjaðu á daglegu monitoring og grunn yfirsýn.",
          features: [
            "Dagleg player check-in",
            "Grunn readiness score",
            "Player monitoring dashboard",
            "Einstaklingsstaða leikmanna",
            "Allt að 15 leikmenn",
            "Grunn monitoring insights",
          ],
          cta: "Byrja með Free",
          href: "/pricing",
        },
        {
          name: "Pro",
          bestFor: "Fyrir S&C, performance staff og eitt lið.",
          price: "€349 / month",
          priceLocal: "49.990 kr / mánuð",
          summary: "Keyrðu daglegan rekstur með skýrari readiness og session decision support.",
          features: [
            "Ótakmarkaður hópur",
            "Coach dashboard & liðsyfirsýn readiness",
            "Adaptive Training Engine",
            "Neural Fatigue Model",
            "GPS Load Monitoring — 7D / 28D / ACWR",
            "Vikuálag (Weekly GPS Load) — liðsyfirlit inni á GPS flipanum",
            "MD-dags samanburður (STEN 1–10) með smellanlegum drill-down",
            "Handvirk GPS skráning — varabúnaður þegar kubb vantar",
            "Körfubolta GPS — Player Load, PL/min, IMA COD, IMA Accels/Decels",
            "Mechanical Load Index (MLI) — hæðnun, hægðun, snúningur, PlayerLoad",
            "Metabolic Load Score — metabolic power, HML distance, þreytugerð",
            "GPS tenging",
            "Yesterday Load — sótt sjálfkrafa frá Catapult",
            "VALD / CMJ monitoring flipi",
            "CMJ Required tilkynningar — per leikmann með ástæðu",
            "VALD kraftplata gögn í readiness & risk scores",
            "Snjall push notifications — check-in, RPE & CMJ",
            "Leikjaviku rekstur",
            "Útskýranleg readiness decisions",
            "Team workflow tools",
          ],
          cta: "Bóka demo",
          href: "/pricing#demo",
          highlight: true,
        },
        {
          name: "Elite",
          bestFor: "Fyrir atvinnuklúbba, multi-team skipulag og leiðtogateymi.",
          price: "From €1250 / month",
          priceLocal: "149.990 kr / mánuð",
          summary: "Skalaðu performance intelligence yfir lið, deildir og stjórnendur.",
          features: [
            "Allt í Pro +",
            "Session Planning Benchmarks — μ ± 1σ bönd per MD-dag",
            "Performance Intelligence platform",
            "Injury risk modelling og load forecasting",
            "Neural + volatility intelligence",
            "Cross-team analytics og organization dashboards",
            "Executive reporting",
            "Margar gagnauppsprettur (GPS, VALD, internal load o.fl.)",
            "Automation og smart alerts",
            "Medical + performance oversight",
            "Sérsniðin innleiðing & forgangsþjónusta",
          ],
          cta: "Tala við okkur um Elite",
          href: "/pricing#demo",
        },
      ],
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
  const pricingPlans = React.useMemo(() => {
    if (lang !== "EN") return t.pricing.plans;
    return ORDERED_PLAN_DEFINITIONS.map((plan) => ({
      name: plan.displayName,
      bestFor:
        plan.key === "FREE"
          ? "Best for small teams and academies"
          : plan.key === "PRO"
            ? "Best for coaches and performance staff"
            : "Best for professional clubs and multi-team organizations",
      price: plan.monthlyPriceLabel,
      summary: getPlanSummary(plan.key),
      features:
        plan.key === "FREE"
          ? [
              "Daily player check-in",
              "Basic readiness score",
              "Player monitoring dashboard",
              "Individual player status",
              "Limited team size",
              "Basic monitoring insights",
            ]
          : plan.key === "PRO"
            ? [
                "Everything in Free plus:",
                "Coach dashboard & team readiness overview",
                "Adaptive Training Engine",
                "Neural Fatigue Model",
                "GPS Load Monitoring — 7D / 28D / ACWR",
                "Catapult integration — Yesterday Load auto-populated",
                "VALD / CMJ monitoring tab",
                "CMJ Required alerts — per player with reason",
                "VALD force plate data in readiness & risk scores",
                "Smart push notifications — check-in, RPE & CMJ",
                "Match-week operations",
                "Explainable readiness decisions",
                "Team workflow tools",
              ]
            : [
                "Everything in Pro plus:",
                "Performance Intelligence platform",
                "Injury risk modelling",
                "Load forecasting",
                "Neural + volatility intelligence",
                "Cross-team performance analytics",
                "Organization dashboards",
                "Executive reporting",
                "Automation and smart alerts",
                "Advanced integrations",
                "Medical + performance oversight",
                "Multi-team management",
              ],
      cta: plan.key === "FREE" ? "Start Free" : plan.key === "PRO" ? "Start Pro" : "Talk to us",
      href: plan.key === "FREE" ? "/pricing" : "/pricing#demo",
      highlight: Boolean(plan.highlighted),
    }));
  }, [lang, t.pricing.plans]);

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
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/85" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-white via-white/70 to-transparent" />
        </div>

        <header className="relative z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-emerald-500/90" />
              <span className="font-semibold tracking-tight text-white/95">MicroPulse</span>
            </div>

            <nav className="hidden items-center gap-6 text-sm text-white/80 md:flex">
              <a href="#how" className="hover:text-white">{t.nav.how}</a>
              <a href="#coach" className="hover:text-white">{t.nav.coach}</a>
              <a href="#intelligence" className="hover:text-white">{t.nav.intelligence}</a>
              <a href="#decisions" className="hover:text-white">{t.nav.decisions}</a>
              <a href="#ate" className="hover:text-white">{t.nav.ate}</a>
              <a href="#features" className="hover:text-white">{t.nav.features}</a>
              <a href="#faq" className="hover:text-white">{t.nav.faq}</a>
              <Link href="/pricing" className="hover:text-white">{t.nav.pricing}</Link>
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

              <Link href="/login" className="hidden rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 md:block">
                {t.auth.signIn}
              </Link>
              <Link href="/pricing" className="hidden rounded-xl bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 md:block">
                {t.nav.cta}
              </Link>

              {/* Hamburger — mobile only */}
              <button
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/5 text-white md:hidden"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                  { href: "#coach", label: t.nav.coach },
                  { href: "#intelligence", label: t.nav.intelligence },
                  { href: "#decisions", label: t.nav.decisions },
                  { href: "#ate", label: t.nav.ate },
                  { href: "#features", label: t.nav.features },
                  { href: "#faq", label: t.nav.faq },
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
                <div className="mt-2 flex gap-2 border-t border-white/10 pt-3">
                  <Link href="/login" className="flex-1 rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-center text-sm text-white transition hover:bg-white/10">
                    {t.auth.signIn}
                  </Link>
                  <Link href="/pricing" className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-center text-sm text-white transition hover:bg-blue-700">
                    {t.nav.cta}
                  </Link>
                </div>
              </nav>
            </div>
          )}
        </header>

        <div className="relative z-10">
          <div className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pb-24 md:pt-14">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">{t.hero.title}</h1>
                <p className="mt-5 max-w-2xl text-white/85 md:text-lg">{t.hero.sub}</p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/login" className="rounded-2xl bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700">
                    {t.hero.primary}
                  </Link>
                  <Link href="/pricing#demo" className="rounded-2xl border border-white/25 bg-white/5 px-6 py-3 text-white transition hover:bg-white/10">
                    {t.hero.secondary}
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap gap-2 text-xs text-white/70">
                  {t.hero.chips.map((chip) => (
                    <span key={chip} className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">
                      {chip}
                    </span>
                  ))}
                </div>

                <div className="mt-8 text-xs tracking-[0.18em] text-white/60">
                  {(lang === "EN" ? MICROPULSE_PRODUCT_IDENTITY.category : t.hero.trust).toUpperCase()}
                </div>
              </div>

              <div className="mx-auto w-full max-w-xl space-y-3">
                <div className="rounded-3xl bg-white/95 p-5 shadow-[0_35px_80px_rgba(0,0,0,0.38)] ring-1 ring-black/10">
                  <div className="text-sm font-semibold text-neutral-900">{t.panel.title}</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[t.panel.risk, t.panel.action, t.panel.review, t.panel.players].map((line) => (
                      <div key={line} className="rounded-2xl border bg-white p-3 text-sm font-medium text-neutral-800">
                        {line}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t.panel.recommendation}</div>
                </div>

                <div className="rounded-3xl border bg-neutral-50 p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t.panel.piTitle}</div>
                  <div className="mt-2 space-y-1.5 text-sm text-neutral-700">
                    <div>{t.panel.baseline}</div>
                    <div>{t.panel.volatility}</div>
                    <div>{t.panel.mix}</div>
                    <div>{t.panel.fatigue}</div>
                    <div>{t.panel.neural}</div>
                    <div>{t.panel.nextRisk}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                  {t.panel.cmj}
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  {t.panel.ate}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="border-t bg-neutral-50 py-16">
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
          <h2 className="text-2xl font-semibold md:text-3xl">{t.coach.title}</h2>
          <p className="mt-3 max-w-3xl text-sm text-neutral-600">{t.coach.sub}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {t.coach.cards.map((card) => (
              <div key={card.t} className="rounded-3xl border bg-white p-6 shadow-sm">
                <div className="text-sm font-semibold">{card.t}</div>
                <div className="mt-2 text-sm text-neutral-600">{card.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product preview – Today Command Center screenshot ── */}
      <section id="product-preview" className="border-t bg-neutral-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold md:text-3xl">
              {lang === "IS" ? "Sjáðu MicroPulse í notkun" : "See MicroPulse in action"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">
              {lang === "IS"
                ? "Þetta er raunverulegt borð — eitt yfirlit sem gefur þjálfarateymi heildarstöðu liðsins, ráðleggingu dagsins og allar viðbragðsaðgerðir á einum stað."
                : "This is the real dashboard — one view that gives your coaching staff today's team status, the recommended action, and every flagged player — before training begins."}
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl ring-1 ring-neutral-100">
            <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3">
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                Today Command Center
              </span>
              <span className="text-xs text-neutral-400">
                {lang === "IS" ? "Dagleg ákvarðanataka þjálfara" : "Daily coaching decision hub"}
              </span>
            </div>
            <Image
              src="/screenshots/today.png"
              alt={lang === "IS" ? "MicroPulse dagleg stjórnborðsyfirlit" : "MicroPulse Today Command Center dashboard"}
              width={1200}
              height={741}
              className="w-full h-auto"
              unoptimized
            />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(lang === "IS" ? [
              { label: "Áhættustig & liðsaðgerð", desc: "Risk level og ráðlögð aðgerð (FULL / REDUCED / RECOVERY) — útskýrð og tilbúin til staðfestingar." },
              { label: "Dominant fatigue & neural load", desc: "Hvaða þreytugerð ræður ríkjum í dag og hvort neural load er að hækka." },
              { label: "Needs review", desc: "Leikmenn sem þarfnast sérstakrar athygli — flaggaðir sjálfkrafa eftir readiness, GPS eða CMJ." },
              { label: "Coach Recommendation", desc: "Skýr, útskýranleg tillaga — hvernig á að nálgast þjálfunina í dag fyrir liðið í heild." },
            ] : [
              { label: "Risk level & team action", desc: "Today's risk level and recommended action (FULL / REDUCED / RECOVERY) — explained and ready to confirm." },
              { label: "Dominant fatigue & neural load", desc: "Which fatigue pattern is driving the squad today and whether neural load is trending up." },
              { label: "Needs review", desc: "Players flagged for attention — automatically surfaced from readiness, GPS load, or CMJ data." },
              { label: "Coach recommendation", desc: "A clear, explainable suggestion for how to approach today's session across the full squad." },
            ]).map((item) => (
              <div key={item.label} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-neutral-900">{item.label}</div>
                <div className="mt-1.5 text-sm text-neutral-500">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="intelligence" className="border-t bg-neutral-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold md:text-3xl">{t.intelligence.title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600">{t.intelligence.sub}</p>

          <div className="mt-8 overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-xl ring-1 ring-neutral-100">
            <div className="border-b border-neutral-100 px-4 py-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                Performance Intelligence — Team
              </span>
            </div>
            <Image
              src="/screenshots/intelligence.png"
              alt={lang === "IS" ? "Performance Intelligence yfirlit" : "Performance Intelligence overview"}
              width={1200}
              height={666}
              className="w-full h-auto"
              unoptimized
            />
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {t.intelligence.chips.map((chip) => (
              <span key={chip} className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm">
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {t.intelligence.items.map((item) => (
              <div key={item.t} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-neutral-900">{item.t}</div>
                <div className="mt-1 text-sm text-neutral-500">{item.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="decisions" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold md:text-3xl">{t.decisions.title}</h2>
          <p className="mt-3 max-w-3xl text-sm text-neutral-600">{t.decisions.sub}</p>

          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            <div>
              <div className="grid gap-3">
                {t.decisions.actions.map((item) => (
                  <div key={item} className="rounded-2xl border bg-white p-4 text-sm text-neutral-700 shadow-sm">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-neutral-900">{t.decisions.scenariosTitle}</div>
              <div className="mt-3 space-y-3">
                {t.decisions.scenarios.map((scenario) => (
                  <div key={scenario.t} className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="text-sm font-semibold">{scenario.t}</div>
                    <div className="mt-1.5 text-sm text-neutral-600">{scenario.d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="ate" className="border-t bg-neutral-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold md:text-3xl">{t.ate.title}</h2>
          <p className="mt-3 max-w-3xl text-sm text-neutral-600">{t.ate.sub}</p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {t.ate.cards.map((card) => (
              <div key={card.t} className="rounded-3xl border bg-white p-6 shadow-sm">
                <div className="text-sm font-semibold">{card.t}</div>
                <div className="mt-2 text-sm text-neutral-600">{card.d}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{t.ate.note}</div>
        </div>
      </section>

      {/* ── Dashboard showcase – GPS, MLI, VALD/CMJ screenshots ── */}
      <section id="dashboard-views" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold md:text-3xl">
            {lang === "IS" ? "Allt á einum stað" : "Everything in one place"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-neutral-600">
            {lang === "IS"
              ? "GPS hleðslugreining og Vélrænn þyngdarstuðull — samþættar í eitt samkvæmt borð."
              : "GPS load analytics and Mechanical Load Index — integrated into one coherent dashboard."}
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div>
              <div className="overflow-hidden rounded-2xl border shadow-md ring-1 ring-neutral-200">
                <Image
                  src="/screenshots/gps.png"
                  alt={lang === "IS" ? "GPS gögn og ACWR hlutfall per leikmann" : "GPS squad load data with ACWR ratios"}
                  width={1200}
                  height={783}
                  className="w-full h-auto"
                  unoptimized
                />
              </div>
              <p className="mt-2 text-center text-xs font-medium text-neutral-500">
                {lang === "IS" ? "GPS gögn — liðshleðsla" : "GPS Data — Squad Load"}
              </p>
            </div>
            <div>
              <div className="overflow-hidden rounded-2xl border shadow-md ring-1 ring-neutral-200">
                <Image
                  src="/screenshots/mli.png"
                  alt={lang === "IS" ? "Vélrænn þyngdarstuðull (MLI) per leikmann" : "Mechanical Load Index per player"}
                  width={1200}
                  height={499}
                  className="w-full h-auto"
                  unoptimized
                />
              </div>
              <p className="mt-2 text-center text-xs font-medium text-neutral-500">
                {lang === "IS" ? "Vélrænn þyngdarstuðull (MLI)" : "Mechanical Load Index (MLI)"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold md:text-3xl">{t.features.title}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {t.features.groups.map((group) => (
              <div key={group.name} className="rounded-3xl border bg-white p-6 shadow-sm">
                <div className="text-sm font-semibold text-neutral-900">{group.name}</div>
                <div className="mt-4 space-y-2">
                  {group.items.map((item) => (
                    <div key={item} className="rounded-2xl border bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold md:text-3xl">{t.pricing.title}</h2>
          <p className="mt-3 max-w-3xl text-sm text-neutral-600">{t.pricing.sub}</p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={cx(
                  "relative rounded-3xl border p-6 shadow-sm",
                  plan.highlight ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white text-neutral-900"
                )}
              >
                {plan.highlight ? (
                  <div className="absolute -top-3 left-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">Most popular</div>
                ) : null}
                <div className="text-sm font-semibold">{plan.name}</div>
                <div className="mt-2 text-3xl font-semibold">{plan.price}</div>
                {"priceLocal" in plan && (plan as {priceLocal?: string}).priceLocal ? (
                  <div className={cx("mt-0.5 text-xs", plan.highlight ? "text-white/60" : "text-neutral-400")}>
                    {(plan as {priceLocal?: string}).priceLocal}
                  </div>
                ) : null}
                <div className={cx("mt-3 text-sm", plan.highlight ? "text-white/80" : "text-neutral-600")}>{plan.bestFor}</div>
                <div className={cx("mt-3 text-sm", plan.highlight ? "text-white/90" : "text-neutral-700")}>{plan.summary}</div>
                <div className="mt-5 space-y-2">
                  {plan.features.map((feature) => (
                    <div
                      key={feature}
                      className={cx(
                        "rounded-2xl px-3 py-2 text-sm",
                        plan.highlight ? "bg-white/10 text-white" : "border bg-neutral-50 text-neutral-700"
                      )}
                    >
                      {feature}
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <Link
                    href={plan.href}
                    className={cx(
                      "block rounded-2xl px-4 py-3 text-center text-sm transition",
                      plan.highlight ? "bg-blue-600 text-white hover:bg-blue-700" : "border bg-white hover:bg-neutral-50"
                    )}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
            <span className="mt-0.5 text-base">🏀</span>
            <div>
              <span className="font-semibold">{lang === "IS" ? "Innanhúss íþróttir (körfubolti, handbolti, blak):" : "Indoor sports (basketball, handball, volleyball):"}</span>
              {" "}
              {lang === "IS"
                ? "GPS monitoring á ekki við innanhúss. Pro Innanhúss er €279/mánuð — sama platform, án GPS. Sjá nánar á verðskrá."
                : "GPS monitoring doesn't apply indoors. Pro Indoor is €279/month — same platform, without GPS. See full details on the pricing page."}
              {" "}
              <Link href="/pricing" className="font-semibold underline hover:text-emerald-700">
                {lang === "IS" ? "Skoða verðskrá →" : "View pricing →"}
              </Link>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border bg-neutral-50 p-6 text-center">
            <div className="text-lg font-semibold text-neutral-900">
              {lang === "IS" ? "Ertu ekki viss hvaða leið hentar teyminu?" : "Not sure which plan fits your team?"}
            </div>
            <div className="mt-2 text-sm text-neutral-600">
              {lang === "IS"
                ? "Byrjaðu frítt eða talaðu við okkur um hvernig MicroPulse getur stutt staff og leikmenn í daglegum rekstri."
                : "Start with Free or talk to us about how MicroPulse can support your performance staff and athletes."}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link href="/pricing" className="rounded-2xl border bg-white px-5 py-2.5 text-sm text-neutral-900 transition hover:bg-neutral-100">
                {lang === "IS" ? "Byrja með Free" : "Start Free"}
              </Link>
              <Link href="/pricing#demo" className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm text-white transition hover:bg-blue-700">
                {lang === "IS" ? "Bóka Demo" : "Book a Demo"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t bg-neutral-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold md:text-3xl">{t.testimonials.title}</h2>
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
          <h2 className="text-2xl font-semibold md:text-3xl">{t.faq.title}</h2>
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

      <section id="cta" className="border-t bg-neutral-50 py-16">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">{t.cta.title}</h2>
          <p className="mx-auto mt-4 max-w-3xl text-sm text-neutral-600 md:text-base">{t.cta.body}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login" className="rounded-2xl bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700">
              {t.cta.start}
            </Link>
            <Link href="/pricing#demo" className="rounded-2xl border bg-white px-6 py-3 text-neutral-900 transition hover:bg-neutral-100">
              {t.cta.demo}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t py-10 text-center text-xs text-neutral-500">© {new Date().getFullYear()} MicroPulse • {t.footer}</footer>
    </main>
  );
}
