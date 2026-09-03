/**
 * Contextualised peak period (fusion flagship #2) — pure, IO-free ENGINE.
 *
 * Answers Ju et al. (2022)'s question: in a player's most intense 1/3/5-min window, WHAT was he
 * doing tactically (Run in Behind, Support Play, Move to Receive, Run with Ball, Recovery Run,
 * Covering)? It fuses the physical peak window (GPS/IMA, "how much / how hard") with the
 * time-stamped tactical events in that same window ("what") — the thing siloed systems can't do.
 *
 * This file is the feed-AGNOSTIC core: it takes a NORMALISED event stream (whatever provider,
 * mapped to MatchEvent) + a peak window with a clock position, aligns the events to the window,
 * classifies each into a Ju tactical action, and returns the layered read. It is deliberately
 * decoupled from ingestion: when the two feeds land (see peak-period-context-spec.md) — a
 * time-stamped event export → MatchEvent, and a peak-window START time from Catapult (custom
 * period / raw GPS) — this engine lights up unchanged.
 *
 * HONEST SCOPE: event feeds capture ON-BALL actions well (passes, carries, receptions, dribbles)
 * and only some off-ball (pressures, recoveries). Ju's off-ball majority (Recovery Run, Covering)
 * was video/tracking-coded and is NOT fully recoverable from event data — the read labels the
 * off-ball share as "needs tracking", never invents it. Descriptive/advisory — never touches the
 * readiness colour or the daily decision.
 *
 * Cite: Ju W et al. 2022, Contextualised peak periods of play in the EPL, Biol Sport 39(4):973-983.
 */

export type Bi = { en: string; is: string };
export type Confidence = "high" | "medium" | "low";

/**
 * Ju 2022 tactical-action taxonomy for the peak window (on-ball + off-ball).
 *
 * SHIPPING these 8 (all honestly derivable from the Wyscout SportsCode event LABELS we have).
 * FUTURE — Ju's remaining 4 need pitch x,y or off-ball tracking (SportsCode has neither), so
 * they are deliberately NOT here until such a feed lands (StatsBomb events w/ coordinates, or
 * SkillCorner / Second Spectrum / Catapult Vision tracking): "push_up_pitch", "break_into_box",
 * "over_underlap", "close_down_press". Add them to this enum + ACTION_LABEL + IS_OFF_BALL +
 * classifyEventAction + the PeakContextBars palette/order when the coordinate feed exists.
 * Never synthesise them from label-only data. See the peak-period-context memory.
 */
export type TacticalAction =
  | "run_in_behind"     // penetrating run received/carried in behind the line
  | "move_to_receive"   // reception to exploit space (to feet / into space)
  | "support_play"      // linking pass / short combination
  | "run_with_ball"     // carry / dribble at speed
  | "interception"      // on-ball: cut out a pass (Ju lists this separately from recovery run)
  | "recovery_run"      // off-ball recovery (tracking-coded — approx. from defensive events)
  | "covering"          // off-ball covering (tracking-coded — approx.)
  | "other";

export const ACTION_LABEL: Record<TacticalAction, Bi> = {
  run_in_behind: { en: "Run in behind / penetrate", is: "Hlaup á bak við / gegnumbrot" },
  move_to_receive: { en: "Move to receive / exploit space", is: "Færsla til að taka við / nýta rými" },
  support_play: { en: "Support play (link)", is: "Stuðningsspil (tenging)" },
  run_with_ball: { en: "Run with ball", is: "Hlaup með bolta" },
  interception: { en: "Interception", is: "Sending stöðvuð" },
  recovery_run: { en: "Recovery run", is: "Endurheimtar-hlaup" },
  covering: { en: "Covering", is: "Skjólun" },
  other: { en: "Other", is: "Annað" },
};

/** Whether an action is on-ball (event-derivable) or off-ball (needs tracking data). */
export const IS_OFF_BALL: Record<TacticalAction, boolean> = {
  run_in_behind: false, move_to_receive: false, support_play: false, run_with_ball: false,
  interception: false, recovery_run: true, covering: true, other: false,
};

/**
 * A normalised match event. The ingester maps a provider (StatsBomb / InStat / FIBA) onto this
 * shape; the engine never sees provider specifics. `tSec` = seconds from the START of the match
 * (kickoff of period 1), the single clock the peak window is also expressed in.
 */
