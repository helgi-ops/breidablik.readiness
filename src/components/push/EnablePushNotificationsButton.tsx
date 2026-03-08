"use client";

import { useState } from "react";
import { registerPushToken } from "@/lib/push/registerPushToken";

type PushUiStatus = "idle" | "enabled" | "denied" | "unsupported" | "error";

export default function EnablePushNotificationsButton() {
  const [status, setStatus] = useState<PushUiStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    setMessage("");

    const result = await registerPushToken();

    if (result.success) {
      setStatus("enabled");
      setMessage("Notifications enabled");
      setBusy(false);
      return;
    }

    if (result.reason === "denied") {
      setStatus("denied");
      setMessage("Notifications were denied");
    } else if (result.reason === "unsupported") {
      setStatus("unsupported");
      setMessage("Push notifications are not supported in this browser");
    } else {
      setStatus("error");
      setMessage(result.error || "Could not enable notifications");
    }

    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center rounded-md border border-black bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Enabling..." : "Enable notifications"}
      </button>

      {status !== "idle" ? <p className="text-xs text-gray-600">{message}</p> : null}
    </div>
  );
}
