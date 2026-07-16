"use client";

/**
 * PlayerPrivacyConsentPrompt — a soft, on-open consent prompt with an AGE GATE.
 *
 * A minor cannot give valid consent to the processing of health / biometric data
 * — a guardian must. So the prompt takes one of three paths:
 *
 *   DOB unknown  → ask for it FIRST. Unknown age is not "adult": letting an
 *                  unknown-age player self-consent is the exact failure this
 *                  exists to prevent. Absence of data is not permission.
 *   18 or older  → self-consent (granted_by_relationship = 'self').
 *   under 18     → the guardian consents, co-present, and we record WHO
 *                  (relationship + name + contact). The minor's own tap is not
 *                  the valid record.
 *
 * Still deliberately SOFT: "Later" works and the player keeps using the app, but
 * the prompt re-appears every open until consent is given (no localStorage
 * silencing — consent is a legal decision, not a nudge). Whether to pause
 * processing for a minor without guardian consent is the club's call; this
 * surfaces the gap rather than deciding it.
 *
 * Reuses the existing consent system (player_consents + its audit trigger) — the
 * same record the Privacy panel reads and lets the player revoke.
 *
 * DOB never enters this component: the endpoint returns the DERIVED age/minor
 * flag, and the date goes straight back out on save. It is not logged or put in
 * a URL.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { DataProcessingSummary } from "@/components/legal/DataProcessingSummary";
import { CURRENT_POLICY_VERSION, policyVersionSatisfies } from "@/lib/legal/policyVersion";

type Status = "loading" | "needed" | "ok";
type DobStatus = { known: boolean; age: number | null; isMinor: boolean | null };

async function authedFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      ...(init?.headers ?? {}),
    },
  });
}

export default function PlayerPrivacyConsentPrompt() {
  const [lang] = useLang();
  const isIS = lang === "IS";
  const [status, setStatus] = useState<Status>("loading");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [dob, setDob] = useState<DobStatus>({ known: false, age: null, isMinor: null });
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // DOB step
  const [dobInput, setDobInput] = useState("");
  // Guardian form (only when the player is a confirmed minor)
  const [gRelationship, setGRelationship] = useState<"parent" | "guardian">("parent");
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gConfirmed, setGConfirmed] = useState(false);
  const guardianReady = gName.trim().length > 1 && gConfirmed;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) return; // not signed in yet — stays "loading" (renders null)
        const { data: prof } = await supabase
          .from("profiles").select("player_id").eq("id", userId).maybeSingle();
        const pid = (prof as { player_id?: string | null } | null)?.player_id ?? null;
        if (!pid) { if (alive) setStatus("ok"); return; } // not a player (coach/staff)

        const { data: consents } = await supabase
          .from("player_consents")
          .select("valid_from, valid_to, revoked_at, policy_version")
          .eq("player_id", pid)
          .eq("consent_type", "data_processing")
          .is("revoked_at", null);
        const now = Date.now();
        // Satisfied only by an in-window consent to the CURRENT policy version.
        const active = (consents ?? []).some((c) => {
          const row = c as { valid_from: string | null; valid_to: string | null; policy_version: string | null };
          const vf = row.valid_from ? new Date(row.valid_from).getTime() : 0;
          const vt = row.valid_to ? new Date(row.valid_to).getTime() : Number.POSITIVE_INFINITY;
          return vf <= now && vt >= now && policyVersionSatisfies(row.policy_version);
        });
        if (!alive) return;
        if (active) { setStatus("ok"); return; }

        // Consent is needed → we must know who may give it.
        const res = await authedFetch("/api/player/date-of-birth");
        const d = res.ok ? ((await res.json()) as DobStatus) : { known: false, age: null, isMinor: null };
        if (!alive) return;
        setPlayerId(pid);
        setDob(d);
        setStatus("needed");
      } catch {
        if (alive) setStatus("ok"); // never block the app on a check failure
      }
    })();
    return () => { alive = false; };
  }, []);

  const saveDob = useCallback(async () => {
    setSaving(true); setErr(null);
    try {
      const res = await authedFetch("/api/player/date-of-birth", {
        method: "POST",
        body: JSON.stringify({ dateOfBirth: dobInput }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(
          j?.error === "invalid_date_of_birth"
            ? (isIS ? "Þessi dagsetning gengur ekki upp. Athugaðu hana." : "That date doesn't look right. Please check it.")
            : (isIS ? "Gat ekki vistað. Reyndu aftur." : "Could not save. Please try again."),
        );
        return;
      }
      setDob(j as DobStatus);
    } catch {
      setErr(isIS ? "Gat ekki vistað. Reyndu aftur." : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [dobInput, isIS]);

  const accept = useCallback(async () => {
    if (!playerId || dob.isMinor == null) return; // unknown age must never consent
    setSaving(true); setErr(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;

      // A minor's own tap is not the valid record — a parent/guardian consents on
      // their behalf and we record who they are. An adult grants for themselves.
      const grant = dob.isMinor
        ? {
            granted_by_relationship: gRelationship,
            granted_by_full_name: gName.trim(),
            granted_by_contact: gEmail.trim() || null,
          }
        : { granted_by_relationship: "self" as const };

      const { error } = await supabase.from("player_consents").insert({
        player_id: playerId,
        consent_type: "data_processing",
        granted_by_profile_id: userId,
        source: "app_prompt",
        policy_version: CURRENT_POLICY_VERSION,
        ...grant,
      });
      if (error) throw error;

      // Supersede any prior active consent to an older policy version so exactly
      // one active row stands — the audit log keeps the full history.
      try {
        const { data: prior } = await supabase
          .from("player_consents")
          .select("id, policy_version")
          .eq("player_id", playerId)
          .eq("consent_type", "data_processing")
          .is("revoked_at", null);
        const staleIds = (prior ?? [])
          .filter((c) => !policyVersionSatisfies((c as { policy_version: string | null }).policy_version))
          .map((c) => (c as { id: string }).id);
        if (staleIds.length > 0) {
          await supabase.from("player_consents")
            .update({ revoked_at: new Date().toISOString() })
            .in("id", staleIds);
        }
      } catch { /* housekeeping — the new consent already stands */ }

      setStatus("ok");
    } catch {
      setErr(isIS ? "Gat ekki vistað samþykki. Reyndu aftur." : "Could not save consent. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [playerId, isIS, dob.isMinor, gRelationship, gName, gEmail]);

  if (status !== "needed" || dismissed) return null;

  const needDob = !dob.known || dob.isMinor == null;
  const minor = dob.isMinor === true;

  const intro = needDob
    ? (isIS
        ? "Við þurfum fæðingardaginn þinn til að vita hver þarf að staðfesta þetta — þú eða forráðamaður."
        : "We need your date of birth to know who must confirm this — you or a parent/guardian.")
    : minor
      ? (isIS
          ? "Þessi leikmaður er undir 18 ára. Forráðamaður þarf að samþykkja vinnslu gagnanna fyrir hans hönd. Hægt er að afturkalla hvenær sem er."
          : "This player is under 18. A parent or guardian needs to consent to the data processing on their behalf. It can be revoked at any time.")
      : (isIS
          ? "Áður en þú notar appið biðjum við um samþykki þitt fyrir vinnslu gagnanna þinna. Þú ræður og getur afturkallað hvenær sem er."
          : "Before you use the app, we ask for your consent to process your data. You're in control and can revoke it at any time.");

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {isIS ? "Friðhelgi" : "Privacy"}
        </div>
        <h2 className="mt-0.5 text-lg font-bold tracking-tight text-zinc-900">
          {isIS ? "Samþykki fyrir gagnavinnslu" : "Consent to data processing"}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-600">{intro}</p>

        <div className="mt-3">
          <DataProcessingSummary lang={isIS ? "IS" : "EN"} isMinor={minor} />
        </div>

        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-[13px] font-semibold text-[#2740e6] hover:underline"
        >
          {isIS ? "Sjá fulla útgáfu →" : "Read the full version →"}
        </a>

        {/* Step 1 — age gate. Without a DOB we cannot know who may consent, so we
            ask rather than assume. */}
        {needDob && (
          <div className="mt-4 space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <label className="block text-[12px] font-semibold text-zinc-700" htmlFor="dob-input">
              {isIS ? "Fæðingardagur" : "Date of birth"}
            </label>
            <input
              id="dob-input"
              type="date"
              value={dobInput}
              onChange={(e) => setDobInput(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <p className="text-[11px] leading-snug text-zinc-500">
              {isIS
                ? "Notað eingöngu til að reikna aldur — til að vita hvort þú megir samþykkja sjálf(ur) eða hvort forráðamaður þarf að gera það."
                : "Used only to work out your age — to know whether you can consent yourself or a parent/guardian must."}
            </p>
          </div>
        )}

        {/* Step 2 (minors) — the guardian is the one who consents. */}
        {!needDob && minor && (
          <div className="mt-4 space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-[12px] font-semibold text-zinc-700">
              {isIS ? "Forráðamaður staðfestir" : "Parent / guardian confirms"}
            </div>
            <div className="flex gap-2">
              {(["parent", "guardian"] as const).map((rel) => (
                <button
                  key={rel}
                  type="button"
                  onClick={() => setGRelationship(rel)}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-[13px] font-medium ${
                    gRelationship === rel ? "border-[#2740e6] bg-white text-[#2740e6]" : "border-zinc-200 bg-white text-zinc-500"
                  }`}
                >
                  {rel === "parent" ? (isIS ? "Foreldri" : "Parent") : (isIS ? "Forráðamaður" : "Guardian")}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={gName}
              onChange={(e) => setGName(e.target.value)}
              placeholder={isIS ? "Fullt nafn forráðamanns" : "Parent/guardian full name"}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              value={gEmail}
              onChange={(e) => setGEmail(e.target.value)}
              placeholder={isIS ? "Netfang (til að ná í þig)" : "Email (so we can reach you)"}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <label className="flex items-start gap-2 text-[13px] leading-snug text-zinc-700">
              <input type="checkbox" checked={gConfirmed} onChange={(e) => setGConfirmed(e.target.checked)} className="mt-0.5" />
              <span>
                {isIS
                  ? "Ég er forráðamaður leikmannsins og samþykki vinnslu gagnanna fyrir hans hönd."
                  : "I am this player's parent/guardian and I consent to the data processing on their behalf."}
              </span>
            </label>
          </div>
        )}

        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          {needDob ? (
            <button
              type="button"
              onClick={saveDob}
              disabled={saving || !dobInput}
              className="flex-1 rounded-xl bg-[#2740e6] px-4 py-2.5 text-sm font-semibold text-white active:opacity-80 disabled:opacity-50"
            >
              {saving ? (isIS ? "Vista…" : "Saving…") : (isIS ? "Áfram" : "Continue")}
            </button>
          ) : (
            <button
              type="button"
              onClick={accept}
              disabled={saving || (minor && !guardianReady)}
              className="flex-1 rounded-xl bg-[#1c7a4a] px-4 py-2.5 text-sm font-semibold text-white active:opacity-80 disabled:opacity-50"
            >
              {saving
                ? (isIS ? "Vista…" : "Saving…")
                : minor
                  ? (isIS ? "Samþykkja fyrir hönd leikmanns" : "Consent on their behalf")
                  : (isIS ? "Ég samþykki" : "I agree")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 active:opacity-80"
          >
            {isIS ? "Seinna" : "Later"}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-400">
          {isIS ? "Þú getur haldið áfram án samþykkis, en við minnum þig á næst." : "You can continue without consenting, but we'll remind you next time."}
        </p>
      </div>
    </div>
  );
}
