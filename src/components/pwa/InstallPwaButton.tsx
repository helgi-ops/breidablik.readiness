"use client";

/**
 * InstallPwaButton
 *
 * Cross-platform "Add to Home Screen" CTA.
 *
 * - Android / Desktop Chrome / Edge: captures the `beforeinstallprompt` event
 *   and shows a native install prompt when the user taps the button.
 * - iOS Safari: shows a help sheet explaining the Share → "Bæta við heimaskjá"
 *   flow because iOS doesn't expose a programmatic install API.
 * - Already installed (standalone display mode): renders nothing.
 *
 * The button adapts its label to the role (player / coach) via the `role` prop
 * so the same component can be used in both layouts.
 */

import { useCallback, useEffect, useState } from "react";

type Role = "player" | "coach";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface Props {
  role?: Role;
  /** Visual variant. `compact` is a small pill suitable for headers. */
  variant?: "compact" | "full";
  className?: string;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)");
  if (mq?.matches) return true;
  // iOS Safari exposes navigator.standalone
  return Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone
  );
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export default function InstallPwaButton({
  role = "coach",
  variant = "compact",
  className = "",
}: Props) {
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }

    function onAppInstalled() {
      setInstalled(true);
      setDeferred(null);
    }

    window.addEventListener(
      "beforeinstallprompt",
      onBeforeInstallPrompt as EventListener
    );
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        onBeforeInstallPrompt as EventListener
      );
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "accepted") {
          setInstalled(true);
        }
      } catch {
        // Swallow — the browser can reject for arbitrary reasons
      } finally {
        setDeferred(null);
      }
      return;
    }
    if (ios) {
      setShowIosHelp(true);
    }
  }, [deferred, ios]);

  // Already installed — don't advertise
  if (installed) return null;

  // Nothing to do: not iOS and no deferred prompt captured yet.
  // We still render the button on iOS because iOS never fires beforeinstallprompt.
  if (!deferred && !ios) return null;

  const label =
    role === "coach" ? "Bæta við heimaskjá" : "Bæta við heimaskjá";

  const base =
    variant === "compact"
      ? "inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
      : "inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition-colors";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`${base} ${className}`}
        aria-label={label}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        <span>{label}</span>
      </button>

      {showIosHelp && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900">
              Bæta við heimaskjá (iOS)
            </h3>
            <ol className="mt-3 space-y-2 text-sm text-gray-700">
              <li>
                1. Ýttu á{" "}
                <span className="font-semibold">Deila</span> hnappinn neðst í
                Safari.
              </li>
              <li>
                2. Skrollaðu niður og veldu{" "}
                <span className="font-semibold">Bæta við heimaskjá</span>.
              </li>
              <li>
                3. Staðfestu nafnið og ýttu á{" "}
                <span className="font-semibold">Bæta við</span>.
              </li>
            </ol>
            <p className="mt-3 text-xs text-gray-500">
              {role === "coach"
                ? "Appið opnast beint á þjálfarasíðunni."
                : "Appið opnast beint á leikmannasíðunni."}
            </p>
            <button
              onClick={() => setShowIosHelp(false)}
              className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Loka
            </button>
          </div>
        </div>
      )}
    </>
  );
}