export type MatchEvent = {
  tSec: number;                 // absolute seconds from match start (the alignment clock)
  type: string;                 // provider event type, lowercased (e.g. "pass", "carry", "dribble")
  subjectIsActor: boolean;      // the peak-window player is the one performing the event
  ownPossession: boolean;       // his team is in possession at the event
  x: number | null;             // pitch x, 0-100 (own goal 0 → opp goal 100), attacking direction
  forward: boolean | null;      // the action progresses toward the opponent goal
  outcomeSuccess: boolean | null;
  obv: number | null;           // on-ball value of the event, if the feed carries it
};

/** A peak window with its clock position (the GPS-side feed must supply startSec/endSec). */
export type PeakWindow = {
  windowMin: number;            // 1 / 3 / 5
  startSec: number;             // seconds from match start
  endSec: number;
  metric: string;               // "distance" | "hsr" | "player_load" …
  value: number | null;         // the peak rate (m/min, AU/min …)
};

export type ActionShare = { action: TacticalAction; label: Bi; count: number; share: number; obv: number | null; offBall: boolean };

export type PeakContextRead = {
  window: PeakWindow | null;
  hasEvents: boolean;
  events: number;               // aligned event count in the window
  onBallEvents: number;
  actions: ActionShare[];       // sorted by count desc — the stacked-bar model
  verdict: Bi;
  facts: Bi[];
  offBallNote: Bi;              // the honest tracking-data gap
  confidence: Confidence;
  citation: string;
  caveat: Bi;
};

export const CITATION =
  "Ju W et al. 2022, Contextualised peak periods of play in the EPL, Biol Sport 39(4):973-983";

