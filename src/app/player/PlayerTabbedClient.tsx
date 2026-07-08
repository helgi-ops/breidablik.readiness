"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/lang";
import { PLAYER_COPY } from "./playerCopy";
import { createPortal } from "react-dom";
import PlayerClient from "./PlayerClient";
import { buildDevDailySessionAdapterResult } from "@/lib/micropulse/trainingGraph/devAdapter";
import { buildEnforcedSessionPlan } from "@/lib/micropulse/lightAte/enforcement";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DevPlayerTabs from "./dev-player-dashboard/DevPlayerTabs";
import DevPlayerRiskTab from "./dev-player-dashboard/DevPlayerRiskTab";
import DevPlayerVALDTab from "./dev-player-dashboard/DevPlayerVALDTab";
import DevPlayerHistoryTab from "./dev-player-dashboard/DevPlayerHistoryTab";
import DevPlayerStrengthTab from "./dev-player-dashboard/DevPlayerStrengthTab";
import PWANotificationPrompt from "./dev-player-dashboard/PWANotificationPrompt";
import PlayerAccessPanel from "./PlayerAccessPanel";
import {
  buildDevPlayerRiskViewModel,
  normalizeDevPlayerTab,
  type DevPlayerTab,
} from "@/lib/micropulse/playerDashboard/devPlayerViewModel";
import { supabase } from "@/lib/supabaseClient";
import FloatingChatBubble from "@/components/chat/FloatingChatBubble";
import ChatThread from "@/components/chat/ChatThread";
import { useUnreadCount } from "@/components/chat/useUnreadCount";
import PlayerGameReportCard from "@/components/player/PlayerGameReportCard";
import PlayerMatchMovementCard from "@/components/player/PlayerMatchMovementCard";
import PlayerBreakBanner from "@/components/player/PlayerBreakBanner";
import { useTeamMode } from "@/lib/useTeamMode";
import { isGpsOnly } from "@/lib/teamMode";

type PlanTier = "FREE" | "PRO" | "ELITE";

type FinalAction = "FULL" | "REDUCED" | "RECOVERY";
type AteCardState = "GREEN" | "YELLOW" | "RED" | "GRAY";
type SessionMode = "full" | "modified" | "recovery" | "pending";

type NormalizedPlayerDailyDecision = {
  playerState: AteCardState;
  sessionMode: SessionMode;
  mdContext: string | null;
  emphasis: string;
  message: string | null;
  why: string | null;
  adjustments: {
    setReduction?: number;
    velocityLossCap?: number | null;
    extraRestSeconds?: number;
    disablePlyo?: boolean;
    disableBallistic?: boolean;
    forceRecoveryBlocks?: boolean;
  };
};

function detectFinalActionFromPage(): FinalAction | null {
  const cards = Array.from(document.querySelectorAll("div.rounded-xl, div.rounded-2xl")) as HTMLElement[];
  const hero = cards.find((el) => {
    const txt = el.textContent ?? "";
    return txt.includes("Í dag") && (txt.includes("FULL") || txt.includes("REDUCED") || txt.includes("RECOVERY"));
  });

  const source = hero?.textContent ?? document.body.textContent ?? "";
  if (/\bRECOVERY\b/.test(source)) return "RECOVERY";
  if (/\bREDUCED\b/.test(source)) return "REDUCED";
  if (/\bFULL\b/.test(source)) return "FULL";
  return null;
}

function detectHeaderCard(): HTMLElement | null {
  // Primary: data attribute (language-agnostic)
  const byKey = document.querySelector('[data-player-card="header"]') as HTMLElement | null;
  if (byKey) return byKey;
  // Fallback: text-based (IS and EN)
  const cards = Array.from(document.querySelectorAll("div.rounded-xl, div.rounded-2xl")) as HTMLElement[];
  return (
    cards.find((el) => {
      const txt = el.textContent ?? "";
      return (txt.includes("Player ·") || txt.includes("Leikmaður ·")) &&
        (txt.includes("FULL") || txt.includes("REDUCED") || txt.includes("RECOVERY"));
    }) ?? null
  );
}

function normalizeReadinessScore(rawTotalScore: number | null): number | null {
  if (rawTotalScore == null) return null;
  return Math.max(0, Math.min(100, ((rawTotalScore - 5) / 20) * 100));
}

function detectFlagFromPage(): "GREEN" | "YELLOW" | "RED" | null {
  const header = detectHeaderCard();
  const source = header?.textContent ?? document.body.textContent ?? "";
  if (/\bRED\b/.test(source)) return "RED";
  if (/\bYELLOW\b/.test(source)) return "YELLOW";
  if (/\bGREEN\b/.test(source)) return "GREEN";
  return null;
}

function detectMdContextFromPage(): string | null {
  const header = detectHeaderCard();
  const source = header?.textContent ?? document.body.textContent ?? "";
  const token = source.match(/\bMD(?:[+-]\d+)?\b/i)?.[0] ?? null;
  return token ? token.toUpperCase() : null;
}

