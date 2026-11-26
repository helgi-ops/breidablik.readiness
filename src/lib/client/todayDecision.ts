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
  /** The technical reason behind a plain-language verdict (shown behind "Show details"). */
  detail?: string;
  /** Check-in comes before the verdict. */
  needsCheckin?: boolean;
};

export type DecisionInput = {
  checkinOn: boolean;
  checkedIn: boolean;
  /** A plan that hasn't started yet (starter assignment or the trainer's own plan). */
  upcoming?: { startDate: string; daysUntil: number } | null;
  /** The starter programme has run its full length. */
  completed?: boolean;
  session: {
    restDay: boolean;
    /** ISO weekday (1=Mon..7=Sun) of the next session, on a rest day. */
    nextSessionWeekday?: number | null;
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

const WEEKDAY_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_IS = ["Mánudagur", "Þriðjudagur", "Miðvikudagur", "Fimmtudagur", "Föstudagur", "Laugardagur", "Sunnudagur"];
/** "á mánudag" — the form used after "á" in a sentence. */
const WEEKDAY_IS_ON = ["mánudag", "þriðjudag", "miðvikudag", "fimmtudag", "föstudag", "laugardag", "sunnudag"];

/** Localised weekday name from an ISO index (1=Mon..7=Sun). */
export function weekdayName(iso: number, lang: string): string {
  return (lang === "IS" ? WEEKDAY_IS : WEEKDAY_EN)[iso - 1] ?? "";
}

function isoWeekdayOf(dateIso: string): number {
  const d = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** "Monday" / "á mánudag" within a week, else the date ("4 December" / "4. desember"). */
function whenStarts(startDate: string, daysUntil: number): Bi {
  if (daysUntil <= 1) return { EN: "tomorrow", IS: "á morgun" };
  if (daysUntil <= 6) {
    const wd = isoWeekdayOf(startDate);
    return { EN: `on ${WEEKDAY_EN[wd - 1]}`, IS: `á ${WEEKDAY_IS_ON[wd - 1]}` };
  }
  const d = new Date(`${startDate}T00:00:00Z`);
  const fmt = (loc: string) => {
    try { return d.toLocaleDateString(loc, { day: "numeric", month: "long", timeZone: "UTC" }); }
    catch { return startDate; }
  };
  return { EN: `on ${fmt("en-GB")}`, IS: `${fmt("is-IS")}` };
}

export function decideToday(i: DecisionInput): TodayDecision {
  const s = i.session;

  if (i.upcoming) {
    const when = whenStarts(i.upcoming.startDate, i.upcoming.daysUntil);
    return {
      label: null,
      headline: { EN: `Your plan starts ${when.EN}`, IS: `Áætlunin byrjar ${when.IS}` },
      why: {
        EN: "Your trainer has set it up. Your first session will show here that day.",
        IS: "Þjálfarinn þinn hefur sett hana upp. Fyrsta æfingin birtist hér þann dag.",
      },
      tone: "neutral",
    };
  }

  if (i.completed) {
    return {
      label: null,
      headline: { EN: "Programme finished", IS: "Áætluninni er lokið" },
      why: {
        EN: "Well done. Your trainer will set up what comes next. Log your own workout meanwhile if you train.",
        IS: "Vel gert. Þjálfarinn þinn setur upp næsta skref. Skráðu þína eigin æfingu á meðan ef þú æfir.",
      },
      tone: "good",
    };
  }

  if (!s) {
    return {
      label: null,
      headline: { EN: "Your trainer is setting up your plan", IS: "Þjálfarinn þinn er að setja upp áætlunina" },
      why: {
        EN: "Your sessions will show here as soon as it's ready. Log your own workout meanwhile if you train.",
        IS: "Æfingarnar birtast hér um leið og hún er tilbúin. Skráðu þína eigin æfingu á meðan ef þú æfir.",
      },
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
    const wd = s.nextSessionWeekday ?? null;
    const next: Bi = wd
      ? { EN: ` Next session: ${WEEKDAY_EN[wd - 1]}.`, IS: ` Næsta æfing er á ${WEEKDAY_IS_ON[wd - 1]}.` }
      : { EN: "", IS: "" };
    return {
      label: null,
      headline: { EN: "Rest day", IS: "Hvíldardagur" },
      why: {
        EN: `Take it easy today. Recovery is part of the work.${next.EN}`,
        IS: `Hvíldu vel í dag. Endurheimt er hluti af æfingunni.${next.IS}`,
      },
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
        ? { EN: "Take a lighter week", IS: "Taktu léttari viku" }
        : { EN: "A lighter few days will help", IS: "Léttari dagar myndu hjálpa" },
      why: required
        ? {
            EN: "Your last 7 days were hard and almost the same every day. Do fewer sets this week and keep the technique sharp.",
            IS: "Síðustu 7 dagar voru erfiðir og nánast eins á hverjum degi. Gerðu færri sett í vikunni og haltu tækninni góðri.",
          }
        : {
            EN: "Your last 7 days were hard with little variation. Ease off a little so you keep making progress.",
            IS: "Síðustu 7 dagar voru erfiðir og lítil tilbreyting. Slakaðu aðeins á svo framfarirnar haldi áfram.",
          },
      tone: required ? "bad" : "warn",
      fosterCited: true,
      detail: i.fosterReason,
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
