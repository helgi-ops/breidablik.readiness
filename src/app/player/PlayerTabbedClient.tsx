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
import {
  buildDevPlayerRiskViewModel,
  normalizeDevPlayerTab,
  type DevPlayerTab,
} from "@/lib/micropulse/playerDashboard/devPlayerViewModel";
import { supabase } from "@/lib/supabaseClient";
import FloatingChatBubble from "@/components/chat/FloatingChatBubble";
import ChatThread from "@/components/chat/ChatThread";
import { useUnreadCount } from "@/components/chat/useUnreadCount";

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

function AteCommandCardPortal({ activeTab, clubThemeColor }: { activeTab: DevPlayerTab; clubThemeColor?: string | null }) {
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
    dailyDecision.playerState === "GREEN" ? "#22c55e" :
    dailyDecision.playerState === "YELLOW" ? "#eab308" :
    dailyDecision.playerState === "RED" ? "#ef4444" :
    "#94a3b8";

  const stateLabel =
    dailyDecision.playerState === "GREEN" ? "GREEN" :
    dailyDecision.playerState === "YELLOW" ? "YELLOW" :
    dailyDecision.playerState === "RED" ? "RED" :
    "PENDING";

  // Use the team colour directly as the card background (white text stays readable
  // on typical dark/medium sports-team colours). Falls back to slate-900 when unset.
  const cardBg = clubThemeColor ?? "#0f172a";

  return createPortal(
    <div
      className="mt-3 rounded-xl p-4"
      style={{ background: cardBg }}
    >
      <div className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Today</div>
      <div className="mt-1 text-base font-bold tracking-tight text-white">{copy.title}</div>
      <div className="mt-1 text-sm leading-relaxed text-slate-300">{copy.body}</div>
      <div className="mt-1 text-xs text-slate-400">{copy.secondary}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: "rgba(255,255,255,0.10)", color: "white" }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: chipColor }} />
          {stateLabel}
        </span>
        {dailyDecision.sessionMode !== "pending" && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: "rgba(255,255,255,0.10)", color: "#cbd5e1" }}
          >
            {dailyDecision.sessionMode === "full" ? "Full session" :
             dailyDecision.sessionMode === "modified" ? "Modified session" :
             "Recovery session"}
          </span>
        )}
      </div>
    </div>,
    mountNode
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

// ── PWA bottom navigation bar ────────────────────────────────────────────────

const PWA_NAV_TAB_KEYS = [
  { key: "today"     as DevPlayerTab, tabKey: "today"     as const, Icon: IconHome,     minTier: "free"  as const, href: null as string | null },
  { key: "rpe"       as DevPlayerTab, tabKey: "rpe"       as const, Icon: IconActivity, minTier: "pro"   as const, href: null as string | null },
  { key: "dashboard" as DevPlayerTab, tabKey: "dashboard" as const, Icon: IconBarChart, minTier: "pro"   as const, href: null as string | null },
  { key: "chat"      as DevPlayerTab, tabKey: "chat"      as const, Icon: IconChat,     minTier: "free"  as const, href: null as string | null },
  { key: "today"     as DevPlayerTab, tabKey: "team"      as const, Icon: IconTeam,     minTier: "free"  as const, href: "/team" as string | null },
  { key: "strength"  as DevPlayerTab, tabKey: "strength"  as const, Icon: IconDumbbell, minTier: "pro"   as const, href: null as string | null },
  { key: "history"   as DevPlayerTab, tabKey: "history"   as const, Icon: IconClock,    minTier: "free"  as const, href: null as string | null },
  { key: "vald"      as DevPlayerTab, tabKey: "vald"      as const, Icon: IconZap,      minTier: "elite" as const, href: null as string | null },
];

function PWABottomNav({
  activeTab,
  onChange,
  planTier,
  unreadChatCount = 0,
}: {
  activeTab: DevPlayerTab;
  onChange: (tab: DevPlayerTab) => void;
  planTier: PlanTier;
  unreadChatCount?: number;
}) {
  const router = useRouter();
  const isAtLeastPro = planTier === "PRO" || planTier === "ELITE";
  const isElite = planTier === "ELITE";
  const [lang] = useLang();
  const tabs = PLAYER_COPY[lang].tabs;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-zinc-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex">
        {PWA_NAV_TAB_KEYS.map(({ key, tabKey, Icon, minTier, href }) => {
          const label = tabs[tabKey] ?? tabKey;
          const tier = minTier as string;
          const locked =
            (tier === "pro" && !isAtLeastPro) ||
            (tier === "elite" && !isElite);
          const isActive = !href && activeTab === key;
          const showBadge = key === "chat" && unreadChatCount > 0 && !isActive;
          return (
            <button
              key={tabKey}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors relative ${
                isActive ? "text-green-700" : locked ? "text-zinc-300" : "text-zinc-400"
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
              <span className={`text-[9px] font-semibold tracking-wide ${isActive ? "text-green-700" : locked ? "text-zinc-300" : "text-zinc-400"}`}>
                {label.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default function DevPlayerClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = useMemo(() => normalizeDevPlayerTab(searchParams?.get("tab")), [searchParams]);
  const [tabsMountNode, setTabsMountNode] = useState<HTMLElement | null>(null);
  const [panelMountNode, setPanelMountNode] = useState<HTMLElement | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);

  // ── Plan tier + club branding + player info for chat ──────────────────────────────
  const [planTier, setPlanTier] = useState<PlanTier>("FREE");
  const [clubThemeColor, setClubThemeColor] = useState<string | null>(null);
  const [chatPlayerId, setChatPlayerId] = useState<string | null>(null);
  const [chatPlayerName, setChatPlayerName] = useState<string>("Leikmaður");

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

      const teamId = (prof as any)?.team_id;
      if (!teamId || !alive) return;

      const { data: team } = await supabase
        .from("teams")
        .select("plan_tier, club_theme_color")
        .eq("id", teamId)
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
      const expandContent = showHistory || showDashboard || showRisk || showRpe || showVald || showStrength || showChat;

      decisionCard.style.display = showToday ? "" : "none";
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
      <div
        className="dev-player-tabbed-shell"
        data-player-active-tab={activeTab}
        style={{ visibility: layoutReady ? "visible" : "hidden" }}
      >
        <PlayerClient />
      </div>
      <AteCommandCardPortal activeTab={activeTab} clubThemeColor={clubThemeColor} />
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
      {/* PWA notification opt-in prompt (only in PWA mode, only when not yet subscribed) */}
      {isPwa && <PWANotificationPrompt />}
      {/* PWA bottom navigation bar */}
      {isPwa && <PWABottomNav activeTab={activeTab} onChange={setTab} planTier={planTier} unreadChatCount={unreadChatCount} />}
    </>
  );
}