function detectRawTotalScoreFromPage(): number | null {
  const source = document.body.textContent ?? "";
  const m = source.match(/Total:\s*(\d{1,3})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function detectDecisionCardText(): { message: string | null; why: string | null } {
  const decisionTitle = Array.from(document.querySelectorAll("div.text-base.font-semibold.text-zinc-900")).find((el) =>
    (el.textContent ?? "").includes("Ákvörðun:") || (el.textContent ?? "").includes("Training Context")
  ) as HTMLElement | undefined;
  if (!decisionTitle) return { message: null, why: null };
  const decisionCard = decisionTitle.closest("div.rounded-2xl.border") as HTMLElement | null;
  if (!decisionCard) return { message: null, why: null };

  const messageEl = decisionCard.querySelector("div.mt-3.text-sm.leading-relaxed.text-zinc-800") as HTMLElement | null;
  const message = (messageEl?.textContent ?? "").trim() || null;

  const whyContainer = Array.from(decisionCard.querySelectorAll("div.rounded-xl.border")).find((el) =>
    (el.textContent ?? "").toLowerCase().includes("af hverju:")
  ) as HTMLElement | undefined;
  let why: string | null = null;
  if (whyContainer) {
    const raw = (whyContainer.textContent ?? "").replace(/^\s*Af hverju:\s*/i, "").trim();
    why = raw || null;
  }

  return { message, why };
}

function athleteStateFromFlag(flag: "GREEN" | "YELLOW" | "RED" | null): "GREEN_PLUS" | "GREEN" | "YELLOW" | "RED" | null {
  if (!flag) return null;
  if (flag === "RED") return "RED";
  if (flag === "YELLOW") return "YELLOW";
  return "GREEN";
}

function mapStateFromMode(mode: SessionMode): AteCardState {
  if (mode === "full") return "GREEN";
  if (mode === "modified") return "YELLOW";
  if (mode === "recovery") return "RED";
  return "GRAY";
}

function emphasisTextForState(state: AteCardState): string {
  if (state === "GREEN") return "Execution and quality";
  if (state === "YELLOW") return "Control and freshness";
  if (state === "RED") return "Recovery and freshness";
  return "Complete check-in first";
}

function reduceSetsInLine(line: string, by: number): string {
  if (by <= 0) return line;
  const fromPair = line.replace(/(\d+)\s*[x×]\s*(\d+)/i, (_, sets, reps) => `${Math.max(1, Number(sets) - by)}x${reps}`);
  return fromPair.replace(/(\d+)\s*sets?/i, (_, sets) => `${Math.max(1, Number(sets) - by)} set`);
}

function enforceRenderedWorkoutBlocks(decision: NormalizedPlayerDailyDecision): void {
  const sectionRoots = Array.from(document.querySelectorAll("div.space-y-3")) as HTMLElement[];
  const trainingRoot =
    sectionRoots.find((root) => {
      const txt = root.textContent ?? "";
      return (txt.includes("Æfing dagsins") || txt.includes("Today's Session")) && root.querySelector("div.rounded-2xl.border.p-4");
    }) ?? null;
  if (!trainingRoot) return;

  const blockCards = Array.from(trainingRoot.querySelectorAll("div.rounded-2xl.border.p-4")) as HTMLElement[];
  if (!blockCards.length) return;

  const pendingId = "dev-ate-pending-note";
  const existingPending = trainingRoot.querySelector(`#${pendingId}`) as HTMLElement | null;
  if (existingPending) existingPending.remove();

  if (decision.sessionMode === "pending") {
    for (const card of blockCards) card.style.display = "none";
    const pending = document.createElement("div");
    pending.id = pendingId;
    pending.className = "rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 text-sm text-zinc-700";
    pending.textContent = "Complete readiness check to unlock today’s training blocks.";
    trainingRoot.appendChild(pending);
    return;
  }

  const shouldHideHighOutput =
    decision.sessionMode === "recovery" || !!decision.adjustments.disableBallistic || !!decision.adjustments.disablePlyo;
  const setReduction = Math.min(1, Math.max(0, decision.adjustments.setReduction ?? 0));
  const extraRestSeconds = Math.min(60, Math.max(0, decision.adjustments.extraRestSeconds ?? 0));
  const velocityLossCap = typeof decision.adjustments.velocityLossCap === "number" ? decision.adjustments.velocityLossCap : null;
  const highOutputPattern = /(primer|ballistic|plyo|explosive|contrast|main force)/i;

  for (const card of blockCards) {
    const titleEl = card.querySelector("div.text-sm.font-semibold.text-zinc-900") as HTMLElement | null;
    const title = titleEl?.textContent ?? "";
    const isHighOutput = highOutputPattern.test(title);

    if (shouldHideHighOutput && isHighOutput) {
      card.style.display = "none";
      continue;
    }
    card.style.display = "";

    const items = Array.from(card.querySelectorAll("li")) as HTMLElement[];
    for (const item of items) {
      let line = item.textContent ?? "";
      if (setReduction > 0) line = reduceSetsInLine(line, setReduction);
      if (extraRestSeconds > 0 && /(rest|hvíld)/i.test(line) && !line.includes("+")) line = `${line} (+${extraRestSeconds}s)`;
      if (velocityLossCap != null && /vl/i.test(line)) line = line.replace(/vl\s*[<≤=]\s*\d+%/i, `VL ≤ ${Math.round(velocityLossCap * 100)}%`);
      item.textContent = line;
    }
  }
}

function buildNormalizedDailyDecision(): NormalizedPlayerDailyDecision {
  const rawTotalScore = detectRawTotalScoreFromPage();
  const readinessScore = normalizeReadinessScore(rawTotalScore);
  const headerFlag = detectFlagFromPage();
  const mdContext = detectMdContextFromPage();
  const connectedText = detectDecisionCardText();
  const adapterResult = buildDevDailySessionAdapterResult({
    athleteState: athleteStateFromFlag(headerFlag),
    mdContext:
      mdContext === "MD5" ||
      mdContext === "MD4" ||
      mdContext === "MD3" ||
      mdContext === "MD2" ||
      mdContext === "MD1" ||
      mdContext === "MD+1"
        ? mdContext === "MD+1"
          ? "MD_PLUS_1"
          : (mdContext as "MD5" | "MD4" | "MD3" | "MD2" | "MD1")
        : mdContext === "OFF"
          ? "OFF"
          : mdContext === "UNKNOWN"
            ? "UNKNOWN"
            : null,
    readinessScore,
  });
  const rawAteState = adapterResult.lightAteDecision?.athleteState ?? null;
  if (rawAteState) {
    const enforcedPlan = buildEnforcedSessionPlan({
      ateState: rawAteState,
      modifiers: adapterResult.lightAteDecision?.modifiers ?? null,
      fallbackSessionMode: "pending",
      hasCheckIn: rawTotalScore != null,
    });
    const playerState: AteCardState = enforcedPlan.state;
    const sessionMode: SessionMode = enforcedPlan.sessionMode;
    return {
      playerState,
      sessionMode,
      mdContext,
      emphasis: emphasisTextForState(playerState),
      message: connectedText.message,
      why: connectedText.why,
      adjustments: enforcedPlan.adjustments,
    };
  }

  // Fallback only when no valid ATE state is available.
  let sessionMode: SessionMode = "pending";
  const action = detectFinalActionFromPage();
  if (action === "FULL") sessionMode = "full";
  if (action === "REDUCED") sessionMode = "modified";
  if (action === "RECOVERY") sessionMode = "recovery";

  let playerState = mapStateFromMode(sessionMode);
  if (playerState === "GRAY") {
    if (headerFlag === "GREEN" || headerFlag === "YELLOW" || headerFlag === "RED") playerState = headerFlag;
  }

  return {
    playerState,
    sessionMode,
    mdContext,
    emphasis: emphasisTextForState(playerState),
    message: connectedText.message,
    why: connectedText.why,
    adjustments: {
      forceRecoveryBlocks: sessionMode === "recovery",
    },
  };
}

function detectCardByKey(key: string): HTMLElement | null {
  return document.querySelector(`[data-player-card="${key}"]`) as HTMLElement | null;
}

function detectCardByTitle(title: string): HTMLElement | null {
  const titleNode = Array.from(document.querySelectorAll("div.text-base.font-semibold.text-zinc-900")).find(
    (el) => (el.textContent ?? "").trim() === title
  ) as HTMLElement | undefined;
  return (titleNode?.closest("div.rounded-2xl.border.bg-white.shadow-sm") as HTMLElement | null) ?? null;
}

function detectRpeCard(): HTMLElement | null {
  const explicit = detectCardByKey("rpe");
  if (explicit) return explicit;
  // Find the existing Post-Session RPE card rendered by PlayerClient
  const cards = Array.from(document.querySelectorAll("div.rounded-2xl.border, div.rounded-xl.border")) as HTMLElement[];
  const match =
    cards.find((el) => {
      const txt = el.textContent ?? "";
      return (
        (txt.includes("Post-Session RPE") || txt.includes("EFTIR ÆFINGU")) &&
        (txt.includes("Rate how hard") || txt.includes("RPE compliance") || txt.includes("Submit Session RPE") || txt.includes("Session load preview"))
      );
    }) ?? null;
  return (match?.closest("div.rounded-2xl.border.bg-white.shadow-sm") as HTMLElement | null) ?? match;
}

function detectValdCard(): HTMLElement | null {
  // Find any card that contains "VALD" as a section kicker label
  const cards = Array.from(document.querySelectorAll("div.rounded-2xl.border, div.rounded-xl.border")) as HTMLElement[];
  const match =
    cards.find((el) => {
      const txt = el.textContent ?? "";
      return (
        txt.includes("VALD") &&
        (txt.includes("CMJ") || txt.includes("NordBord") || txt.includes("No recent VALD") || txt.includes("Neuromuscular") || txt.includes("VALD data"))
      );
    }) ?? null;
  return (match?.closest("div.rounded-2xl.border.bg-white.shadow-sm") as HTMLElement | null) ?? match;
}

function detectDecisionHeroCard(): HTMLElement | null {
  // Primary: data attribute (language-agnostic)
  const byKey = document.querySelector('[data-player-card="decision"]') as HTMLElement | null;
  if (byKey) return byKey;
  // Fallback: text-based (IS and EN)
  const cards = Array.from(document.querySelectorAll("div.rounded-2xl.border")) as HTMLElement[];
  return (
    cards.find((el) => {
      const txt = el.textContent ?? "";
      return txt.includes("Ákvörðun:") || txt.includes("Decision:") || txt.includes("Training Context");
    }) ?? null
  );
}

function findSectionGrid(card: HTMLElement, sectionTitle: string): HTMLElement | null {
  const headings = Array.from(
    card.querySelectorAll("div.text-\\[11px\\].font-semibold.uppercase.tracking-wide")
  ) as HTMLElement[];
  for (const heading of headings) {
    const text = (heading.textContent ?? "").trim().toLowerCase();
    if (text !== sectionTitle.toLowerCase()) continue;
    const candidate = heading.nextElementSibling as HTMLElement | null;
    if (candidate?.classList.contains("grid")) return candidate;
  }
  return null;
}

function applyDashboardMetricsLayout(metricsCard: HTMLElement, expanded: boolean) {
  const todayVsTeamGrid = findSectionGrid(metricsCard, "Today vs Team");
  const weeklyLoadGrid = findSectionGrid(metricsCard, "Weekly Load");

  for (const grid of [todayVsTeamGrid, weeklyLoadGrid]) {
    if (!grid) continue;
    if (expanded) {
      grid.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
      grid.style.alignItems = "stretch";
    } else {
      grid.style.gridTemplateColumns = "";
      grid.style.alignItems = "";
    }
  }
}

function applyStickyPlayerHeroLayout(header: HTMLElement, activeTab: DevPlayerTab) {
  const tabsSlot = document.getElementById("dev-player-tabs-slot") as HTMLElement | null;
  const commandSlot = document.getElementById("dev-ate-command-card-slot") as HTMLElement | null;
  void header;
  void activeTab;

  if (tabsSlot) {
    tabsSlot.style.position = "";
    tabsSlot.style.top = "";
    tabsSlot.style.zIndex = "";
    tabsSlot.style.background = "";
    tabsSlot.style.paddingBottom = "";
  }

  if (!commandSlot) return;

  commandSlot.style.position = "";
  commandSlot.style.top = "";
  commandSlot.style.zIndex = "";
  commandSlot.style.background = "";
  commandSlot.style.paddingTop = "";
  commandSlot.style.paddingBottom = "";
  commandSlot.style.marginBottom = "";
}

function ensureTabSlot(id: string, anchor: HTMLElement | null): HTMLElement | null {
  if (!anchor?.parentElement) return null;
  let slot = document.getElementById(id);
  if (!slot) {
    slot = document.createElement("div");
    slot.id = id;
    if (id === "dev-player-tab-panel-slot") {
      slot.className = "mt-3";
      slot.style.width = "100%";
    }
  }
  if (slot.parentElement !== anchor.parentElement) {
    anchor.parentElement.insertBefore(slot, anchor.nextSibling);
  } else if (slot.previousElementSibling !== anchor) {
    anchor.parentElement.insertBefore(slot, anchor.nextSibling);
  }
  return slot;
}

function ateCardCopy(state: AteCardState): { title: string; body: string; secondary: string } {
  if (state === "GREEN") {
    return {
      title: "Ready to Train",
      body: "You are cleared for full training today.",
      secondary: "Follow today’s planned session.",
    };
  }
  if (state === "YELLOW") {
    return {
      title: "Modified Training",
      body: "Train today with reduced intensity and tighter control.",
      secondary: "Focus on quality, pacing, and clean execution.",
    };
  }
  if (state === "RED") {
    return {
      title: "Recovery Focus",
      body: "Recovery is prioritized today. Keep work light and restorative.",
      secondary: "Prioritize mobility, light movement, and recovery work.",
    };
  }
  return {
    title: "Check-In Required",
    body: "Complete your readiness check before training.",
    secondary: "Submit your check-in to unlock today’s guidance.",
  };
}

function sessionModeLabel(mode: SessionMode): string {
  if (mode === "full") return "Full";
  if (mode === "modified") return "Modified";
  if (mode === "recovery") return "Recovery";
  return "Pending";
}

function refineLegacyDecisionCard(decision: NormalizedPlayerDailyDecision): void {
  const decisionTitle = Array.from(document.querySelectorAll("div.text-base.font-semibold.text-zinc-900")).find((el) =>
    (el.textContent ?? "").includes("Ákvörðun:")
  ) as HTMLElement | undefined;
  if (!decisionTitle) return;

  const decisionCard = decisionTitle.closest("div.rounded-2xl.border") as HTMLElement | null;
  if (!decisionCard) return;

  decisionTitle.textContent = "Training Context";

  const kicker = decisionTitle.previousElementSibling as HTMLElement | null;
  if (kicker && (kicker.textContent ?? "").trim() === "Í dag") kicker.textContent = "Context";

  const whySpan = Array.from(decisionCard.querySelectorAll("span")).find((el) =>
    (el.textContent ?? "").toLowerCase().includes("af hverju:")
  );
  const whyBlock = whySpan?.closest("div.rounded-xl.border") as HTMLElement | null;
  if (whyBlock) whyBlock.remove();

  if (decision.message) {
    const messageEl = decisionCard.querySelector("div.mt-3.text-sm.leading-relaxed.text-zinc-800") as HTMLElement | null;
    if (messageEl) messageEl.textContent = decision.message;
  }

  const statLabels = Array.from(decisionCard.querySelectorAll("div.text-\\[11px\\].font-semibold.uppercase.tracking-wide.text-zinc-500"));
  for (const label of statLabels) {
    const text = (label.textContent ?? "").trim();
    if (text === "Ákvörðun") {
      label.textContent = "Session mode";
      const value = label.nextElementSibling as HTMLElement | null;
      if (value) value.textContent = sessionModeLabel(decision.sessionMode);
    }
    if (text === "MD context") {
      label.textContent = "Matchday context";
      const value = label.nextElementSibling as HTMLElement | null;
      if (value) value.textContent = decision.mdContext ?? "—";
    }
    if (text === "Kerfi") {
      label.textContent = "Emphasis";
      const value = label.nextElementSibling as HTMLElement | null;
      if (value) value.textContent = decision.emphasis;
    }
  }
}

function AteCommandCardPortal({ activeTab, clubThemeColor, lang }: { activeTab: DevPlayerTab; clubThemeColor?: string | null; lang?: "IS" | "EN" }) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [dailyDecision, setDailyDecision] = useState<NormalizedPlayerDailyDecision>({
    playerState: "GRAY",
    sessionMode: "pending",
    mdContext: null,
    emphasis: emphasisTextForState("GRAY"),
    message: null,
    why: null,
    adjustments: {},
  });

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const sameDecision = (a: NormalizedPlayerDailyDecision, b: NormalizedPlayerDailyDecision) =>
      a.playerState === b.playerState &&
      a.sessionMode === b.sessionMode &&
      a.mdContext === b.mdContext &&
      a.emphasis === b.emphasis &&
      a.message === b.message &&
      (a.adjustments.setReduction ?? 0) === (b.adjustments.setReduction ?? 0) &&
      (a.adjustments.velocityLossCap ?? null) === (b.adjustments.velocityLossCap ?? null) &&
      (a.adjustments.extraRestSeconds ?? 0) === (b.adjustments.extraRestSeconds ?? 0) &&
      !!a.adjustments.disablePlyo === !!b.adjustments.disablePlyo &&
      !!a.adjustments.disableBallistic === !!b.adjustments.disableBallistic &&
      !!a.adjustments.forceRecoveryBlocks === !!b.adjustments.forceRecoveryBlocks;

    const place = () => {
      if (cancelled) return;
      attempts += 1;
      const header = detectHeaderCard();
      if (!header || !header.parentElement) {
        if (attempts < 25) window.setTimeout(place, 200);
        return;
      }

      let slot = document.getElementById("dev-ate-command-card-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.id = "dev-ate-command-card-slot";
      }

      if (slot.parentElement !== header.parentElement) {
        header.parentElement.insertBefore(slot, header.nextSibling);
      } else if (slot.previousElementSibling !== header) {
        header.parentElement.insertBefore(slot, header.nextSibling);
      }

      const nextDecision = buildNormalizedDailyDecision();
      setDailyDecision((prev) => (sameDecision(prev, nextDecision) ? prev : nextDecision));
      refineLegacyDecisionCard(nextDecision);
      enforceRenderedWorkoutBlocks(nextDecision);
      setMountNode((prev) => (prev === slot ? prev : slot));

      // Re-run a few times to catch async content hydration, then stop.
      if (attempts < 8) window.setTimeout(place, 250);
    };

    place();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mountNode || activeTab !== "today") return null;

  const copy = ateCardCopy(dailyDecision.playerState);

  const chipColor =
    dailyDecision.playerState === "GREEN" ? "#2b8a54" :
    dailyDecision.playerState === "YELLOW" ? "#cb8420" :
    dailyDecision.playerState === "RED" ? "#b34a30" :
    "#a9a493";

  // Light "decision of the day" card (round-14a look): cream surface, a
  // state-coloured dot + "TODAY'S DECISION" kicker, the verdict as a big title,
  // and the plain reason beneath. A thin team-colour left accent keeps club
  // identity without the old full dark fill.
  const kicker = lang === "IS" ? "ÁKVÖRÐUN DAGSINS" : "TODAY'S DECISION";
  const accent = clubThemeColor ?? chipColor;

  return createPortal(
    <div
      className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-[#faf7f0] p-4 shadow-sm"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: chipColor }} />
        {kicker}
      </div>
      <div className="mt-1.5 text-xl font-bold tracking-tight text-zinc-900">{copy.title}</div>
      <div className="mt-1 text-sm leading-relaxed text-zinc-600">{copy.body}</div>
      {dailyDecision.sessionMode !== "pending" && (
        <div className="mt-3">
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600">
            {dailyDecision.sessionMode === "full" ? (lang === "IS" ? "Full æfing" : "Full session") :
             dailyDecision.sessionMode === "modified" ? (lang === "IS" ? "Aðlöguð æfing" : "Modified session") :
             (lang === "IS" ? "Endurheimt" : "Recovery session")}
          </span>
        </div>
      )}
    </div>,
    mountNode
  );
}

// ── Weekly digest card portal ───────────────────────────────────────────────
//
// "Vikan þín" — rolling 7-day summary including streak indicators.
// Sits directly under the AteCommandCard. Replaces the older StreakCard mount
// (StreakCard is still used on /team page).

// ── "See more" (Skoða meira) portal ──────────────────────────────────────────
//
// Round 14a: the daily content (decision + session) owns the top of Today; the
// deeper surfaces — Game Report, Movement, Overview — become quiet "See more"
// link rows at the bottom so they don't compete with the day. Anchored after the
// explanation card (the last visible Today card). Replaces the earlier last-match
// hero + weekly-digest portals; that content now lives on its own tabs, one tap
// away via these links (and the bottom nav).

function TodayMorePortal({ activeTab, lang, onOpen }: { activeTab: DevPlayerTab; lang?: "IS" | "EN"; onOpen: (tab: DevPlayerTab) => void }) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const is = lang === "IS";

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const place = () => {
      if (cancelled) return;
      attempts += 1;

      // Anchor after the ATE command card (the proven mount point the old
      // last-match / weekly-digest portals used) — a sibling of the header,
      // OUTSIDE the card column whose "hide unknown cards" rule was swallowing
      // this slot when it was anchored after the explanation card. Falls back to
      // the header card.
      const ateSlot = document.getElementById("dev-ate-command-card-slot");
      const anchor = document.getElementById("dev-today-session-slot") ?? ateSlot ?? detectHeaderCard();
      if (!anchor?.parentElement) {
        if (attempts < 25) window.setTimeout(place, 300);
        return;
      }

      let slot = document.getElementById("dev-today-more-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.id = "dev-today-more-slot";
        slot.className = "mt-3";
      }

      if (slot.parentElement !== anchor.parentElement || slot.previousElementSibling !== anchor) {
        anchor.parentElement!.insertBefore(slot, anchor.nextSibling);
      }

      setMountNode((prev) => (prev === slot ? prev : slot));
    };

    place();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mountNode || activeTab !== "today") return null;

  const items: { key: DevPlayerTab; title: string; sub: string; Icon: typeof IconReport }[] = [
    { key: "gamereport", title: is ? "Leikur" : "Game", sub: is ? "Leikjaskýrslan þín — síðasti leikur" : "Your game report — last match", Icon: IconReport },
    { key: "movement", title: is ? "Hreyfing" : "Movement", sub: is ? "Match movement — spretta, hröðun, vegalengd" : "Match movement — sprint, accel, distance", Icon: IconActivity },
    { key: "dashboard", title: is ? "Yfirlit" : "Overview", sub: is ? "Öll gögnin þín — álag, styrkur, saga" : "All your data — load, strength, history", Icon: IconBarChart },
  ];

  return createPortal(
    <div className="mt-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{is ? "Skoða meira" : "See more"}</div>
      <div className="space-y-2">
        {items.map((it) => {
          const Icon = it.Icon;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onOpen(it.key)}
              className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-zinc-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"><Icon active={false} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-zinc-900">{it.title}</span>
                <span className="block truncate text-xs text-zinc-500">{it.sub}</span>
              </span>
              <span className="text-lg leading-none text-zinc-300">›</span>
            </button>
          );
        })}
      </div>
    </div>,
    mountNode,
  );
}

