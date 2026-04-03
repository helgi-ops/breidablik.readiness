import type { Lang } from "@/lib/lang";

export const COACH_COPY = {
  IS: {
    tabs: {
      today: "Í dag",
      squad: "Hópur",
      intel: "Greind",
      load: "Álag & RPE",
      gps: "GPS gögn",
      volatility: "Sveiflur",
      vald: "VALD / CMJ",
      strength: "Styrkur / VBT",
      trend: "Þróun",
      rtp: "Meiðsli / RTP",
    },
    header: {
      title: "Þjálfari",
      commandCenter: "Stjórnstöð dagsins",
      decisionSummary: "Samantekt þjálfaraákvörðunar dagsins",
    },
    actions: {
      syncCatapult: "Samstilla Catapult",
      syncingCatapult: "Samstilli...",
      generateDecisions: "Búa til ákvarðanir",
      generating: "Hleð...",
    },
    status: {
      loading: "Hleð...",
      noData: "Engin gögn",
      noSummary: "Engin samantekt tiltæk fyrir daginn.",
      refresh: "Endurhlaða eða keyrðu Búa til ákvarðanir.",
    },
    risk: {
      high: "MIKIL ÁHÆTTA",
      caution: "VARÚÐ",
      stable: "STÖÐUGT",
    },
    players: {
      full: "Full",
      reduced: "Minnkuð",
      recovery: "Bati",
      total: "Alls leikmenn",
      availability: "Tiltækni",
    },
  },
  EN: {
    tabs: {
      today: "Today",
      squad: "Squad",
      intel: "Intelligence",
      load: "Load & RPE",
      gps: "GPS Data",
      volatility: "Volatility",
      vald: "VALD / CMJ",
      strength: "Strength / VBT",
      trend: "Trends",
      rtp: "Injuries / RTP",
    },
    header: {
      title: "Coach",
      commandCenter: "Today Command Center",
      decisionSummary: "Today's coaching decision summary",
    },
    actions: {
      syncCatapult: "Sync Catapult",
      syncingCatapult: "Syncing Catapult...",
      generateDecisions: "Generate Today Decisions",
      generating: "Generating...",
    },
    status: {
      loading: "Loading...",
      noData: "No data",
      noSummary: "No team summary available for the day.",
      refresh: "Refresh or run Generate Today Decisions.",
    },
    risk: {
      high: "HIGH RISK",
      caution: "CAUTION",
      stable: "STABLE",
    },
    players: {
      full: "Full",
      reduced: "Reduced",
      recovery: "Recovery",
      total: "Total players",
      availability: "Availability",
    },
  },
} satisfies Record<Lang, object>;

export type CoachCopy = (typeof COACH_COPY)["IS"];
