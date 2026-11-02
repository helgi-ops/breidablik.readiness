/**
 * The one decision at the top of the PT client's Today screen.
 *
 * Rule-based and pure: it folds the signals that used to be separate banners
 * (match day, taper, readiness, deload, load) into a single verdict, stated once.
 * The first matching rule wins. With check-in off there is no readiness, so the
 * verdict rests on training load instead. This never changes the session — it
 * only says what the session already is.
 */

export type DecisionTone = "good" | "warn" | "bad" | "neutral";
type Bi = { EN: string; IS: string };

export type TodayDecision = {
  /** Small status line above the headline; null = none (e.g. rest day). */
  label: Bi | null;
  headline: Bi;
  why: Bi;
  tone: DecisionTone;
  /** Foster deload verdict — carries its citation on screen. */
  fosterCited?: boolean;
  /** Check-in comes before the verdict. */
  needsCheckin?: boolean;
};

export type DecisionInput = {
  checkinOn: boolean;
  checkedIn: boolean;
  session: {
    restDay: boolean;
    matchDay: boolean;
    daysToGame: number | null;
    readiness: {
      applied: boolean;
      zone: "green" | "yellow" | "red";
      volumePct: number;
      intensityPct: number;
      action: "normal" | "deload" | "recovery" | "skip";
    } | null;
  } | null;
  fosterStatus: "ok" | "watch" | "deload_recommended" | "deload_required";
  fosterReason: string;
  /** Last 7 days vs last 28 (sRPE ACWR). */
  loadRatio: number | null;
};

const round1 = (n: number) => n.toFixed(1);