// ── Return-to-training progress portal ───────────────────────────────────────
//
// For a player mid-ramp (graded return started by the coach), an encouraging
// "where am I" card: which week, a progress bar, this week's focus in plain
// words, what unlocks next, and a gentle on-track signal. Deliberately plain —
// no ACWR, no re-injury framing, no raw numbers (that lives on the coach/S&C
// surface). Self-scoped: /api/player/return-to-training reads the player from
// their own token. Renders nothing unless there's an active started plan.

const RTT_QUALITY_LABEL: Record<string, { en: string; is: string }> = {
  volume:    { en: "training volume",    is: "æfingaálag" },
  distance:  { en: "running distance",   is: "hlaupavegalengd" },
  hsr:       { en: "high-speed running", is: "hraðahlaup" },
  sprint:    { en: "sprinting",          is: "sprettir" },
  accel:     { en: "accelerations",      is: "hröðun" },
  decel:     { en: "decelerations",      is: "hemlun" },
  decelHigh: { en: "hard braking",       is: "kröpp hemlun" },
  cod:       { en: "change of direction", is: "stefnubreytingar" },
  efforts:   { en: "high-effort actions", is: "átök" },
};

type RttProgress = {
  active: boolean;
  currentWeek: number;
  totalWeeks: number;
  finalWeek: boolean;
  thisWeekFocus: string[];
  unlocksNext: string[];
  onTrack: "on" | "over" | null;
  sessionsThisWeek: number;
  inProgress: boolean;
};

