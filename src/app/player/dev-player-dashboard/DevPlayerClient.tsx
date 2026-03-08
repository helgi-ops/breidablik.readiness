"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PlayerClient from "../PlayerClient";
import EnablePushNotificationsButton from "@/components/push/EnablePushNotificationsButton";
import { getPlayerNeuralStatus } from "@/lib/micropulse/playerNeuralStatus";

type FinalAction = "FULL" | "REDUCED" | "RECOVERY";

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

function NeuralStatusCard() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [action, setAction] = useState<FinalAction | null>(null);

  useEffect(() => {
    const place = () => {
      const cards = Array.from(document.querySelectorAll("div.rounded-xl, div.rounded-2xl")) as HTMLElement[];
      const hero = cards.find((el) => {
        const txt = el.textContent ?? "";
        return txt.includes("Í dag") && (txt.includes("FULL") || txt.includes("REDUCED") || txt.includes("RECOVERY"));
      });
      if (!hero || !hero.parentElement) return;

      let slot = document.getElementById("dev-neural-status-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.id = "dev-neural-status-slot";
      }

      if (slot.parentElement !== hero.parentElement) {
        hero.parentElement.insertBefore(slot, hero.nextSibling);
      } else if (slot.previousElementSibling !== hero) {
        hero.parentElement.insertBefore(slot, hero.nextSibling);
      }

      setAction(detectFinalActionFromPage());
      setMountNode(slot);
    };

    place();
    const observer = new MutationObserver(() => place());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!mountNode || !action) return null;

  const neural = getPlayerNeuralStatus({ finalAction: action });

  const pillClass =
    neural.status === "GREEN"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : neural.status === "YELLOW"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";

  return createPortal(
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-base font-semibold tracking-tight text-zinc-900">Taugakerfisstaða í dag</div>
      <div className="mt-1 text-xs text-zinc-500">Einföld túlkun á readiness og álagi dagsins</div>

      <div className="mt-3">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${pillClass}`}>{neural.label}</span>
      </div>

      <div className="mt-3 text-sm font-semibold text-zinc-900">{neural.title}</div>
      <div className="mt-1 text-sm text-zinc-700">{neural.message}</div>

      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">Áhersla í dag</div>
        <div className="mt-1 text-sm text-zinc-800">{neural.actionFocus}</div>
      </div>

      {neural.summary ? <div className="mt-2 text-xs text-zinc-500">{neural.summary}</div> : null}
      <div className="mt-2 text-[11px] text-zinc-500">Byggt á readiness, nýlegu álagi og batamerkjum.</div>
    </div>,
    mountNode
  );
}

function DevNotificationsPortal() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const place = () => {
      const advisedHeading = Array.from(document.querySelectorAll("*")).find((el) => {
        const txt = (el.textContent ?? "").trim();
        return txt === "Ráðlagðar æfingar";
      }) as HTMLElement | undefined;

      let slot = document.getElementById("dev-notifications-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.id = "dev-notifications-slot";
      }

      // Preferred placement: right below the "Ráðlagðar æfingar" section block.
      if (advisedHeading) {
        const advisedSection = advisedHeading.closest("div.space-y-3") as HTMLElement | null;
        if (advisedSection?.parentElement) {
          if (slot.parentElement !== advisedSection.parentElement) {
            advisedSection.parentElement.insertBefore(slot, advisedSection.nextSibling);
          } else if (slot.previousElementSibling !== advisedSection) {
            advisedSection.parentElement.insertBefore(slot, advisedSection.nextSibling);
          }
          setMountNode(slot);
          return;
        }

        // Fallback placement: directly after the heading container.
        const headingContainer = advisedHeading.parentElement as HTMLElement | null;
        if (headingContainer?.parentElement) {
          if (slot.parentElement !== headingContainer.parentElement) {
            headingContainer.parentElement.insertBefore(slot, headingContainer.nextSibling);
          } else if (slot.previousElementSibling !== headingContainer) {
            headingContainer.parentElement.insertBefore(slot, headingContainer.nextSibling);
          }
          setMountNode(slot);
          return;
        }
      }

      // Final fallback so it's always visible in dev route.
      const pageContainer = document.querySelector("div.mx-auto.max-w-5xl, div.mx-auto.max-w-4xl") as HTMLElement | null;
      if (pageContainer) pageContainer.appendChild(slot);
      setMountNode(slot);
    };

    place();
    const observer = new MutationObserver(() => place());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!mountNode) return null;

  return createPortal(
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">Tilkynningar</div>
      <div className="mt-1 text-base font-semibold tracking-tight text-zinc-900">Daglegar áminningar</div>
      <div className="mt-1 text-sm text-zinc-600">Virkjaðu vafratilkynningar til að fá áminningar.</div>
      <div className="mt-3">
        <EnablePushNotificationsButton />
      </div>
    </div>,
    mountNode
  );
}

function DevRecommendedHeaderPortal() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const place = () => {
      const headings = Array.from(document.querySelectorAll("*")).filter(
        (el) => (el.textContent ?? "").trim() === "Ráðlagðar æfingar"
      ) as HTMLElement[];
      const heading = headings[0];

      if (!heading) return;

      const firstRecommendedCard = Array.from(document.querySelectorAll("div.rounded-xl, div.rounded-2xl")).find((el) =>
        (el.textContent ?? "").includes("Mjaðmir")
      ) as HTMLElement | undefined;

      if (!firstRecommendedCard || !firstRecommendedCard.parentElement) return;

      // Hide every duplicate of the old heading/subtext outside the white portal box.
      const duplicates = Array.from(document.querySelectorAll("*")) as HTMLElement[];
      for (const node of duplicates) {
        if (node.closest("#dev-recommended-header-slot")) continue;
        const txt = (node.textContent ?? "").trim().replace(/\s+/g, " ");
        const isLegacyHeaderLine =
          txt === "RÁÐLAGT" || txt === "Ráðlagðar æfingar" || txt === "Miðað við check-in og athugasemdir.";
        if (isLegacyHeaderLine) {
          node.style.display = "none";
        }
      }

      let slot = document.getElementById("dev-recommended-header-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.id = "dev-recommended-header-slot";
      }

      if (slot.parentElement !== firstRecommendedCard.parentElement) {
        firstRecommendedCard.parentElement.insertBefore(slot, firstRecommendedCard);
      } else if (slot.nextElementSibling !== firstRecommendedCard) {
        firstRecommendedCard.parentElement.insertBefore(slot, firstRecommendedCard);
      }

      setMountNode(slot);
    };

    place();
    const observer = new MutationObserver(() => place());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!mountNode) return null;

  return createPortal(
    <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">Ráðlagt</div>
      <div className="mt-1 text-base font-semibold tracking-tight text-zinc-900">Ráðlagðar æfingar</div>
      <div className="mt-1 text-sm text-zinc-600">Miðað við check-in og athugasemdir.</div>
    </div>,
    mountNode
  );
}

export default function DevPlayerClient() {
  return (
    <>
      <PlayerClient />
      <NeuralStatusCard />
      <DevRecommendedHeaderPortal />
      <DevNotificationsPortal />
    </>
  );
}
