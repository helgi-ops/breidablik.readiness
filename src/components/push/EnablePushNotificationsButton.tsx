"use client";

import { useState } from "react";
import { registerPushToken } from "@/lib/push/registerPushToken";

type PushUiStatus = "idle" | "enabled" | "denied" | "unsupported" | "error";

/**
 * With `lang` the button and its messages are in that language (the PT client app).
 * Without it the text is exactly what the team app has always shown.
 */
const COPY = {
  EN: {
    button: "Turn on reminders", busy: "Turning on…", enabled: "Reminders are on",
    denied: "Notifications are blocked for this site. Allow them in your browser or phone settings.",
    unsupported: "This browser can't show notifications. On iPhone, add the app to your Home Screen first.",
    error: "Couldn't turn on reminders",
  },
  IS: {
    button: "Kveikja á áminningum", busy: "Kveiki…", enabled: "Áminningar eru virkar",
    denied: "Tilkynningar eru bannaðar fyrir þessa síðu. Leyfðu þær í stillingum vafrans eða símans.",
    unsupported: "Þessi vafri getur ekki sýnt tilkynningar. Á iPhone þarf fyrst að setja appið á heimaskjáinn.",
    error: "Ekki tókst að kveikja á áminningum",
  },
  LEGACY: {
    button: "Enable notifications", busy: "Enabling...", enabled: "Tilkynningar virkar",
    denied: "Leyfi fyrir tilkynningum var hafnað",
    unsupported: "Þetta tæki/vafri styður ekki tilkynningar",
    error: "Ekki tókst að virkja tilkynningar",
  },
} as const;

export default function EnablePushNotificationsButton({ lang }: { lang?: "EN" | "IS" } = {}) {
  const t = COPY[lang ?? "LEGACY"];
  const [status, setStatus] = useState<PushUiStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    setMessage("");

    const result = await registerPushToken();

    if (result.success) {
      setStatus("enabled");
      setMessage(t.enabled);
      setBusy(false);
      return;
    }

    if (result.reason === "PERMISSION_DENIED") {
      setStatus("denied");
      setMessage(t.denied);
    } else if (
      result.reason === "NOTIFICATION_UNSUPPORTED" ||
      result.reason === "SERVICE_WORKER_UNSUPPORTED" ||
      result.reason === "PUSH_UNSUPPORTED"
    ) {
      setStatus("unsupported");
      setMessage(t.unsupported);
    } else {
      setStatus("error");
      setMessage(result.error ? `${t.error} (${result.error})` : t.error);
    }

    setBusy(false);
  };

  return (
    <div className="space-y-2">
      {(status !== "enabled" || !lang) && (
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className="inline-flex items-center rounded-md border border-black bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? t.busy : t.button}
        </button>
      )}

      {status !== "idle" ? <p className="text-xs text-gray-600">{message}</p> : null}
    </div>
  );
}