function PlayerRttProgressPortal({ activeTab, lang, clubThemeColor }: { activeTab: DevPlayerTab; lang?: "IS" | "EN"; clubThemeColor?: string | null }) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<RttProgress | null>(null);
  const is = lang === "IS";

  // Fetch the player's own plan once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch("/api/player/return-to-training", { headers: { Authorization: `Bearer ${token}` } });
        const j = (await res.json()) as RttProgress;
        if (!cancelled && res.ok && j?.active) setData(j);
      } catch { /* optional card — never break Today */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Anchor after the ATE command card slot (falls back to the header card).
  // Gated on `data.active` — matching RpeReminderPortal — so placement only runs
  // once there's content AND the Today DOM has settled (the mount-time `[]` variant
  // raced the anchor before it existed and then stopped retrying, so the card
  // silently never appeared). A MutationObserver re-inserts the slot if a React
  // re-render of the Today column drops our manually-injected node.
  useEffect(() => {
    if (!data?.active) return;
    let cancelled = false;
    let attempts = 0;
    let observer: MutationObserver | null = null;
    const ensure = () => {
      if (cancelled) return false;
      const ateSlot = document.getElementById("dev-ate-command-card-slot");
      const anchor = document.getElementById("dev-today-session-slot") ?? ateSlot ?? detectHeaderCard();
      if (!anchor?.parentElement) return false;
      let slot = document.getElementById("dev-rtt-progress-slot");
      if (!slot) { slot = document.createElement("div"); slot.id = "dev-rtt-progress-slot"; }
      if (slot.parentElement !== anchor.parentElement || slot.previousElementSibling !== anchor) {
        anchor.parentElement.insertBefore(slot, anchor.nextSibling);
      }
      setMountNode((prev) => (prev === slot ? prev : slot));
      return true;
    };
    const place = () => {
      if (cancelled) return;
      attempts += 1;
      if (!ensure() && attempts < 25) window.setTimeout(place, 300);
      else if (!observer && document.body) {
        // Keep the slot alive across Today re-renders.
        observer = new MutationObserver(() => { if (!document.getElementById("dev-rtt-progress-slot")?.isConnected) ensure(); });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };
    const t = window.setTimeout(place, 0); // defer so setState isn't synchronous in the effect body
    return () => { cancelled = true; window.clearTimeout(t); observer?.disconnect(); };
  }, [data?.active]);

  if (!mountNode || activeTab !== "today" || !data?.active) return null;

  const label = (q: string) => (is ? RTT_QUALITY_LABEL[q]?.is : RTT_QUALITY_LABEL[q]?.en) ?? q;
  const focus = data.thisWeekFocus.map(label);
  const next = data.unlocksNext.map(label);
  const pct = Math.max(6, Math.round((data.currentWeek / Math.max(1, data.totalWeeks)) * 100));
  const accent = clubThemeColor ?? "#2b8a54";

  return createPortal(
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-[#faf7f0] p-4 shadow-sm" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <span aria-hidden>🏃</span>{is ? "ENDURKOMAN ÞÍN" : "YOUR RETURN TO TRAINING"}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-xl font-bold tracking-tight text-zinc-900">{is ? `Vika ${data.currentWeek} af ${data.totalWeeks}` : `Week ${data.currentWeek} of ${data.totalWeeks}`}</span>
        {data.finalWeek && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{is ? "lokavika" : "final week"}</span>}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
      </div>
      <div className="mt-2 text-sm leading-relaxed text-zinc-600">
        {data.finalWeek
          ? (is ? "Lokavikan — næstum kominn í fulla æfingu. Flott vinna 💪" : "Final week — almost back to full training. Great work 💪")
          : (is ? "Þú ert að byggja þig upp, skref fyrir skref." : "You're building back up, step by step.")}
      </div>
      {focus.length > 0 && (
        <div className="mt-2 text-sm text-zinc-700"><span className="text-zinc-400">{is ? "Þessa viku: " : "This week: "}</span>{focus.join(", ")}</div>
      )}
      {next.length > 0 && !data.finalWeek && (
        <div className="mt-1 text-sm text-zinc-700"><span className="text-zinc-400">{is ? "Næst: " : "Next up: "}</span>{next.join(", ")}</div>
      )}
      {data.onTrack === "on" && (
        <div className="mt-2 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{is ? "Á áætlun þessa viku ✓" : "On track this week ✓"}</div>
      )}
      {data.onTrack === "over" && (
        <div className="mt-2 text-xs leading-snug text-amber-700">{is ? "Þú ert kominn fram úr planinu vikunnar — það er í lagi að taka aðeins af. Stigvaxandi upptröppun verndar þig." : "You're ahead of this week's plan — it's okay to ease back a little. The gradual ramp protects you."}</div>
      )}
      <div className="mt-3 border-t border-zinc-200/70 pt-2 text-[11px] text-zinc-400">
        {is ? "Þjálfarinn þinn setti þetta plan með þér." : "Your coach set this plan with you."}
      </div>
    </div>,
    mountNode,
  );
}

// ── Today's expected load portal ─────────────────────────────────────────────
//
// A forward-looking "what's coming today" card: the microcycle outlook (effort
// band + intensity meter, ~duration, focus, % of a match, a plain reason) and
// the player's own target — eased when their own check-in is yellow/red. Plain
// and anticipatory; the raw target AU is framed with "% of a match". Data from
// /api/player/today-load (shared source with the coach Pre-session report), so
// the player's outlook can never disagree with the coach plan. Self-hides on
// off-days / no plan. Same reliable mount as PlayerRttProgressPortal.

type TodayLoad = {
  show: boolean;
  matchDay: boolean;
  mdLabel: string | null;
  band: "light" | "moderate" | "high" | "very_high";
  loadType: "mechanical" | "locomotive" | "mixed";
  durationMin: number;
  matchPct: number;
  rationaleEN: string;
  rationaleIS: string;
  personalTarget: number | null;
  personalN: number;
  flag: "ok" | "build" | "reduce" | null;
  eased: "yellow" | "red" | null;
};

const LOAD_BAND: Record<TodayLoad["band"], { pct: number; en: string; is: string; color: string }> = {
  light:     { pct: 30,  en: "Easy",      is: "Létt",        color: "#2b8a54" },
  moderate:  { pct: 55,  en: "Moderate",  is: "Miðlungs",    color: "#0ea5e9" },
  high:      { pct: 80,  en: "Hard",      is: "Erfitt",      color: "#d97706" },
  very_high: { pct: 100, en: "Very hard", is: "Mjög erfitt", color: "#e11d48" },
};
const LOAD_FOCUS: Record<TodayLoad["loadType"], { en: string; is: string }> = {
  mechanical: { en: "force", is: "kraftur" },
  locomotive: { en: "speed", is: "hraði" },
  mixed:      { en: "mixed", is: "blandað" },
};
const LOAD_FLAG: Record<"ok" | "build" | "reduce", { en: string; is: string; cls: string }> = {
  ok:     { en: "on track",      is: "á áætlun",              cls: "bg-emerald-50 text-emerald-700" },
  build:  { en: "room to build", is: "svigrúm til að byggja", cls: "bg-sky-50 text-sky-700" },
  reduce: { en: "ease back",     is: "taktu af",              cls: "bg-amber-50 text-amber-700" },
};

/** "MD-3" → "3 days to match"; "MD" → "match day"; "MD+1" → "1 day since match". */
function mdGloss(mdLabel: string | null, is: boolean): string | null {
  if (!mdLabel) return null;
  const s = mdLabel.toUpperCase().replace(/\s+/g, "");
  if (s === "MD" || s === "MD0") return is ? "leikdagur" : "match day";
  const m = s.match(/^MD([+-])(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[2], 10);
  if (m[1] === "-") return n === 1 ? (is ? "leikur á morgun" : "match tomorrow") : (is ? `${n} dagar í leik` : `${n} days to match`);
  return n === 1 ? (is ? "1 dagur frá leik" : "1 day since match") : (is ? `${n} dagar frá leik` : `${n} days since match`);
}

function PlayerTodayLoadPortal({ activeTab, lang, clubThemeColor }: { activeTab: DevPlayerTab; lang?: "IS" | "EN"; clubThemeColor?: string | null }) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<TodayLoad | null>(null);
  const is = lang === "IS";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch("/api/player/today-load", { headers: { Authorization: `Bearer ${token}` } });
        const j = (await res.json()) as TodayLoad;
        if (!cancelled && res.ok && j?.show) setData(j);
      } catch { /* optional card — never break Today */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!data?.show) return;
    let cancelled = false;
    let attempts = 0;
    let observer: MutationObserver | null = null;
    const ensure = () => {
      if (cancelled) return false;
      const ateSlot = document.getElementById("dev-ate-command-card-slot");
      const anchor = document.getElementById("dev-today-session-slot") ?? ateSlot ?? detectHeaderCard();
      if (!anchor?.parentElement) return false;
      let slot = document.getElementById("dev-today-load-slot");
      if (!slot) { slot = document.createElement("div"); slot.id = "dev-today-load-slot"; }
      if (slot.parentElement !== anchor.parentElement || slot.previousElementSibling !== anchor) {
        anchor.parentElement.insertBefore(slot, anchor.nextSibling);
      }
      setMountNode((prev) => (prev === slot ? prev : slot));
      return true;
    };
    const place = () => {
      if (cancelled) return;
      attempts += 1;
      if (!ensure() && attempts < 25) window.setTimeout(place, 300);
      else if (!observer && document.body) {
        observer = new MutationObserver(() => { if (!document.getElementById("dev-today-load-slot")?.isConnected) ensure(); });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };
    const t = window.setTimeout(place, 0);
    return () => { cancelled = true; window.clearTimeout(t); observer?.disconnect(); };
  }, [data?.show]);

  if (!mountNode || activeTab !== "today" || !data?.show) return null;

  const accent = clubThemeColor ?? "#2b8a54";

  // Match-day: a short celebratory state instead of the load layout.
  if (data.matchDay) {
    return createPortal(
      <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-[#faf7f0] p-4 shadow-sm" style={{ borderLeft: `3px solid ${accent}` }}>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <span aria-hidden>⚽</span>{is ? "ÆFING DAGSINS" : "TODAY'S SESSION"}
        </div>
        <div className="mt-1.5 text-xl font-bold tracking-tight text-zinc-900">{is ? "Leikdagur! 🔥" : "Match day! 🔥"}</div>
        <div className="mt-1 text-sm leading-relaxed text-zinc-600">{is ? "Í dag er leikur — engin áætluð æfing. Gefðu allt." : "It's match day — no planned training. Leave it all out there."}</div>
      </div>,
      mountNode,
    );
  }

  const b = LOAD_BAND[data.band];
  const focus = LOAD_FOCUS[data.loadType];
  const gloss = mdGloss(data.mdLabel, is);
  const flag = data.flag ? LOAD_FLAG[data.flag] : null;

  return createPortal(
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-[#faf7f0] p-4 shadow-sm" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <span className="flex items-center gap-1.5"><span aria-hidden>📋</span>{is ? "ÁÆTLUN DAGSINS" : "TODAY'S OUTLOOK"}</span>
        {data.mdLabel && <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">{data.mdLabel}{gloss ? ` · ${gloss}` : ""}</span>}
      </div>

      {/* Effort band + intensity meter */}
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-bold tracking-tight text-zinc-900">{is ? b.is : b.en}</span>
        <span className="text-sm text-zinc-500">· ~{data.durationMin} {is ? "mín" : "min"}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: b.color }} />
      </div>

      <div className="mt-2 text-sm text-zinc-700">
        <span className="text-zinc-400">{is ? "Áhersla: " : "Focus: "}</span>{is ? focus.is : focus.en}
        <span className="text-zinc-400"> · </span>{is ? `~${data.matchPct}% af leik` : `~${data.matchPct}% of a match`}
      </div>

      {/* Personal number — anchored to the SAME session type (your own MD-x usual) */}
      {data.personalTarget != null && (
        <div className="mt-2 border-t border-zinc-200/70 pt-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-zinc-600">{is ? `Á ${data.mdLabel} dögum ferðu venjulega í` : `On ${data.mdLabel} days you usually do`}</span>
            <span className="font-semibold text-zinc-900">~{data.personalTarget}</span>
            {flag && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${flag.cls}`}>{is ? flag.is : flag.en}</span>}
          </div>
          {data.personalN > 0 && (
            <div className="mt-0.5 text-[10px] text-zinc-400">{is ? `úr ${data.personalN} ${data.mdLabel}-æfingum` : `from ${data.personalN} past ${data.mdLabel} sessions`}</div>
          )}
        </div>
      )}
      {data.eased && (
        <div className="mt-1 text-xs leading-snug text-amber-700">
          {is ? "Aðeins minnkað miðað við líðan þína í dag." : "Eased a little for how you're feeling today."}
        </div>
      )}

      <div className="mt-2 text-[11px] leading-snug text-zinc-500">{is ? data.rationaleIS : data.rationaleEN}</div>
    </div>,
    mountNode,
  );
}

// ── Today recap portal (close the loop) ──────────────────────────────────────
//
// The evening resolution to the morning outlook: predicted vs actual for today
// plus one honest, positive insight. Appears only once a real session lands.
// Health-first framing — plan-adherence, NOT "you topped your load": over-plan
// is a recovery nudge, never a celebration. Layered read: verdict → planned vs
// actual → provenance behind "details". Same reliable mount as the other cards.

type TodayRecap = {
  show: boolean;
  mdLabel: string | null;
  plannedTarget: number;
  plannedN: number;
  actual: number;
  adherencePct: number | null;
  status: "on" | "over" | "well_over" | "under" | "well_under";
  eased: "yellow" | "red" | null;
  insightKind: "pb" | "adherence" | "readiness" | null;
  pb: { exercise: string; deltaKg: number } | null;
};

const RECAP_VERDICT: Record<TodayRecap["status"], { en: string; is: string; dot: string }> = {
  on:         { en: "On plan — you trained like a typical", is: "Á áætlun — þú æfðir eins og venjulegur", dot: "#2b8a54" },
  under:      { en: "Lighter than your usual", is: "Léttari en venjulegur", dot: "#0ea5e9" },
  well_under: { en: "Much lighter than your usual", is: "Mun léttari en venjulegur", dot: "#0ea5e9" },
  over:       { en: "A bigger day than your usual", is: "Stærri dagur en venjulegur", dot: "#d97706" },
  well_over:  { en: "Much bigger than your usual", is: "Mun stærri en venjulegur", dot: "#e11d48" },
};

function PlayerTodayRecapPortal({ activeTab, lang, clubThemeColor }: { activeTab: DevPlayerTab; lang?: "IS" | "EN"; clubThemeColor?: string | null }) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<TodayRecap | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const is = lang === "IS";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch("/api/player/today-recap", { headers: { Authorization: `Bearer ${token}` } });
        const j = (await res.json()) as TodayRecap;
        if (!cancelled && res.ok && j?.show) setData(j);
      } catch { /* optional card — never break Today */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!data?.show) return;
    let cancelled = false;
    let attempts = 0;
    let observer: MutationObserver | null = null;
    const ensure = () => {
      if (cancelled) return false;
      const ateSlot = document.getElementById("dev-ate-command-card-slot");
      const anchor = document.getElementById("dev-today-session-slot") ?? ateSlot ?? detectHeaderCard();
      if (!anchor?.parentElement) return false;
      let slot = document.getElementById("dev-today-recap-slot");
      if (!slot) { slot = document.createElement("div"); slot.id = "dev-today-recap-slot"; }
      if (slot.parentElement !== anchor.parentElement || slot.previousElementSibling !== anchor) {
        anchor.parentElement.insertBefore(slot, anchor.nextSibling);
      }
      setMountNode((prev) => (prev === slot ? prev : slot));
      return true;
    };
    const place = () => {
      if (cancelled) return;
      attempts += 1;
      if (!ensure() && attempts < 25) window.setTimeout(place, 300);
      else if (!observer && document.body) {
        observer = new MutationObserver(() => { if (!document.getElementById("dev-today-recap-slot")?.isConnected) ensure(); });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };
    const t = window.setTimeout(place, 0);
    return () => { cancelled = true; window.clearTimeout(t); observer?.disconnect(); };
  }, [data?.show]);

  if (!mountNode || activeTab !== "today" || !data?.show) return null;

  const accent = clubThemeColor ?? "#2b8a54";
  const v = RECAP_VERDICT[data.status];
  const md = data.mdLabel ?? "";
  const overshoot = data.status === "over" || data.status === "well_over";
  // Verdict line: base + MD + (recovery nudge on overshoot | eased note on under).
  const easedNote = data.eased && (data.status === "under" || data.status === "well_under");
  const verdict = `${is ? v.is : v.en} ${md}`.trim()
    + (overshoot ? (is ? " — settu endurheimt í forgang." : " — make recovery a priority.")
      : easedNote ? (is ? " — skynsamlegt miðað við líðan þína í dag." : " — a smart call for how you felt today.")
      : ".");

  const insight = data.insightKind === "pb" && data.pb
    ? (is ? `Nýtt PB í ræktinni í dag: ${data.pb.exercise} +${data.pb.deltaKg}kg 💪` : `New gym PB today: ${data.pb.exercise} +${data.pb.deltaKg}kg 💪`)
    : data.insightKind === "adherence"
      ? (is ? "Flott stjórn — nákvæmlega í þínum takti." : "Nicely controlled — right in your rhythm.")
      : data.insightKind === "readiness"
        ? (is ? "Góð ákvörðun að taka því rólega — þannig heldurðu þér ferskum." : "Good call taking it easy — that's how you stay fresh.")
        : null;

  return createPortal(
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-[#faf7f0] p-4 shadow-sm" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <span aria-hidden>✅</span>{is ? "DAGURINN ÞINN" : "YOUR DAY"}
      </div>

      {/* Layer 0 — verdict */}
      <div className="mt-1.5 flex items-start gap-2">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: v.dot }} />
        <span className="text-[15px] font-bold leading-snug tracking-tight text-zinc-900">{verdict}</span>
      </div>

      {/* Layer 1 — planned vs actual + insight */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span><span className="text-zinc-400">{is ? "Venjulega" : "Usual"} </span><span className="font-semibold text-zinc-700">~{data.plannedTarget}</span></span>
        <span><span className="text-zinc-400">{is ? "Í dag" : "Today"} </span><span className="font-semibold text-zinc-900">~{data.actual}</span></span>
        {data.adherencePct != null && <span className="text-xs text-zinc-500">({data.adherencePct}%)</span>}
      </div>
      {insight && <div className="mt-1.5 text-sm text-zinc-700">{insight}</div>}

      <button type="button" onClick={() => setShowDetails((s) => !s)} className="mt-2 text-[11px] font-semibold text-zinc-500 hover:text-zinc-700">
        {showDetails ? (is ? "Fela smáatriði ▲" : "Hide details ▲") : (is ? "Smáatriði ▼" : "Details ▼")}
      </button>
      {showDetails && (
        <div className="mt-1.5 border-t border-zinc-200/70 pt-2 text-[11px] leading-snug text-zinc-500">
          {is
            ? `Í dag = mælt með GPS (áætluð álög undanskilin). Venjulega = þitt ${md} meðaltal úr ${data.plannedN} æfingum. Þetta er samanburður við þinn eigin takt — ekki keppni um hæsta álag.`
            : `Today = measured by GPS (estimated loads excluded). Usual = your ${md} average from ${data.plannedN} sessions. This compares to your own rhythm — not a contest for the highest load.`}
        </div>
      )}
    </div>,
    mountNode,
  );
}

// ── Daily-nudge opt-in toggles ───────────────────────────────────────────────
//
// Opt-IN toggles for the gentle morning outlook + evening recap push nudges.
// Off by default; shown only once the player has granted push (so the toggles
// are meaningful). Sits quietly at the bottom of Today. Easy to turn off.

function NudgeRow({ label, sub, enabled, onToggle }: { label: string; sub: string; enabled: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 py-1.5 text-left">
      <span className="min-w-0">
        <span className="block text-sm text-zinc-800">{label}</span>
        <span className="block text-[11px] text-zinc-400">{sub}</span>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-zinc-300"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${enabled ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function PlayerNudgePrefsPortal({ activeTab, lang }: { activeTab: DevPlayerTab; lang?: "IS" | "EN" }) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [prefs, setPrefs] = useState<{ daily_outlook: boolean; daily_recap: boolean } | null>(null);
  const [granted, setGranted] = useState(false);
  const is = lang === "IS";

  useEffect(() => {
    const t = window.setTimeout(() => {
      try { setGranted(typeof Notification !== "undefined" && Notification.permission === "granted"); } catch { setGranted(false); }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!granted) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch("/api/player/notification-prefs", { headers: { Authorization: `Bearer ${token}` } });
        const j = await res.json();
        if (!cancelled && res.ok && j?.prefs) setPrefs(j.prefs);
      } catch { /* optional */ }
    })();
    return () => { cancelled = true; };
  }, [granted]);

  useEffect(() => {
    if (!prefs) return;
    let cancelled = false;
    let attempts = 0;
    let observer: MutationObserver | null = null;
    const ensure = () => {
      if (cancelled) return false;
      const anchor = document.getElementById("dev-today-more-slot") ?? document.getElementById("dev-ate-command-card-slot") ?? detectHeaderCard();
      if (!anchor?.parentElement) return false;
      let slot = document.getElementById("dev-nudge-prefs-slot");
      if (!slot) { slot = document.createElement("div"); slot.id = "dev-nudge-prefs-slot"; }
      if (slot.parentElement !== anchor.parentElement || slot.previousElementSibling !== anchor) {
        anchor.parentElement.insertBefore(slot, anchor.nextSibling);
      }
      setMountNode((prev) => (prev === slot ? prev : slot));
      return true;
    };
    const place = () => {
      if (cancelled) return;
      attempts += 1;
      if (!ensure() && attempts < 25) window.setTimeout(place, 300);
      else if (!observer && document.body) {
        observer = new MutationObserver(() => { if (!document.getElementById("dev-nudge-prefs-slot")?.isConnected) ensure(); });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };
    const t = window.setTimeout(place, 0);
    return () => { cancelled = true; window.clearTimeout(t); observer?.disconnect(); };
  }, [prefs]);

  const toggle = async (type: "daily_outlook" | "daily_recap") => {
    if (!prefs) return;
    const next = !prefs[type];
    setPrefs({ ...prefs, [type]: next }); // optimistic
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch("/api/player/notification-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notification_type: type, enabled: next }),
      });
    } catch { setPrefs((p) => (p ? { ...p, [type]: !next } : p)); /* revert */ }
  };

  if (!mountNode || activeTab !== "today" || !granted || !prefs) return null;

  return createPortal(
    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{is ? "DAGLEGAR ÁMINNINGAR" : "DAILY NUDGES"}</div>
      <div className="mt-1.5 divide-y divide-zinc-100">
        <NudgeRow label={is ? "Morgunn: áætlun dagsins" : "Morning: today's outlook"} sub={is ? "Stutt yfirsýn yfir daginn" : "A quick look at your day"} enabled={prefs.daily_outlook} onToggle={() => toggle("daily_outlook")} />
        <NudgeRow label={is ? "Kvöld: hvernig gekk" : "Evening: how it went"} sub={is ? "Samanburður við þinn takt" : "How today compared to your usual"} enabled={prefs.daily_recap} onToggle={() => toggle("daily_recap")} />
      </div>
      <p className="mt-2 text-[10px] text-zinc-400">{is ? "Slökkt sjálfgefið. Þú stjórnar þessu — engin pressa." : "Off by default. You're in control — no pressure."}</p>
    </div>,
    mountNode,
  );
}

// ── Contextual RPE reminder portal ───────────────────────────────────────────
//
// RPE is a time-sensitive daily action (log it right after training), not an
// analysis — so instead of burying it behind the More-sheet, a prominent nudge
// appears on Today ONLY when a session is expected today and RPE hasn't been
// logged yet. It reuses the existing /api/player/session-rpe/status endpoint
// (state === "REMINDER_DUE_TODAY"); once submitted the card self-hides. Tapping
// through opens the RPE tab where the full form + history live.

function RpeReminderPortal({ activeTab, lang, onLogRpe }: { activeTab: DevPlayerTab; lang?: "IS" | "EN"; onLogRpe: () => void }) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [due, setDue] = useState(false);
  const is = lang === "IS";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch("/api/player/session-rpe/status", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (!cancelled && json?.ok && json.status?.state === "REMINDER_DUE_TODAY") setDue(true);
      } catch { /* soft — no reminder if status can't be read */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!due) return;
    let cancelled = false;
    let attempts = 0;

    const place = () => {
      if (cancelled) return;
      attempts += 1;
      // Anchor just after the ATE command card so the RPE nudge sits directly
      // under the readiness decision, above the last-match hero.
      const ateSlot = document.getElementById("dev-ate-command-card-slot");
      const anchor = document.getElementById("dev-today-session-slot") ?? ateSlot ?? detectHeaderCard();
      if (!anchor?.parentElement) {
        if (attempts < 25) window.setTimeout(place, 300);
        return;
      }
      let slot = document.getElementById("dev-rpe-reminder-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.id = "dev-rpe-reminder-slot";
        slot.className = "mt-3";
      }
      if (slot.parentElement !== anchor.parentElement || slot.previousElementSibling !== anchor) {
        anchor.parentElement!.insertBefore(slot, anchor.nextSibling);
      }
      setMountNode((prev) => (prev === slot ? prev : slot));
    };

    place();
    return () => { cancelled = true; };
  }, [due]);

  if (!mountNode || activeTab !== "today" || !due) return null;

  return createPortal(
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">📝</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-primary">
            {is ? "Skráðu RPE fyrir æfingu dagsins" : "Log today's session RPE"}
          </div>
          <div className="mt-0.5 text-xs text-slate-600">
            {is
              ? "Skráðu strax eftir æfingu — það heldur álagsþróuninni þinni réttri."
              : "Log it right after training — it keeps your load trend accurate."}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onLogRpe}
        className="mt-3 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        {is ? "Skrá RPE →" : "Log RPE →"}
      </button>
    </div>,
    mountNode,
  );
}

// ── PWA detection ────────────────────────────────────────────────────────────

function usePwaMode(): boolean {
  const [isPwa, setIsPwa] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () => setIsPwa(mq.matches || !!(navigator as any).standalone);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isPwa;
}

// ── PWA bottom nav icons ──────────────────────────────────────────────────────

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12L12 4l9 8" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}
function IconActivity({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function IconBarChart({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9" />
      <rect x="10" y="7" width="4" height="14" />
      <rect x="17" y="3" width="4" height="18" />
    </svg>
  );
}
function IconClock({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 15" />
    </svg>
  );
}
function IconZap({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconDumbbell({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5h11M6.5 17.5h11" />
      <rect x="2" y="6.5" width="4.5" height="11" rx="1" />
      <rect x="17.5" y="6.5" width="4.5" height="11" rx="1" />
      <path d="M12 6.5v11" />
    </svg>
  );
}

function IconChat({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function IconTeam({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function IconReport({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h2v4H8zM14 11h2v6h-2z" />
    </svg>
  );
}

function IconShield({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconMoreH({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

// ── PWA bottom navigation bar ────────────────────────────────────────────────
// Split into PRIMARY (always-visible at the bottom, max 5 incl. More button)
// and SECONDARY (opens in a bottom-sheet via More). 9 tabs crammed in at
// text-[9px] was unusable on iPhones — labels ran together. Best-practice
// mobile nav is 4-5 primary items; the rest go behind More.

// Primary (bottom bar): Today · Game Report · Dashboard · More (round 14a).
// Game Report + Dashboard are the frequently-viewed surfaces → primary. Movement
// is an analysis surface viewed less often, so it lives in the More-sheet
// alongside RPE history and Chat. Three primary + More keeps the bar readable on
// a phone. minTier is unchanged so the free/pro/elite locks hold; no tab removed.
const PWA_PRIMARY_TABS = [
  { key: "today"      as DevPlayerTab, tabKey: "today"      as const, Icon: IconHome,     minTier: "free" as const, href: null as string | null },
  { key: "gamereport" as DevPlayerTab, tabKey: "gamereport" as const, Icon: IconReport,   minTier: "free" as const, href: null as string | null },
  // RPE is a daily action (log right after training) → give it a primary slot
  // (per the round-14a note that RPE also belongs in the bottom bar). Movement
  // stays in the More-sheet and is surfaced on Today via the "See more" section.
  { key: "rpe"        as DevPlayerTab, tabKey: "rpe"        as const, Icon: IconActivity, minTier: "pro"  as const, href: null as string | null },
  { key: "dashboard"  as DevPlayerTab, tabKey: "dashboard"  as const, Icon: IconBarChart, minTier: "pro"  as const, href: null as string | null },
];

const PWA_SECONDARY_TABS = [
  { key: "movement" as DevPlayerTab, tabKey: "movement" as const, Icon: IconActivity, minTier: "free"  as const, href: null as string | null },
  { key: "chat"     as DevPlayerTab, tabKey: "chat"     as const, Icon: IconChat,     minTier: "free"  as const, href: null as string | null },
  { key: "history"  as DevPlayerTab, tabKey: "history"  as const, Icon: IconClock,    minTier: "free"  as const, href: null as string | null },
  { key: "today"    as DevPlayerTab, tabKey: "team"     as const, Icon: IconTeam,     minTier: "free"  as const, href: "/team" as string | null },
  { key: "strength" as DevPlayerTab, tabKey: "strength" as const, Icon: IconDumbbell, minTier: "pro"   as const, href: null as string | null },
  { key: "vald"     as DevPlayerTab, tabKey: "vald"     as const, Icon: IconZap,      minTier: "elite" as const, href: null as string | null },
  { key: "privacy"  as DevPlayerTab, tabKey: "privacy"  as const, Icon: IconShield,   minTier: "free"  as const, href: null as string | null },
];

// Kept for backwards-compat with anything still importing the old name.
const PWA_NAV_TAB_KEYS = [...PWA_PRIMARY_TABS, ...PWA_SECONDARY_TABS];
void PWA_NAV_TAB_KEYS;

function PWABottomNav({
  activeTab,
  onChange,
  planTier,
  unreadChatCount = 0,
  hideWellness = false,
}: {
  activeTab: DevPlayerTab;
  onChange: (tab: DevPlayerTab) => void;
  planTier: PlanTier;
  unreadChatCount?: number;
  /** GPS-only team mode: hide RPE (and any future wellness tabs) from
   *  the bottom nav. The slot stays balanced because primary tabs without
   *  RPE come to 3 + More button = 4. */
  hideWellness?: boolean;
}) {
  const router = useRouter();
  const isAtLeastPro = planTier === "PRO" || planTier === "ELITE";
  const isElite = planTier === "ELITE";
  const [lang] = useLang();
  const tabs = PLAYER_COPY[lang].tabs;
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryTabs = PWA_PRIMARY_TABS;
  // RPE now lives in the More-sheet; when wellness is hidden for this player,
  // drop it there (previously it was filtered out of the primary bar).
  const secondaryTabs = hideWellness
    ? PWA_SECONDARY_TABS.filter((t) => t.key !== "rpe")
    : PWA_SECONDARY_TABS;

  function isLocked(tier: string) {
    return (tier === "pro" && !isAtLeastPro) || (tier === "elite" && !isElite);
  }

  function tabIsActive(key: DevPlayerTab, href: string | null) {
    return !href && activeTab === key;
  }

  // True if the active tab is one of the secondary (More-sheet) entries —
  // we highlight the More button in that case so the user knows where they
  // are. Skip entries whose `key` collides with a primary (eg. "team" maps
  // to key:"today" via href:"/team" — that's an href-only entry).
  const secondaryActive = secondaryTabs.some(
    (t) => !t.href && t.key === activeTab,
  );

  const moreLabel = lang === "IS" ? "Meira" : "More";

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-zinc-200"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex">
          {primaryTabs.map(({ key, tabKey, Icon, minTier, href }) => {
            const label = tabs[tabKey] ?? tabKey;
            const locked = isLocked(minTier);
            const isActive = tabIsActive(key, href);
            const showBadge = key === "chat" && unreadChatCount > 0 && !isActive;
            return (
              <button
                key={tabKey}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors relative ${
                  isActive ? "text-green-700" : locked ? "text-zinc-300" : "text-zinc-500"
                }`}
                onClick={() => {
                  if (locked) return;
                  if (href) { router.push(href); return; }
                  onChange(key);
                }}
                aria-label={label}
              >
                <div className="relative">
                  <Icon active={isActive} />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2.5 flex items-center justify-center min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[9px] font-bold text-white">
                      {unreadChatCount > 99 ? "99+" : unreadChatCount}
                    </span>
                  )}
                </div>
                <span className={`text-[11px] font-medium tracking-tight mt-0.5 ${isActive ? "text-green-700" : locked ? "text-zinc-300" : "text-zinc-500"}`}>
                  {label}
                </span>
              </button>
            );
          })}
          <button
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
              secondaryActive ? "text-green-700" : "text-zinc-500"
            }`}
            onClick={() => setMoreOpen(true)}
            aria-label={moreLabel}
          >
            <IconMoreH active={secondaryActive} />
            <span className={`text-[11px] font-medium tracking-tight mt-0.5 ${secondaryActive ? "text-green-700" : "text-zinc-500"}`}>
              {moreLabel}
            </span>
          </button>
        </div>
      </nav>

      {/* More-sheet — opens upward, lists secondary tabs as a grid. Tap
          anywhere outside or on a tab to close. Sized so it never collides
          with the bottom nav. */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40"
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-2xl shadow-lg border-t border-zinc-200"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {moreLabel}
              </span>
              <button
                onClick={() => setMoreOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 -m-2 p-2"
                aria-label={lang === "IS" ? "Loka" : "Close"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 px-3 pb-3">
              {secondaryTabs.map(({ key, tabKey, Icon, minTier, href }) => {
                const label = tabs[tabKey] ?? tabKey;
                const locked = isLocked(minTier);
                const isActive = tabIsActive(key, href);
                return (
                  <button
                    key={tabKey}
                    className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border transition-colors ${
                      isActive
                        ? "border-green-200 bg-green-50 text-green-700"
                        : locked
                          ? "border-zinc-100 text-zinc-300"
                          : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                    }`}
                    onClick={() => {
                      if (locked) return;
                      setMoreOpen(false);
                      if (href) { router.push(href); return; }
                      onChange(key);
                    }}
                    aria-label={label}
                  >
                    <Icon active={isActive} />
                    <span className="text-xs font-medium">{label}</span>
                    {locked && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
                        {minTier === "elite" ? "ELITE" : "PRO"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Sign out — always reachable here in the mobile shell (the
                desktop header's sign-out isn't shown in the PWA layout). */}
            <div className="px-3 pb-3">
              <button
                onClick={async () => {
                  setMoreOpen(false);
                  await supabase.auth.signOut();
                  window.location.href = "/login";
                }}
                className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm font-semibold text-zinc-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                {lang === "IS" ? "Útskrá" : "Sign out"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default function DevPlayerClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [lang] = useLang();
  const activeTab = useMemo(() => normalizeDevPlayerTab(searchParams?.get("tab")), [searchParams]);
  const [tabsMountNode, setTabsMountNode] = useState<HTMLElement | null>(null);
  const [panelMountNode, setPanelMountNode] = useState<HTMLElement | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);

  // ── Plan tier + club branding + player info for chat ──────────────────────────────
  const [planTier, setPlanTier] = useState<PlanTier>("FREE");
  const [clubThemeColor, setClubThemeColor] = useState<string | null>(null);
  const [chatPlayerId, setChatPlayerId] = useState<string | null>(null);
  const [chatPlayerName, setChatPlayerName] = useState<string>("Leikmaður");
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadPlanTier() {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id, player_id, display_name")
        .eq("id", userId)
        .maybeSingle();

      if (alive && (prof as any)?.player_id) {
        setChatPlayerId((prof as any).player_id);
        setChatPlayerName((prof as any).display_name || "Leikmaður");
      }

      const tid = (prof as any)?.team_id;
      if (!tid || !alive) return;
      setTeamId(tid);

      const { data: team } = await supabase
        .from("teams")
        .select("plan_tier, club_theme_color")
        .eq("id", tid)
        .maybeSingle();

      if (alive && team) {
        setPlanTier(((team as any).plan_tier as PlanTier) ?? "FREE");
        setClubThemeColor((team as any).club_theme_color ?? null);
      }
    }
    loadPlanTier();
    return () => { alive = false; };
  }, []);

  const isAtLeastPro = planTier === "PRO" || planTier === "ELITE";
  const isElite = planTier === "ELITE";
  const isPwa = usePwaMode();
  const unreadChatCount = useUnreadCount(chatPlayerId, "player");

  // GPS-only team mode: hide check-in / RPE / wearable / decision UI for
  // players whose team is running on objective-data-only mode.
  const teamMode = useTeamMode(teamId);
  const hideWellness = isGpsOnly(teamMode);

  // If on a locked tab, redirect to today
  useEffect(() => {
    const proOnlyTabs = new Set<DevPlayerTab>(["dashboard", "risk", "rpe", "strength"]);
    const eliteOnlyTabs = new Set<DevPlayerTab>(["vald"]);
    const tabLocked =
      (!isAtLeastPro && proOnlyTabs.has(activeTab)) ||
      (!isElite && eliteOnlyTabs.has(activeTab));
    if (tabLocked) {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("tab");
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [activeTab, isAtLeastPro, isElite, pathname, router, searchParams]);
  const [dailyDecision, setDailyDecision] = useState<NormalizedPlayerDailyDecision>({
    playerState: "GRAY",
    sessionMode: "pending",
    mdContext: null,
    emphasis: emphasisTextForState("GRAY"),
    message: null,
    why: null,
    adjustments: {},
  });

  useEffect(() => {
    let cancelled = false;

    async function ensureAuth() {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;

      if (error || !data.user) {
        const qs = searchParams?.toString();
        const next = `${pathname}${qs ? `?${qs}` : ""}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    }

    ensureAuth();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let observer: MutationObserver | null = null;
    setLayoutReady(false);

    // Safety timeout: if DOM detection never finds the expected cards
    // (e.g. auth failure, no plan, pending status), force visibility after 6s
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        setLayoutReady(true);
      }
    }, 6000);

    const apply = () => {
      if (cancelled) return;
      attempts += 1;
      const header = detectHeaderCard();
      const decisionCard = detectDecisionHeroCard();
      const metricsCard = detectCardByKey("metrics") ?? detectCardByTitle("Mælingar dagsins") ?? detectCardByTitle("Today's Measurements");
      const riskCard = detectCardByKey("risk") ?? detectCardByTitle("Player Risk Trend");
      const rpeCard = detectRpeCard();
      const valdCard = detectValdCard();
      const leftColumn = (decisionCard?.parentElement as HTMLElement | null) ?? null;
      const mainGrid = (leftColumn?.parentElement as HTMLElement | null) ?? null;
      const rightColumn = (mainGrid?.children?.[1] as HTMLElement | null) ?? null;

      if (!header || !decisionCard || !mainGrid) {
        if (attempts < 30) window.setTimeout(apply, 200);
        return;
      }

      const nextDecision = buildNormalizedDailyDecision();
      setDailyDecision(nextDecision);

      const tabsSlot = ensureTabSlot("dev-player-tabs-slot", header);
      const panelSlot = tabsSlot ? ensureTabSlot("dev-player-tab-panel-slot", tabsSlot) : null;
      setTabsMountNode((prev) => (prev === tabsSlot ? prev : tabsSlot));
      setPanelMountNode((prev) => (prev === panelSlot ? prev : panelSlot));

      applyStickyPlayerHeroLayout(header, activeTab);

      // PWA: hide top tabs slot (bottom nav handles navigation), add body padding
      if (tabsSlot) tabsSlot.style.display = isPwa ? "none" : "";
      const pageRoot = mainGrid?.closest(".min-h-screen") as HTMLElement | null;
      if (pageRoot) pageRoot.style.paddingBottom = isPwa ? "calc(68px + env(safe-area-inset-bottom))" : "";

      const showToday = activeTab === "today";
      const showHistory = activeTab === "history";
      const showDashboard = activeTab === "dashboard";
      const showRisk = activeTab === "risk";
      const showRpe = activeTab === "rpe";
      const showVald = activeTab === "vald";
      const showStrength = activeTab === "strength";
      const showChat = activeTab === "chat";
      const showPrivacy = activeTab === "privacy";
      const showGameReport = activeTab === "gamereport";
      const showMovement = activeTab === "movement";
      const expandContent = showHistory || showDashboard || showRisk || showRpe || showVald || showStrength || showChat || showPrivacy || showGameReport || showMovement;

      decisionCard.style.display = showToday ? "" : "none";
      // Session card is a portal-injected slot (rendered by PlayerClient) that
      // lives outside the left/right columns, so toggle it here like the decision.
      const sessionSlot = document.getElementById("dev-today-session-slot");
      if (sessionSlot) sessionSlot.style.display = showToday ? "" : "none";
      if (metricsCard) metricsCard.style.display = showDashboard ? "" : "none";
      if (riskCard) riskCard.style.display = showRisk ? "" : "none";
      if (rpeCard) rpeCard.style.display = showRpe ? "" : "none";
      // Hide the existing VALD card from Today — it lives in the Neuromuscular Testing tab now
      if (valdCard) valdCard.style.display = "none";
      if (rightColumn) rightColumn.style.display = showToday ? "" : "none";

      mainGrid.style.gridTemplateColumns = expandContent ? "minmax(0, 1fr)" : "";

      if (leftColumn) {
        leftColumn.style.maxWidth = expandContent ? "none" : "";
        leftColumn.style.width = expandContent ? "100%" : "";
      }

      if (metricsCard) {
        metricsCard.style.maxWidth = showDashboard ? "none" : "";
        metricsCard.style.width = showDashboard ? "100%" : "";
        applyDashboardMetricsLayout(metricsCard, showDashboard);
      }

      if (leftColumn) {
        const cards = Array.from(leftColumn.children) as HTMLElement[];
        for (const card of cards) {
          if (card.id === "dev-player-tabs-slot") {
            card.style.display = "";
            continue;
          }
          if (card.id === "dev-player-tab-panel-slot") {
            card.style.display = showToday ? "none" : "";
            continue;
          }
          if (card === decisionCard) {
            card.style.display = showToday ? "" : "none";
            continue;
          }
          if (metricsCard && card === metricsCard) {
            card.style.display = showDashboard ? "" : "none";
            continue;
          }
          if (riskCard && card === riskCard) {
            card.style.display = showRisk ? "" : "none";
            continue;
          }
          if (rpeCard && card === rpeCard) {
            card.style.display = showRpe ? "" : "none";
            continue;
          }
          if (valdCard && card === valdCard) {
            // Always hide the old VALD card — new tab has its own component
            card.style.display = "none";
            continue;
          }
          // Our own injected Today portals (See-more links, RPE nudge) must NOT
          // be caught by the "hide unknown cards" default — show them on Today.
          if (card.id === "dev-today-more-slot" || card.id === "dev-rpe-reminder-slot") {
            card.style.display = showToday ? "" : "none";
            continue;
          }
          // Default: hide unknown legacy cards so tabs stay focused.
          card.style.display = "none";
        }
      }

      // On history tab, hide all left-column cards (history renders in the portal slot)
      if (leftColumn && showHistory) {
        const cards = Array.from(leftColumn.children) as HTMLElement[];
        for (const card of cards) {
          if (card.id === "dev-player-tabs-slot") continue;
          card.style.display = "none";
        }
      }

      refineLegacyDecisionCard(nextDecision);
      enforceRenderedWorkoutBlocks(nextDecision);
      setLayoutReady(true);

      if (attempts < 10) window.setTimeout(apply, 250);
    };

    observer = new MutationObserver(() => {
      if (!cancelled) apply();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    apply();
    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      observer?.disconnect();
    };
  }, [activeTab, isPwa]);

  function setTab(tab: DevPlayerTab) {
    // Block navigation to locked tabs
    if (!isAtLeastPro && (tab === "dashboard" || tab === "risk" || tab === "rpe")) return;
    if (!isElite && tab === "vald") return;
    if (!isAtLeastPro && tab === "strength") return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (tab === "today") params.delete("tab");
    else params.set("tab", tab);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  const riskViewModel = buildDevPlayerRiskViewModel({
    playerState: dailyDecision.playerState,
    message: dailyDecision.message,
    why: dailyDecision.why,
    mdContext: dailyDecision.mdContext,
  });
  const tabsElement = <DevPlayerTabs activeTab={activeTab} onChange={setTab} planTier={planTier} />;

  const tabbedShellCss = `
        .dev-player-tabbed-shell[data-player-active-tab="today"] [data-player-card="metrics"],
        .dev-player-tabbed-shell[data-player-active-tab="today"] [data-player-card="risk"],
        .dev-player-tabbed-shell[data-player-active-tab="today"] [data-player-card="rpe"],
        .dev-player-tabbed-shell[data-player-active-tab="today"] [data-player-card="reminders"],
        .dev-player-tabbed-shell[data-player-active-tab="today"] [data-player-card="vald"] {
          display: none !important;
        }

        .dev-player-tabbed-shell[data-player-active-tab="dashboard"] [data-player-card="decision"],
        .dev-player-tabbed-shell[data-player-active-tab="dashboard"] [data-player-card="risk"],
        .dev-player-tabbed-shell[data-player-active-tab="dashboard"] [data-player-card="rpe"],
        .dev-player-tabbed-shell[data-player-active-tab="dashboard"] [data-player-card="reminders"],
        .dev-player-tabbed-shell[data-player-active-tab="dashboard"] [data-player-card="vald"] {
          display: none !important;
        }

        .dev-player-tabbed-shell[data-player-active-tab="risk"] [data-player-card="decision"],
        .dev-player-tabbed-shell[data-player-active-tab="risk"] [data-player-card="metrics"],
        .dev-player-tabbed-shell[data-player-active-tab="risk"] [data-player-card="rpe"],
        .dev-player-tabbed-shell[data-player-active-tab="risk"] [data-player-card="reminders"],
        .dev-player-tabbed-shell[data-player-active-tab="risk"] [data-player-card="vald"] {
          display: none !important;
        }

        .dev-player-tabbed-shell[data-player-active-tab="rpe"] [data-player-card="decision"],
        .dev-player-tabbed-shell[data-player-active-tab="rpe"] [data-player-card="metrics"],
        .dev-player-tabbed-shell[data-player-active-tab="rpe"] [data-player-card="risk"],
        .dev-player-tabbed-shell[data-player-active-tab="rpe"] [data-player-card="reminders"],
        .dev-player-tabbed-shell[data-player-active-tab="rpe"] [data-player-card="vald"] {
          display: none !important;
        }

        .dev-player-tabbed-shell[data-player-active-tab="vald"] [data-player-card="decision"],
        .dev-player-tabbed-shell[data-player-active-tab="vald"] [data-player-card="metrics"],
        .dev-player-tabbed-shell[data-player-active-tab="vald"] [data-player-card="risk"],
        .dev-player-tabbed-shell[data-player-active-tab="vald"] [data-player-card="rpe"],
        .dev-player-tabbed-shell[data-player-active-tab="vald"] [data-player-card="reminders"],
        .dev-player-tabbed-shell[data-player-active-tab="vald"] [data-player-card="vald"] {
          display: none !important;
        }

        .dev-player-tabbed-shell[data-player-active-tab="history"] [data-player-card="decision"],
        .dev-player-tabbed-shell[data-player-active-tab="history"] [data-player-card="metrics"],
        .dev-player-tabbed-shell[data-player-active-tab="history"] [data-player-card="risk"],
        .dev-player-tabbed-shell[data-player-active-tab="history"] [data-player-card="rpe"],
        .dev-player-tabbed-shell[data-player-active-tab="history"] [data-player-card="reminders"],
        .dev-player-tabbed-shell[data-player-active-tab="history"] [data-player-card="vald"] {
          display: none !important;
        }

        .dev-player-tabbed-shell[data-player-active-tab="strength"] [data-player-card="decision"],
        .dev-player-tabbed-shell[data-player-active-tab="strength"] [data-player-card="metrics"],
        .dev-player-tabbed-shell[data-player-active-tab="strength"] [data-player-card="risk"],
        .dev-player-tabbed-shell[data-player-active-tab="strength"] [data-player-card="rpe"],
        .dev-player-tabbed-shell[data-player-active-tab="strength"] [data-player-card="reminders"],
        .dev-player-tabbed-shell[data-player-active-tab="strength"] [data-player-card="vald"] {
          display: none !important;
        }
      `;

  return (
    <>
      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: tabbedShellCss }} />
      {!isPwa && !tabsMountNode ? (
        <div className="mx-auto w-full max-w-[1200px] px-4 pt-4">
          {tabsElement}
        </div>
      ) : null}
      {activeTab === "today" && (
        <div className="mx-auto w-full max-w-[1200px] px-4 pt-3">
          <PlayerBreakBanner lang={lang as "IS" | "EN"} />
        </div>
      )}
      <div
        className="dev-player-tabbed-shell"
        data-player-active-tab={activeTab}
        style={{ visibility: layoutReady ? "visible" : "hidden" }}
      >
        <PlayerClient />
      </div>
      {/* Decision card depends on wellness check-in data — hide it entirely
          in GPS-only team mode (would otherwise show "PENDING" forever). */}
      {!hideWellness && <AteCommandCardPortal activeTab={activeTab} clubThemeColor={clubThemeColor} lang={lang as "IS" | "EN"} />}
      {/* Today's expected load — a forward-looking "what's coming today" outlook
          (effort band, duration, focus, % of a match) + the player's own target.
          Self-hides on off-days / when there's no plan. Not gated by wellness. */}
      <PlayerTodayLoadPortal activeTab={activeTab} lang={lang as "IS" | "EN"} clubThemeColor={clubThemeColor} />
      {/* Today recap — the evening "close the loop": predicted vs actual + one
          honest insight. Appears only once a real session lands (self-hides
          otherwise). Health-first framing; over-plan is a recovery nudge. */}
      <PlayerTodayRecapPortal activeTab={activeTab} lang={lang as "IS" | "EN"} clubThemeColor={clubThemeColor} />
      {/* Return-to-training progress — an encouraging "where am I in my ramp"
          card, shown on Today only while the player has an active graded-return
          plan (self-hides otherwise). Not gated by wellness: an injured player
          on a GPS-only team still ramps. */}
      <PlayerRttProgressPortal activeTab={activeTab} lang={lang as "IS" | "EN"} clubThemeColor={clubThemeColor} />
      {/* Contextual RPE nudge — appears on Today only when a session is expected
          and RPE is unlogged; taps through to the RPE tab (round 14a). Gated to
          Pro+ since the RPE tab itself is Pro-locked (don't nudge to a locked tab). */}
      {isAtLeastPro && <RpeReminderPortal activeTab={activeTab} lang={lang as "IS" | "EN"} onLogRpe={() => setTab("rpe")} />}
      {/* NOTE: the player's "why am I this colour?" explanation lives in
          PlayerClient's inline decision-explanation card ("Af hverju er ég
          ekki græn/n?"), not a portal. The earlier PlayerWhyFlaggedCard
          portal was removed 2026-05-28 — it duplicated that inline card and
          (being portal-mounted) sometimes failed to appear. One reliable
          inline explanation surface, mirroring the coach Daily Briefing. */}
      {/* "See more" (Skoða meira) — quiet links to Game / Movement / Overview at
          the bottom of Today, replacing the old last-match + weekly-digest cards
          (round 14a). Their content lives on their own tabs, one tap away. */}
      <TodayMorePortal activeTab={activeTab} lang={lang as "IS" | "EN"} onOpen={setTab} />
      {/* Opt-in toggles for the daily nudges — bottom of Today, shown once push
          is granted. Off by default; easy to turn on/off. */}
      <PlayerNudgePrefsPortal activeTab={activeTab} lang={lang as "IS" | "EN"} />
      {/* Top tabs — hidden in PWA mode (bottom nav used instead) */}
      {!isPwa && tabsMountNode
        ? createPortal(tabsElement, tabsMountNode)
        : null}
      {/* Tab panel content */}
      {panelMountNode
        ? createPortal(
            <div className="mt-3">
              {activeTab === "history" && <DevPlayerHistoryTab />}
              {activeTab === "risk" && <DevPlayerRiskTab viewModel={riskViewModel} />}
              {activeTab === "vald" && <DevPlayerVALDTab />}
              {activeTab === "strength" && <DevPlayerStrengthTab />}
              {activeTab === "gamereport" && (
                <div className="space-y-4">
                  <PlayerGameReportCard lang={lang as "IS" | "EN"} />
                </div>
              )}
              {activeTab === "movement" && (
                <div className="mx-auto max-w-lg pb-24">
                  <PlayerMatchMovementCard />
                </div>
              )}
              {activeTab === "chat" && chatPlayerId && (
                <div className="mx-auto max-w-lg pb-24">
                  <ChatThread
                    playerId={chatPlayerId}
                    playerName={chatPlayerName}
                    entryDate={new Date().toISOString().slice(0, 10)}
                    viewerRole="player"
                    compact={false}
                  />
                </div>
              )}
              {activeTab === "privacy" && (
                <div className="mx-auto max-w-3xl pb-24">
                  <PlayerAccessPanel
                    playerId={chatPlayerId}
                    lang={lang as "IS" | "EN"}
                  />
                </div>
              )}
            </div>,
            panelMountNode
          )
        : null}
      {/* Floating chat bubble — shown on Today tab in PWA mode */}
      {isPwa && activeTab === "today" && chatPlayerId && (
        <FloatingChatBubble
          playerId={chatPlayerId}
          playerName={chatPlayerName}
          entryDate={new Date().toISOString().slice(0, 10)}
          unreadCount={unreadChatCount}
          isPwa
        />
      )}
      {/* Non-PWA floating chat bubble */}
      {!isPwa && activeTab === "today" && chatPlayerId && (
        <FloatingChatBubble
          playerId={chatPlayerId}
          playerName={chatPlayerName}
          entryDate={new Date().toISOString().slice(0, 10)}
          unreadCount={unreadChatCount}
        />
      )}
      {/* Notification opt-in prompt — shows in PWA AND browser. Browser permission
          ask works on Android Chrome + desktop; iOS Safari outside standalone
          gets an "install as PWA" message instead (iOS only supports push from
          installed PWAs). Component self-gates based on platform + permission.
          Was previously gated to PWA-only which created a chicken-and-egg
          problem and contributed to 17-50% adoption rates on new clubs. */}
      <PWANotificationPrompt />
      {/* PWA bottom navigation bar */}
      {isPwa && <PWABottomNav activeTab={activeTab} onChange={setTab} planTier={planTier} unreadChatCount={unreadChatCount} hideWellness={hideWellness} />}
    </>
  );
}
