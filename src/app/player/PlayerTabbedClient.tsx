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
import PWANotificationPrompt from "./dev-player-dashboard/PWANotificationPrompt";
import {
  buildDevPlayerRiskViewModel,
  normalizeDevPlayerTab,
  type DevPlayerTab,
} from "@/lib/micropulse/playerDashboard/devPlayerViewModel";
import { supabase } from "@/lib/supabaseClient";

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
  const rail = document.getElementById("dev-player-sticky-rail") as HTMLElement | null;
  const tabsSlot = document.getElementById("dev-player-tabs-slot") as HTMLElement | null;
  const commandSlot = document.getElementById("dev-ate-command-card-slot") as HTMLElement | null;
  const topOffset = 0;

  if (rail) {
    rail.style.position = "sticky";
    rail.style.top = `${topOffset}px`;
    rail.style.zIndex = "30";
    rail.style.background = "rgba(255,255,255,0.94)";
    rail.style.backdropFilter = "blur(10px)";
    (rail.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = "blur(10px)";
    rail.style.paddingBottom = activeTab === "today" ? "8px" : "0px";
  }

  header.style.position = "";
  header.style.top = "";
  header.style.zIndex = "";
  header.style.background = "";
  header.style.backdropFilter = "";
  (header.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = "";

  if (tabsSlot) {
    tabsSlot.style.position = "";
    tabsSlot.style.top = "";
    tabsSlot.style.zIndex = "";
    tabsSlot.style.background = "";
    tabsSlot.style.paddingBottom = "6px";
  }

  if (!commandSlot) return;

  commandSlot.style.position = "";
  commandSlot.style.top = "";
  commandSlot.style.zIndex = "";
  commandSlot.style.background = "";
  commandSlot.style.paddingTop = activeTab === "today" ? "4px" : "";
  commandSlot.style.paddingBottom = activeTab === "today" ? "4px" : "";
  commandSlot.style.marginBottom = activeTab === "today" ? "4px" : "";
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

function ensureStickyRail(header: HTMLElement): HTMLElement | null {
  const parent = header.parentElement;
  if (!parent) return null;

  let rail = document.getElementById("dev-player-sticky-rail") as HTMLElement | null;
  if (!rail) {
    rail = document.createElement("div");
    rail.id = "dev-player-sticky-rail";
    rail.style.width = "100%";
  }

  if (rail.parentElement !== parent) {
    parent.insertBefore(rail, header);
  }

  if (header.parentElement !== rail) {
    rail.appendChild(header);
  }

  return rail;
}

function ensureRailChildSlot(id: string, rail: HTMLElement): HTMLElement | null {
  let slot = document.getElementById(id) as HTMLElement | null;
  if (!slot) {
    slot = document.createElement("div");
    slot.id = id;
  }
  if (slot.parentElement !== rail) {
    rail.appendChild(slot);
  }
  return slot;
}

function ensurePanelSlotOutsideRail(id: string, rail: HTMLElement): HTMLElement | null {
  const parent = rail.parentElement;
  if (!parent) return null;

  let slot = document.getElementById(id) as HTMLElement | null;
  if (!slot) {
    slot = document.createElement("div");
    slot.id = id;
    slot.className = "mt-3";
    slot.style.width = "100%";
  }

  if (slot.parentElement !== parent) {
    parent.insertBefore(slot, rail.nextSibling);
  } else if (slot.previousElementSibling !== rail) {
    parent.insertBefore(slot, rail.nextSibling);
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

function AteCommandCardPortal({ activeTab }: { activeTab: DevPlayerTab }) {
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

  return createPortal(
    <div
      className="mt-3 rounded-xl p-4"
      style={{ background: "#0f172a" }}
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

// ── PWA bottom navigation bar ────────────────────────────────────────────────

const PWA_NAV_TAB_KEYS = [
  { key: "today"     as DevPlayerTab, tabKey: "today"     as const, Icon: IconHome,     minTier: "free"  as const },
  { key: "rpe"       as DevPlayerTab, tabKey: "rpe"       as const, Icon: IconActivity, minTier: "pro"   as const },
  { key: "dashboard" as DevPlayerTab, tabKey: "dashboard" as const, Icon: IconBarChart, minTier: "pro"   as const },
  { key: "history"   as DevPlayerTab, tabKey: "history"   as const, Icon: IconClock,    minTier: "free"  as const },
  { key: "vald"      as DevPlayerTab, tabKey: "vald"      as const, Icon: IconZap,      minTier: "elite" as const },
];

function PWABottomNav({
  activeTab,
  onChange,
  planTier,
}: {
  activeTab: DevPlayerTab;
  onChange: (tab: DevPlayerTab) => void;
  planTier: PlanTier;
}) {
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
        {PWA_NAV_TAB_KEYS.map(({ key, tabKey, Icon, minTier }) => {
          const label = tabs[tabKey];
          const locked =
            (minTier === "pro" && !isAtLeastPro) ||
            (minTier === "elite" && !isElite);
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? "text-green-700" : locked ? "text-zinc-300" : "text-zinc-400"
              }`}
              onClick={() => !locked && onChange(key)}
              aria-label={label}
            >
              <Icon active={isActive} />
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

  // ── Plan tier ──────────────────────────────────────────────
  const [planTier, setPlanTier] = useState<PlanTier>("FREE");

  useEffect(() => {
    let alive = true;
    async function loadPlanTier() {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", userId)
        .maybeSingle();

      const teamId = (prof as any)?.team_id;
      if (!teamId || !alive) return;

      const { data: team } = await supabase
        .from("teams")
        .select("plan_tier")
        .eq("id", teamId)
        .maybeSingle();

      if (alive && team) setPlanTier(((team as any).plan_tier as PlanTier) ?? "FREE");
    }
    loadPlanTier();
    return () => { alive = false; };
  }, []);

  const isAtLeastPro = planTier === "PRO" || planTier === "ELITE";
  const isElite = planTier === "ELITE";
  const isPwa = usePwaMode();

  // If on a locked tab, redirect to today
  useEffect(() => {
    const proOnlyTabs = new Set<DevPlayerTab>(["dashboard", "risk", "rpe"]);
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

      const stickyRail = ensureStickyRail(header);
      const tabsSlot = stickyRail ? ensureRailChildSlot("dev-player-tabs-slot", stickyRail) : ensureTabSlot("dev-player-tabs-slot", header);
      const commandSlot = stickyRail ? ensureRailChildSlot("dev-ate-command-card-slot", stickyRail) : null;
      const panelSlot = stickyRail ? ensurePanelSlotOutsideRail("dev-player-tab-panel-slot", stickyRail) : (tabsSlot ? ensureTabSlot("dev-player-tab-panel-slot", tabsSlot) : null);
      setTabsMountNode((prev) => (prev === tabsSlot ? prev : tabsSlot));
      setPanelMountNode((prev) => (prev === panelSlot ? prev : panelSlot));
      void commandSlot;

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
      const expandContent = showHistory || showDashboard || showRisk || showRpe || showVald;

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
          // History tab: hide all legacy cards (History renders its own content)
          card.style.display = (showToday || showHistory) ? "" : "none";
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

      if (attempts < 10) window.setTimeout(apply, 250);
    };

    apply();
    return () => {
      cancelled = true;
    };
  }, [activeTab, isPwa]);

  function setTab(tab: DevPlayerTab) {
    // Block navigation to locked tabs
    if (!isAtLeastPro && (tab === "dashboard" || tab === "risk" || tab === "rpe")) return;
    if (!isElite && tab === "vald") return;
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

  return (
    <>
      <PlayerClient />
      <AteCommandCardPortal activeTab={activeTab} />
      {/* Top tabs — hidden in PWA mode (bottom nav used instead) */}
      {!isPwa && tabsMountNode
        ? createPortal(<DevPlayerTabs activeTab={activeTab} onChange={setTab} planTier={planTier} />, tabsMountNode)
        : null}
      {/* Tab panel content */}
      {panelMountNode
        ? createPortal(
            <div className="mt-3">
              {activeTab === "history" && <DevPlayerHistoryTab />}
              {activeTab === "risk" && <DevPlayerRiskTab viewModel={riskViewModel} />}
              {activeTab === "vald" && <DevPlayerVALDTab />}
            </div>,
            panelMountNode
          )
        : null}
      {/* PWA notification opt-in prompt (only in PWA mode, only when not yet subscribed) */}
      {isPwa && <PWANotificationPrompt />}
      {/* PWA bottom navigation bar */}
      {isPwa && <PWABottomNav activeTab={activeTab} onChange={setTab} planTier={planTier} />}
    </>
  );
}
