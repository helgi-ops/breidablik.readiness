"use client";

/**
 * InstallPrompt — small unobtrusive banner that nudges new PT clients to
 * install the /client PWA to their home screen. Renders only when:
 *   - Browser fired the beforeinstallprompt event (Chrome / Edge / Android)
 *     OR we're on iOS Safari (no event support there, so we show manual
 *     "Share → Add to Home Screen" hint instead)
 *   - User hasn't dismissed it in localStorage
 *   - Not already in standalone display mode (already installed)
 *
 * Tiny — sits above the bottom nav, single-line + dismiss.
 */

import { useEffect, useState } from "react";

type Lang = "IS" | "EN";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "mp-client-install-dismissed-v1";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari sets navigator.standalone; everyone else uses display-mode media query.
  const nav = window.navigator as unknown as { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
}

const COPY = {
  IS: {
    title: "Settu MicroPulse PT á heimaskjáinn",
    cta: "Setja upp",
    ios: "Smelltu á Share → 'Add to Home Screen'",
    dismiss: "Síðar",
  },
  EN: {
    title: "Add MicroPulse PT to your home screen",
    cta: "Install",
    ios: "Tap Share → 'Add to Home Screen'",
    dismiss: "Later",
  },
} as const;

interface Props {
  lang?: Lang;
}

export default function InstallPrompt({ lang = "IS" }: Props) {
  const t = COPY[lang];
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) { setDismissed(true); return; }
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") {
        setDismissed(true);
        return;
      }
    } catch { /* ignore */ }
    setDismissed(false);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);

    // iOS Safari: no beforeinstallprompt — show manual hint after a short
    // delay so it's not the first thing the user sees on load.
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIosSafari()) {
      iosTimer = setTimeout(() => setIosHint(true), 1500);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  function dismiss() {
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    setDeferred(null);
    if (choice.outcome === "accepted") dismiss();
  }

  if (dismissed) return null;
  // We render when either the install event fired OR we're on iOS and the
  // manual hint is due.
  if (!deferred && !iosHint) return null;

  return (
    <div className="fixed bottom-16 inset-x-2 z-40 rounded-2xl border border-slate-200 bg-white shadow-lg p-3 flex items-center gap-2">
      <div className="text-lg shrink-0">📱</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-900 truncate">{t.title}</div>
        {!deferred && iosHint && (
          <div className="text-[11px] text-slate-500 mt-0.5">{t.ios}</div>
        )}
      </div>
      {deferred && (
        <button
          type="button"
          onClick={install}
          className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 shrink-0"
        >
          {t.cta}
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        className="text-slate-400 hover:text-slate-700 text-xs px-1 shrink-0"
        aria-label={t.dismiss}
      >
        ✕
      </button>
    </div>
  );
}
