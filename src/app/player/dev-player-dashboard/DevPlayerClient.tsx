"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PlayerClient from "../PlayerClient";
import { buildDevDailySessionAdapterResult } from "@/lib/micropulse/trainingGraph/devAdapter";
import { buildEnforcedSessionPlan } from "@/lib/micropulse/lightAte/enforcement";

type FinalAction = "FULL" | "REDUCED" | "RECOVERY";
type AteCardState = "GREEN" | "YELLOW" | "RED" | "GRAY";
type SessionMode = "full" | "modified" | "recovery" | "pending";

type NormalizedPlayerDailyDecision = {
  playerState: AteCardState;
  sessionMode: SessionMode;
  mdContext: string | null;
  emphasis: string;
  message: string | null;
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
  const cards = Array.from(document.querySelectorAll("div.rounded-xl, div.rounded-2xl")) as HTMLElement[];
  return (
    cards.find((el) => {
      const txt = el.textContent ?? "";
      return txt.includes("Player ·") && (txt.includes("FULL") || txt.includes("REDUCED") || txt.includes("RECOVERY"));
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
      return txt.includes("Æfing dagsins") && root.querySelector("div.rounded-2xl.border.p-4");
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
    adjustments: {
      forceRecoveryBlocks: sessionMode === "recovery",
    },
  };
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

function AteCommandCardPortal() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [dailyDecision, setDailyDecision] = useState<NormalizedPlayerDailyDecision>({
    playerState: "GRAY",
    sessionMode: "pending",
    mdContext: null,
    emphasis: emphasisTextForState("GRAY"),
    message: null,
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

  if (!mountNode) return null;

  const copy = ateCardCopy(dailyDecision.playerState);

  return createPortal(
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">TODAY</div>
      <div className="mt-1 text-base font-semibold tracking-tight text-zinc-900">{copy.title}</div>
      <div className="mt-2 text-sm text-zinc-700">{copy.body}</div>
      <div className="mt-1 text-sm text-zinc-600">{copy.secondary}</div>
    </div>,
    mountNode
  );
}

export default function DevPlayerClient() {
  return (
    <>
      <PlayerClient />
      <AteCommandCardPortal />
    </>
  );
}
