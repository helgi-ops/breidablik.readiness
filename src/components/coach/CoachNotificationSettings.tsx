"use client";

/**
 * Coach notification opt-in panel (Settings) — proactive-delivery Addition 1.
 * Morning digest toggle + delivery channel. Off by default; self-scoped.
 * Reads/writes /api/coach/notification-prefs. Threshold alerts / weekly report
 * are shown as "coming soon" (Additions 2–3), not yet wired.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Channel = "push" | "email" | "both";
type Prefs = { morning_digest: boolean; threshold_alerts: boolean; weekly_report: boolean; channel: Channel };

const DEFAULTS: Prefs = { morning_digest: false, threshold_alerts: false, weekly_report: false, channel: "push" };

export default function CoachNotificationSettings() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [prefs, setPrefs] = React.useState<Prefs | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) { if (alive) setPrefs(DEFAULTS); return; }
        const res = await fetch("/api/coach/notification-prefs", { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => ({}));
        if (alive) setPrefs((json as { prefs?: Prefs }).prefs ?? DEFAULTS);
      } catch { if (alive) setPrefs(DEFAULTS); }
    })();
    return () => { alive = false; };
  }, [supabase]);

  const save = React.useCallback(async (patch: Partial<Prefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next); // optimistic
    setSaving(true); setError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error(isEN ? "Not signed in" : "Ekki innskráður");
      const res = await fetch("/api/coach/notification-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error((j as { error?: string }).error ?? "Failed"); }
      const j = await res.json();
      if ((j as { prefs?: Prefs }).prefs) setPrefs((j as { prefs: Prefs }).prefs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setPrefs(prefs); // revert
    } finally {
      setSaving(false);
    }
  }, [prefs, supabase, isEN]);

  const on = prefs?.morning_digest ?? false;
  const alertsOn = prefs?.threshold_alerts ?? false;

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {isEN ? "Notifications" : "Tilkynningar"}
      </div>
      <h2 className="mt-1 text-lg font-semibold text-zinc-950">
        {isEN ? "Morning briefing" : "Morgunyfirlit"}
      </h2>
      <p className="mt-1 max-w-xl text-sm text-zinc-600">
        {isEN
          ? "A once-a-day summary of what needs your attention — the same signals shown on your dashboard, delivered so you don't have to open the app. Descriptive only; it never changes a player's readiness verdict."
          : "Daglegt yfirlit yfir það sem kallar á athygli — sömu merki og á stjórnborðinu, send til þín svo þú þarft ekki að opna appið. Aðeins lýsandi; breytir aldrei readiness-dómi leikmanns."}
      </p>

      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-zinc-900">
          {isEN ? "Send me the morning briefing" : "Senda mér morgunyfirlitið"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={!prefs || saving}
          onClick={() => save({ morning_digest: !on })}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-emerald-600" : "bg-zinc-300"} ${(!prefs || saving) ? "opacity-60" : ""}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {on && (
        <div className="mt-4">
          <div className="text-sm font-medium text-zinc-900">{isEN ? "Deliver via" : "Afhenda með"}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(["push", "email", "both"] as Channel[]).map((c) => {
              const sel = (prefs?.channel ?? "push") === c;
              const label = c === "push" ? (isEN ? "Push" : "Ýti") : c === "email" ? (isEN ? "Email" : "Tölvupóstur") : (isEN ? "Both" : "Bæði");
              return (
                <button
                  key={c}
                  type="button"
                  disabled={saving}
                  onClick={() => save({ channel: c })}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${sel ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {isEN
              ? "Push needs the MicroPulse app installed with notifications allowed. Email arrives at your account address."
              : "Ýti-tilkynningar krefjast þess að MicroPulse-appið sé uppsett með tilkynningar leyfðar. Tölvupóstur berst á netfang aðgangsins."}
          </p>
        </div>
      )}

      {/* Threshold alerts (Addition 2) — push-only, immediate per-signal. */}
      <div className="mt-5 border-t border-zinc-100 pt-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-zinc-900">
            {isEN ? "Alert me the moment a read turns elevated" : "Láta mig vita um leið og merki fer í hækkað"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={alertsOn}
            disabled={!prefs || saving}
            onClick={() => save({ threshold_alerts: !alertsOn })}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${alertsOn ? "bg-emerald-600" : "bg-zinc-300"} ${(!prefs || saving) ? "opacity-60" : ""}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${alertsOn ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {isEN
            ? "A push the first time a player's read crosses into elevated — only high-confidence, actionable ones, and never twice for the same thing within a few days. Push only (needs the installed app)."
            : "Ýti-tilkynning í fyrsta sinn sem merki leikmanns fer í hækkað — aðeins áreiðanleg, aðgerðahæf, og aldrei tvisvar fyrir sama atriði á fáum dögum. Aðeins ýti (krefst uppsetts apps)."}
        </p>
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        {isEN ? "The weekly report is coming soon." : "Vikuskýrsla er væntanleg."}
      </p>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </section>
  );
}