const CAVEAT: Bi = {
  en: "The tactical actions in a player's peak-intensity window, from time-aligned events. Event feeds capture ON-BALL actions (passes, carries, receptions, dribbles) and only some off-ball; Ju's off-ball majority (Recovery Run, Covering) was tracking-coded and is not fully recoverable from events — it is labelled as needing tracking, never invented. Descriptive context — it never changes the readiness verdict or the daily plan.",
  is: "Taktísku aðgerðirnar í hámarks-ákefðar glugga leikmanns, úr tíma-samstilltum atburðum. Atburða-straumar ná ON-BALL aðgerðum (sendingar, rekstur, móttökur, framhjáhlaup) og aðeins hluta off-ball; off-ball meirihluti Ju (endurheimtar-hlaup, skjólun) var tracking-kóðaður og næst ekki að fullu úr atburðum — hann er merktur sem þarfnast tracking, aldrei skáldaður. Lýsandi samhengi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

/** Events whose absolute clock falls inside the window [startSec, endSec]. */
export function alignEventsToWindow(events: MatchEvent[], window: PeakWindow): MatchEvent[] {
  return events.filter((e) => Number.isFinite(e.tSec) && e.tSec >= window.startSec && e.tSec <= window.endSec);
}

/**
 * Classify one event into a Ju tactical action. On-ball actions only are derivable from events;
 * the classifier is conservative (returns "other" when it can't tell) rather than guessing.
 */
export function classifyEventAction(e: MatchEvent): TacticalAction {
  const t = (e.type ?? "").toLowerCase();
  const attackingThird = e.x != null && e.x >= 66;
  if (e.subjectIsActor && e.ownPossession) {
    if (/dribble|carry|accel|sprint/.test(t)) return e.forward && attackingThird ? "run_in_behind" : "run_with_ball";
    if (/reception|ball\s*receipt|receive/.test(t)) return e.forward && attackingThird ? "run_in_behind" : "move_to_receive";
    if (/pass|cross/.test(t)) return "support_play"; // a cross is on-ball distribution / delivery
    if (/shot/.test(t)) return "run_in_behind"; // arriving to finish a penetration
  }
  // Off-ball defensive events are a partial proxy for recovery/covering (still labelled off-ball).
  if (e.subjectIsActor && !e.ownPossession) {
    if (/intercept/.test(t)) return "interception"; // cutting out a pass — Ju's own category
    if (/recovery|tackle/.test(t)) return "recovery_run";
    if (/pressure|block|clearance|duel/.test(t)) return "covering"; // a defensive duel = a covering/pressing contest
  }
  return "other";
}

export function computePeakPeriodContext(windows: PeakWindow[], events: MatchEvent[]): PeakContextRead {
  // Pick the shortest (most intense) window that has a clock position — the 1-min peak.
  const withClock = windows.filter((w) => Number.isFinite(w.startSec) && Number.isFinite(w.endSec) && w.endSec > w.startSec);
  const window = withClock.sort((a, b) => a.windowMin - b.windowMin)[0] ?? null;

  const base: PeakContextRead = {
    window, hasEvents: false, events: 0, onBallEvents: 0, actions: [],
    verdict: { en: "", is: "" }, facts: [], offBallNote: { en: "", is: "" },
    confidence: "low", citation: CITATION, caveat: CAVEAT,
  };

  if (!window) {
    return { ...base,
      verdict: { en: "No peak-window clock position yet — needs the peak-window start time (Catapult custom period / raw GPS).", is: "Engin klukku-staðsetning hámarksglugga enn — þarf upphafstíma gluggans (Catapult sérsniðið tímabil / hrá GPS)." } };
  }

  const aligned = alignEventsToWindow(events, window);
  if (aligned.length === 0) {
    return { ...base,
      verdict: { en: "No time-aligned events in his peak window yet — needs a time-stamped event feed for this match.", is: "Engir tíma-samstilltir atburðir í hámarksglugganum enn — þarf tíma-stimplaðan atburða-straum fyrir leikinn." } };
  }

  const byAction = new Map<TacticalAction, { count: number; obv: number }>();
  for (const e of aligned) {
    const a = classifyEventAction(e);
    const cur = byAction.get(a) ?? { count: 0, obv: 0 };
    cur.count += 1; cur.obv += Number.isFinite(e.obv as number) ? (e.obv as number) : 0;
    byAction.set(a, cur);
  }
  const total = aligned.length;
  const actions: ActionShare[] = [...byAction.entries()]
    .map(([action, v]) => ({ action, label: ACTION_LABEL[action], count: v.count, share: v.count / total, obv: v.obv || null, offBall: IS_OFF_BALL[action] }))
    .sort((a, b) => b.count - a.count);

  const onBall = actions.filter((a) => !a.offBall);
  const onBallEvents = onBall.reduce((s, a) => s + a.count, 0);
  const top = onBall[0] ?? actions[0];

  // Verdict — what drives his peak, in plain language (the dominant on-ball action).
  const attackingActions: TacticalAction[] = ["run_in_behind", "move_to_receive", "run_with_ball"];
  const attackShare = onBall.filter((a) => attackingActions.includes(a.action)).reduce((s, a) => s + a.count, 0) / (onBallEvents || 1);
  const verdict: Bi = attackShare >= 0.5
    ? { en: `His peak intensity is driven by attacking actions — mostly ${top.label.en.toLowerCase()}.`, is: `Hámarks-ákefð hans er drifin af sóknar-aðgerðum — aðallega ${top.label.is.toLowerCase()}.` }
    : { en: `His peak intensity is mostly ${top.label.en.toLowerCase()} in this window.`, is: `Hámarks-ákefð hans er aðallega ${top.label.is.toLowerCase()} í þessum glugga.` };

  const facts: Bi[] = [
    { en: `${total} events in his peak ${window.windowMin}-min window; ${onBallEvents} on-ball.`, is: `${total} atburðir í hámarks ${window.windowMin}-mín glugga; ${onBallEvents} on-ball.` },
    { en: `Top action: ${top.label.en} (${Math.round(top.share * 100)}% of the window).`, is: `Helsta aðgerð: ${top.label.is} (${Math.round(top.share * 100)}% gluggans).` },
  ];
  if (window.metric === "distance" && window.value != null) {
    facts.push({ en: `Peak rate: ${Math.round(window.value)} m/min (total distance).`, is: `Hámarkshraði: ${Math.round(window.value)} m/mín (heildarvegalengd).` });
  }

  const offBallCount = actions.filter((a) => a.offBall).reduce((s, a) => s + a.count, 0);
  const offBallNote: Bi = {
    en: `Off-ball runs (Recovery Run, Covering) are only partly visible in event data — Ju coded them from tracking. ${offBallCount} off-ball proxy event${offBallCount === 1 ? "" : "s"} here; the true off-ball share needs tracking data.`,
    is: `Off-ball hlaup (endurheimtar-hlaup, skjólun) sjást aðeins að hluta í atburða-gögnum — Ju kóðaði þau úr tracking. ${offBallCount} off-ball proxy-atburð${offBallCount === 1 ? "ur" : "ir"} hér; rétt off-ball hlutfall þarf tracking-gögn.`,
  };

  const confidence: Confidence = total >= 8 ? "high" : total >= 4 ? "medium" : "low";

  return { ...base, hasEvents: true, events: total, onBallEvents, actions, verdict, facts, offBallNote, confidence };
}
