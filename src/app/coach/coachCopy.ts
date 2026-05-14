import type { Lang } from "@/lib/lang";

export const COACH_COPY = {
  IS: {
    tabs: {
      today: "Í dag",
      squad: "Hópur",
      intel: "Greind",
      load: "Álag & RPE",
      gps: "GPS gögn",
      md: "MD Samanburður",
      drills: "Session",
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
      syncStatSport: "Samstilla STATSports",
      syncingStatSport: "Samstilli...",
      syncGps: "Samstilla GPS",
      syncingGps: "Samstilli...",
      generateDecisions: "Endurkeyra vél",
      generating: "Hleð...",
    },
    status: {
      loading: "Hleð...",
      noData: "Engin gögn",
      noSummary: "Engin samantekt tiltæk fyrir daginn.",
      refresh: "Endurhlaða eða smelltu á Endurkeyra vél.",
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
      md: "MD Comparison",
      drills: "Session",
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
      syncStatSport: "Sync STATSports",
      syncingStatSport: "Syncing STATSports...",
      syncGps: "Sync GPS",
      syncingGps: "Syncing GPS...",
      generateDecisions: "Re-run engine",
      generating: "Running...",
    },
    status: {
      loading: "Loading...",
      noData: "No data",
      noSummary: "No team summary available for the day.",
      refresh: "Refresh or click Re-run engine.",
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
