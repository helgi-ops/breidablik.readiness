import type { Lang } from "@/lib/lang";

export const PLAYER_COPY = {
  IS: {
    header: {
      label: "Leikmaður",
    },
    tabs: {
      today: "Í dag",
      rpe: "RPE",
      dashboard: "Yfirlit",
      history: "Saga",
      vald: "VALD",
    },
    decision: {
      kicker: "Í dag",
      prefix: "Ákvörðun",
      coachMsg: "Skilaboð frá þjálfara",
      why: "Af hverju:",
      readyTitle: "Tilbúinn til æfingar",
      readyBody: "Þú ert leyfður í fulla þjálfun í dag.",
      readyFollow: "Fylgdu áætlaðri æfingu.",
      sessionBtn: "Fulla æfing",
    },
    training: {
      sectionTitle: "Æfing dagsins",
      status: "Staða",
      noItems: "Engin atriði í þessum hluta.",
      loading: "Hleð gögnum...",
      changeExercise: "Ef þú vilt breyta, veldu aðra æfingu",
    },
    rpe: {
      kicker: "Eftir æfingu",
      title: "Post-Session RPE",
      sub: "Mettu hversu þungt heildaræfingin leyndist.",
    },
    readiness: {
      title: "Mælingar dagsins",
      sub: "Aðeins til upplýsingar — notað fyrir ákvörðunarlógík.",
    },
    blocks: {
      warmup: "Upphitun",
      primer: "Primer",
      main: "Main",
      accessory: "Accessory",
    },
    session: {
      ack: "Mætt",
      complete: "Lokið",
      seen: "Skoðað",
    },
    misc: {
      noData: "Engin gögn",
      noBaseline: "No baseline",
      override: "Override",
      loading: "Hleð…",
    },
  },
  EN: {
    header: {
      label: "Player",
    },
    tabs: {
      today: "Today",
      rpe: "RPE",
      dashboard: "Dashboard",
      history: "History",
      vald: "VALD",
    },
    decision: {
      kicker: "Today",
      prefix: "Decision",
      coachMsg: "Message from coach",
      why: "Why:",
      readyTitle: "Ready to Train",
      readyBody: "You are cleared for full training today.",
      readyFollow: "Follow today's planned session.",
      sessionBtn: "Full session",
    },
    training: {
      sectionTitle: "Today's Session",
      status: "Status",
      noItems: "No items in this section.",
      loading: "Loading...",
      changeExercise: "Change exercise — select another option",
    },
    rpe: {
      kicker: "Post-Session",
      title: "Post-Session RPE",
      sub: "Rate how hard the full session felt overall.",
    },
    readiness: {
      title: "Today's Measurements",
      sub: "For reference only — used for decision logic.",
    },
    blocks: {
      warmup: "Warm-up",
      primer: "Primer",
      main: "Main",
      accessory: "Accessory",
    },
    session: {
      ack: "Attended",
      complete: "Complete",
      seen: "Seen",
    },
    misc: {
      noData: "No data",
      noBaseline: "No baseline",
      override: "Override",
      loading: "Loading…",
    },
  },
} satisfies Record<Lang, object>;

export type PlayerCopy = (typeof PLAYER_COPY)["IS"];
