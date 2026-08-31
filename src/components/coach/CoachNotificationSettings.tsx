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

type Bi = { en: string; is: string };
type DigestPreview = { tone: string; summary: Bi; items: Array<{ label: Bi; why: Bi }> };
type WeeklyPreview = {
  elite: boolean;
  narrative: string | null;
  rollup: {
    weekStart: string; weekEnd: string; alerts: number;
    readiness: { red: number; yellow: number; green: number; totalDays: number };
    load: { sessions: number; avgRpe: number | null };
    availability: { count: number; out: Array<{ name: string; status: string }> };
  };
};
type PreviewState = { kind: "digest"; data: DigestPreview } | { kind: "weekly"; data: WeeklyPreview };

const DEFAULTS: Prefs = { morning_digest: false, threshold_alerts: false, weekly_report: false, channel: "push" };

export default function CoachNotificationSettings() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [prefs, setPrefs] = React.useState<Prefs | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const [preview, setPreview] = React.useState<PreviewState | null>(null);
  const [busy, setBusy] = React.useState<string>("");
  const [toast, setToast] = React.useState<string>("");

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

  const authFetch = React.useCallback(async (url: string, init?: RequestInit) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    return fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token ?? ""}` } });
  }, [supabase]);

  const doPreview = React.useCallback(async (kind: "digest" | "weekly") => {
    setBusy(`preview-${kind}`); setToast(""); setError("");
    try {
      const res = await authFetch(`/api/coach/notification-preview?kind=${kind}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { message?: string; error?: string }).message ?? (j as { error?: string }).error ?? "Failed");
      setPreview(kind === "digest"
        ? { kind: "digest", data: (j as { digest: DigestPreview }).digest }
        : { kind: "weekly", data: { elite: (j as { elite: boolean }).elite, narrative: (j as { narrative: string | null }).narrative, rollup: (j as { rollup: WeeklyPreview["rollup"] }).rollup } });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(""); }
  }, [authFetch]);

  const doSendTest = React.useCallback(async (kind: "digest" | "weekly") => {
    setBusy(`test-${kind}`); setToast(""); setError("");
    try {
      const res = await authFetch("/api/coach/notification-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !(j as { ok?: boolean }).ok) throw new Error((j as { message?: string; error?: string }).message ?? (j as { error?: string }).error ?? (isEN ? "Nothing was delivered — check you have the app installed (push) or an email on file." : "Ekkert sent — athugaðu hvort appið sé uppsett (ýti) eða netfang skráð."));
      setToast(isEN ? "Test sent ✓" : "Prufa send ✓");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(""); }
  }, [authFetch, isEN]);

  const on = prefs?.morning_digest ?? false;
  const alertsOn = prefs?.threshold_alerts ?? false;
  const weeklyOn = prefs?.weekly_report ?? false;

  const testRow = (kind: "digest" | "weekly") => (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy !== ""} onClick={() => doPreview(kind)}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
        {busy === `preview-${kind}` ? (isEN ? "Loading…" : "Hleð…") : (isEN ? "Preview" : "Forskoða")}
      </button>
      <button type="button" disabled={busy !== ""} onClick={() => doSendTest(kind)}
        className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-[#2740e6] hover:bg-blue-50 disabled:opacity-50">
        {busy === `test-${kind}` ? (isEN ? "Sending…" : "Sendi…") : (isEN ? "Send test to me" : "Senda mér prufu")}
      </button>
    </div>
  );

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

      {testRow("digest")}

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

      {/* Weekly report (Addition 3) — email; AI summary on ELITE. */}
      <div className="mt-5 border-t border-zinc-100 pt-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-zinc-900">
            {isEN ? "Email me a Friday weekly report" : "Senda mér vikuskýrslu á föstudögum"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={weeklyOn}
            disabled={!prefs || saving}
            onClick={() => save({ weekly_report: !weeklyOn })}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${weeklyOn ? "bg-emerald-600" : "bg-zinc-300"} ${(!prefs || saving) ? "opacity-60" : ""}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${weeklyOn ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {isEN
            ? "A Friday email summing up the week — readiness mix, load, availability and alerts. ELITE clubs also get a plain-language AI summary of the week (labelled as AI, built only from your numbers)."
            : "Föstudags-tölvupóstur sem tekur saman vikuna — readiness, álag, mönnun og viðvaranir. ELITE-félög fá einnig AI-samantekt vikunnar á mannamáli (merkt sem AI, byggð eingöngu á þínum tölum)."}
        </p>
        {testRow("weekly")}
      </div>

      {toast && <p className="mt-3 text-xs font-medium text-emerald-700">{toast}</p>}
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      {preview && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {preview.kind === "digest" ? (isEN ? "Digest preview" : "Forskoðun yfirlits") : (isEN ? "Weekly report preview" : "Forskoðun vikuskýrslu")}
            </span>
            <button type="button" onClick={() => setPreview(null)} className="text-xs text-zinc-500 hover:text-zinc-800">
              {isEN ? "Close" : "Loka"}
            </button>
          </div>

          {preview.kind === "digest" ? (
            <div>
              <p className="text-sm font-medium text-zinc-900">{isEN ? preview.data.summary.en : preview.data.summary.is}</p>
              {preview.data.items.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {preview.data.items.slice(0, 6).map((it, i) => (
                    <li key={i} className="text-sm text-zinc-700">
                      <span className="font-medium">{isEN ? it.label.en : it.label.is}</span>
                      {(isEN ? it.why.en : it.why.is) ? <span className="text-zinc-500"> — {isEN ? it.why.en : it.why.is}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">{isEN ? "Nothing needs action today." : "Ekkert kallar á aðgerð í dag."}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm text-zinc-700">
              {preview.data.narrative && (
                <div className="rounded-lg border-l-2 border-[#2740e6] bg-white px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#2740e6]">{isEN ? "AI summary" : "AI-samantekt"}</div>
                  <p className="mt-0.5 text-sm text-zinc-800">{preview.data.narrative}</p>
                </div>
              )}
              {!preview.data.narrative && preview.data.elite === false && (
                <p className="text-xs text-zinc-500">{isEN ? "The AI summary is an ELITE feature — the deterministic report below is included on PRO." : "AI-samantektin er ELITE-eiginleiki — talnaskýrslan hér að neðan fylgir PRO."}</p>
              )}
              <p>{isEN ? "Readiness" : "Readiness"}: {preview.data.rollup.readiness.green}🟢 / {preview.data.rollup.readiness.yellow}🟡 / {preview.data.rollup.readiness.red}🔴 {isEN ? "player-days" : "leikmanna-dagar"}</p>
              <p>{isEN ? "Load" : "Álag"}: {preview.data.rollup.load.sessions} {isEN ? "sessions" : "æfingar"}{preview.data.rollup.load.avgRpe != null ? `, ${isEN ? "avg RPE" : "meðal-RPE"} ${preview.data.rollup.load.avgRpe}` : ""}</p>
              <p>{isEN ? "Unavailable" : "Ekki tiltækir"}: {preview.data.rollup.availability.count}{preview.data.rollup.availability.count ? ` — ${preview.data.rollup.availability.out.map((o) => o.name).join(", ")}` : ""}</p>
              <p>{isEN ? "Alerts fired this week" : "Viðvaranir þessa viku"}: {preview.data.rollup.alerts}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