export function decideToday(i: DecisionInput): TodayDecision {
  const s = i.session;

  if (!s) {
    return {
      label: null,
      headline: { EN: "No session planned", IS: "Engin æfing á dagskrá" },
      why: { EN: "Nothing is prescribed today. Log your own workout if you train.", IS: "Ekkert er fyrirskrifað í dag. Skráðu þína eigin æfingu ef þú æfir." },
      tone: "neutral",
    };
  }

  if (s.matchDay) {
    return {
      label: { EN: "Match day", IS: "Leikdagur" },
      headline: { EN: "No gym today", IS: "Engin lyftingaæfing í dag" },
      why: { EN: "Keep fresh for the game.", IS: "Haltu þér ferskum fyrir leikinn." },
      tone: "good",
    };
  }

  if (s.restDay) {
    return {
      label: null,
      headline: { EN: "Rest day", IS: "Hvíldardagur" },
      why: { EN: "Take it easy today. Recovery is part of the work.", IS: "Hvíldu vel í dag. Endurheimt er hluti af æfingunni." },
      tone: "neutral",
    };
  }

  if (i.checkinOn && !i.checkedIn) {
    return {
      label: { EN: "Check-in needed", IS: "Check-in vantar" },
      headline: { EN: "Check in first", IS: "Byrjaðu á check-in" },
      why: { EN: "Log sleep, fatigue and soreness so today's session fits how you feel.", IS: "Skráðu svefn, þreytu og bólgu svo æfing dagsins passi við líðan þína." },
      tone: "neutral",
      needsCheckin: true,
    };
  }

  const rd = i.checkinOn ? s.readiness : null;
  if (rd && (rd.action === "recovery" || rd.action === "skip")) {
    return {
      label: { EN: "Recovery", IS: "Hvíld" },
      headline: { EN: "Recovery day", IS: "Endurheimtardagur" },
      why: { EN: "You're not at your best today. Skip the heavy work and keep it light.", IS: "Þú ert ekki í toppstandi í dag. Slepptu þungu og haltu því léttu." },
      tone: "bad",
    };
  }
  if (rd?.applied) {
    const volCut = 100 - rd.volumePct;
    const intCut = 100 - rd.intensityPct;
    const en = [volCut > 0 ? `${volCut}% less volume` : null, intCut > 0 ? `${intCut}% less weight` : null].filter(Boolean).join(" and ");
    const is = [volCut > 0 ? `${volCut}% minna magn` : null, intCut > 0 ? `${intCut}% minni þyngd` : null].filter(Boolean).join(" og ");
    return {
      label: { EN: "Caution", IS: "Gát" },
      headline: { EN: "Lighter session today", IS: "Léttari æfing í dag" },
      why: {
        EN: `Adjusted to how you feel: ${en}, so you keep good quality.`,
        IS: `Stillt eftir líðan: ${is}, svo þú haldir góðum gæðum.`,
      },
      tone: rd.zone === "red" ? "bad" : "warn",
    };
  }

  if (i.fosterStatus === "deload_required" || i.fosterStatus === "deload_recommended") {
    const required = i.fosterStatus === "deload_required";
    return {
      label: { EN: "Load high", IS: "Mikið álag" },
      headline: required
        ? { EN: "Deload needed", IS: "Deload nauðsynlegt" }
        : { EN: "Deload recommended", IS: "Mælt með deload" },
      why: { EN: i.fosterReason, IS: i.fosterReason },
      tone: required ? "bad" : "warn",
      fosterCited: true,
    };
  }

  if (s.daysToGame === 1 || s.daysToGame === 2) {
    return {
      label: s.daysToGame === 1
        ? { EN: "Game tomorrow", IS: "Leikur á morgun" }
        : { EN: "2 days to game", IS: "2 dagar í leik" },
      headline: { EN: "Lighter session today", IS: "Léttari æfing í dag" },
      why: { EN: "Reduced volume to stay fresh.", IS: "Minna magn til að halda ferskleika." },
      tone: "good",
    };
  }

  const r = i.loadRatio;
  const ready = rd?.zone === "green";
  const label = (en: string, is: string): Bi => ready ? { EN: "Ready", IS: "Tilbúinn" } : { EN: en, IS: is };

  if (r != null && r > 1.5) {
    return {
      label: { EN: "Load too high", IS: "Of mikið álag" },
      headline: { EN: "Stick to the plan", IS: "Haltu þig við áætlunina" },
      why: {
        EN: `You've trained ${round1(r)} times your normal week. Don't add anything extra.`,
        IS: `Þú hefur æft ${round1(r).replace(".", ",")} sinnum venjulega viku. Ekki bæta neinu við.`,
      },
      tone: "bad",
    };
  }
  if (r != null && r > 1.3) {
    return {
      label: { EN: "Load rising", IS: "Álag hækkar" },
      headline: { EN: "Stick to the plan", IS: "Haltu þig við áætlunina" },
      why: {
        EN: `You've trained ${round1(r)} times your normal week. Don't add anything extra.`,
        IS: `Þú hefur æft ${round1(r).replace(".", ",")} sinnum venjulega viku. Ekki bæta neinu við.`,
      },
      tone: "warn",
    };
  }
  if (r != null && r < 0.8) {
    return {
      label: label("Load below normal", "Álag undir venjulegu"),
      headline: { EN: "Full session today", IS: "Full æfing í dag" },
      why: { EN: "You've trained less than normal this week. Today gets you back on track.", IS: "Þú hefur æft minna en venjulega í vikunni. Æfingin í dag kemur þér aftur á rétta leið." },
      tone: ready ? "good" : "neutral",
    };
  }
  if (r != null) {
    return {
      label: label("Load steady", "Álag stöðugt"),
      headline: { EN: "Full session today", IS: "Full æfing í dag" },
      why: { EN: "Your training this week matches your normal week. Follow the plan as written.", IS: "Æfingarnar í vikunni passa við venjulega viku hjá þér. Fylgdu áætluninni." },
      tone: "good",
    };
  }
  return {
    label: ready ? { EN: "Ready", IS: "Tilbúinn" } : null,
    headline: { EN: "Full session today", IS: "Full æfing í dag" },
    why: { EN: "Follow the plan as written.", IS: "Fylgdu áætluninni." },
    tone: ready ? "good" : "neutral",
  };
}
