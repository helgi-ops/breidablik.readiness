"use client";

/**
 * OnboardingChecklist — the first ten minutes of a new personal-trainer practice.
 * Three steps, each done right here with the existing flows, each linking to the full tab:
 *   1. Invite your first client  (POST /api/trainer/invitations — emailed; the link can also be texted)
 *   2. Pick a starting programme (starter programmes, filtered by goal)
 *   3. Send the first session    (assigns the picked programme to a real client)
 * Progress is saved per team (/api/trainer/onboarding). Hidden for good once all three are done.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ONBOARDING_GOALS, type OnboardingGoal } from "@/lib/trainer/onboarding";

type Lang = "IS" | "EN";
type Programme = { key: string; name: string; level: string; blurb: string | null; goals: string[] };
type State = {
  completed: boolean;
  steps: { invite: boolean; programme: boolean; session: boolean };
  picked: { programmeKey: string; name: string; level: string } | null;
  invite: { token: string; email: string; name: string | null } | null;
  clients: Array<{ id: string; name: string; hasAccount: boolean; hasProgramme: boolean }>;
  programmes: Programme[];
};

const GOAL_LABEL: Record<OnboardingGoal, { EN: string; IS: string }> = {
  speed: { EN: "Speed", IS: "Hraði" },
  power: { EN: "Power", IS: "Sprengikraftur" },
  strength: { EN: "Strength", IS: "Styrkur" },
  general: { EN: "General fitness", IS: "Almennt form" },
};
const LEVEL_LABEL: Record<string, { EN: string; IS: string }> = {
  beginner: { EN: "Beginner", IS: "Byrjandi" },
  intermediate: { EN: "Intermediate", IS: "Miðlungs" },
  advanced: { EN: "Advanced", IS: "Lengra kominn" },
};

export default function OnboardingChecklist({
  teamId, lang, welcome, onChanged, onOpenTab,
}: {
  teamId: string;
  lang: Lang;
  welcome: boolean;
  onChanged?: () => void;
  onOpenTab?: (tab: "invitations" | "plans" | "clients") => void;
}) {
  const is = lang === "IS";
  const [state, setState] = useState<State | null>(null);
  const [goal, setGoal] = useState<OnboardingGoal>("general");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Result of the invite just sent from here: emailed, or not (then the link is the way).
  const [lastSend, setLastSend] = useState<{ emailed: boolean; to: string } | null>(null);

  const auth = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token ?? ""}` };
  }, []);
  const qs = `?team_id=${encodeURIComponent(teamId)}`;

  const fetchState = useCallback(async (): Promise<State | null> => {
    try {
      const res = await fetch(`/api/trainer/onboarding${qs}`, { headers: await auth() });
      const j = await res.json();
      return res.ok ? (j as State) : null;
    } catch { return null; /* soft — the dashboard works without the checklist */ }
  }, [auth, qs]);
  const load = useCallback(async () => {
    const s = await fetchState();
    if (s) setState(s);
  }, [fetchState]);
  useEffect(() => {
    let alive = true;
    fetchState().then((s) => { if (alive && s) setState(s); });
    return () => { alive = false; };
  }, [fetchState]);

  if (!state || state.completed) return null;

  const done = [state.steps.invite, state.steps.programme, state.steps.session].filter(Boolean).length;
  const inviteUrl = state.invite && typeof window !== "undefined" ? `${window.location.origin}/invite/client/${state.invite.token}` : null;
  const readyClients = state.clients.filter((c) => c.hasAccount);
  const shown = state.programmes.filter((p) => p.goals.includes(goal));

  async function createInvite() {
    if (!email.includes("@")) { setErr(is ? "Sláðu inn netfang viðskiptavinar." : "Enter your client's email."); return; }
    setBusy("invite"); setErr(null);
    try {
      const res = await fetch(`/api/trainer/invitations${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await auth()) },
        body: JSON.stringify({ clientEmail: email, clientName: name || undefined, lang }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? (is ? "Ekki tókst að búa til boð." : "Could not create the invite.")); return; }
      setLastSend({ emailed: j.emailed === true, to: email.trim() });
      setEmail(""); setName("");
      await load();
      onChanged?.();
    } finally { setBusy(null); }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* the link stays visible to select by hand */ }
  }

  async function pick(p: Programme) {
    setBusy(`pick:${p.key}`); setErr(null);
    try {
      const res = await fetch(`/api/trainer/onboarding${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await auth()) },
        body: JSON.stringify({ action: "pick", programmeKey: p.key, level: p.level }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Error"); return; }
      await load();
    } finally { setBusy(null); }
  }

  async function sendFirst() {
    const id = clientId || readyClients[0]?.id;
    if (!id) return;
    setBusy("send"); setErr(null);
    try {
      const res = await fetch(`/api/trainer/onboarding${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await auth()) },
        body: JSON.stringify({ action: "send", clientId: id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Error"); return; }
      await load();
      onChanged?.();
    } finally { setBusy(null); }
  }

  const stepBox = (n: number, ok: boolean, title: string, children: React.ReactNode) => (
    <li className="flex gap-3 border-t border-slate-100 py-4 first:border-t-0">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ok ? "bg-[#1c7a4a] text-white" : "border-2 border-slate-300 text-slate-500"}`}
      >
        {ok ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] font-semibold ${ok ? "text-slate-500" : "text-slate-900"}`}>
          {title}
          <span className="sr-only">{ok ? (is ? " — lokið" : " — done") : ""}</span>
        </div>
        <div className="mt-1.5 text-sm text-slate-700">{children}</div>
      </div>
    </li>
  );

  const tabLink = (tab: "invitations" | "plans" | "clients", label: string) => (
    <button type="button" onClick={() => onOpenTab?.(tab)} className="text-primary hover:underline">{label}</button>
  );

  return (
    <section aria-labelledby="onboarding-heading" className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="onboarding-heading" className="font-display text-xl font-bold text-slate-900">
          {welcome
            ? (is ? "Velkomin(n) í MicroPulse. Þrjú skref að fyrstu æfingu viðskiptavinar." : "Welcome to MicroPulse. Three steps to your first client session.")
            : (is ? "Komdu þér af stað" : "Get started")}
        </h2>
        <span className="text-sm font-medium text-slate-500">{is ? `${done} af 3 lokið` : `${done} of 3 done`}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {is
          ? "Sýnisviðskiptavinurinn neðar sýnir hvernig borðið lítur út þegar viðskiptavinir æfa. Hann telst ekki með."
          : "The demo client below shows what this board looks like once clients train. It isn't counted."}
      </p>

      {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <ol className="mt-2">
        {stepBox(1, state.steps.invite, is ? "Bjóddu fyrsta viðskiptavininum" : "Invite your first client", (
          <>
            {inviteUrl ? (
              <div className="space-y-1.5">
                <div>
                  {lastSend?.emailed
                    ? (is
                        ? `Boðið fór í pósti á ${lastSend.to}. Viltu líka senda það í SMS? Hér er hlekkurinn.`
                        : `The invitation was emailed to ${lastSend.to}. Want to text it too? Here's the link.`)
                    : lastSend && !lastSend.emailed
                    ? (is
                        ? `Pósturinn fór ekki. Sendu ${state.invite?.name || state.invite?.email} þennan hlekk, t.d. í SMS. Hann býr til aðganginn og tengist stofunni þinni.`
                        : `The email didn't go out. Text ${state.invite?.name || state.invite?.email} this link. It creates their account and joins your practice.`)
                    : (is
                        ? `Boðið bíður hjá ${state.invite?.name || state.invite?.email}. Hlekkurinn býr til aðganginn og tengist stofunni þinni; þú getur líka sent hann í SMS.`
                        : `Waiting for ${state.invite?.name || state.invite?.email} to accept. The link creates their account and joins your practice — you can text it too.`)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 max-w-full break-all rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-800">{inviteUrl}</code>
                  <button type="button" onClick={copyLink} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50">
                    {copied ? (is ? "Afritað ✓" : "Copied ✓") : (is ? "Afrita hlekk" : "Copy link")}
                  </button>
                </div>
              </div>
            ) : !state.steps.invite ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder={is ? "Netfang viðskiptavinar" : "Client's email"}
                  className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                />
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={is ? "Nafn (valfrjálst)" : "Name (optional)"}
                  className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                />
                <button
                  type="button" onClick={createInvite} disabled={busy === "invite"}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy === "invite" ? "…" : (is ? "Senda boð" : "Send invitation")}
                </button>
              </div>
            ) : (
              <div>{is ? "Viðskiptavinur hefur fengið boð." : "A client has been invited."}</div>
            )}
            <div className="mt-1.5 text-xs">{tabLink("invitations", is ? "Öll boð" : "All invitations")}</div>
          </>
        ))}

        {stepBox(2, state.steps.programme, is ? "Veldu byrjunarprógramm" : "Pick a starting programme", (
          <>
            {state.picked && (
              <div className="mb-2">
                {is ? "Valið: " : "Picked: "}
                <span className="font-semibold text-slate-900">{state.picked.name}</span>
                {" · "}{LEVEL_LABEL[state.picked.level]?.[lang] ?? state.picked.level}
              </div>
            )}
            {!state.steps.session && (
              <>
                <div role="group" aria-label={is ? "Markmið" : "Goal"} className="mb-2 flex flex-wrap gap-1.5">
                  {ONBOARDING_GOALS.map((g) => (
                    <button
                      key={g} type="button" aria-pressed={goal === g} onClick={() => setGoal(g)}
                      className={`min-h-9 rounded-full border px-3 text-[13px] font-medium ${goal === g ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"}`}
                    >
                      {GOAL_LABEL[g][lang]}
                    </button>
                  ))}
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {shown.map((p) => {
                    const isPicked = state.picked?.programmeKey === p.key;
                    return (
                      <li key={p.key} className={`flex flex-col gap-1 rounded-xl border p-3 ${isPicked ? "border-primary" : "border-slate-200"}`}>
                        <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-500">{LEVEL_LABEL[p.level]?.[lang] ?? p.level}</div>
                        {p.blurb && <div className="text-xs text-slate-600">{p.blurb}</div>}
                        <button
                          type="button" onClick={() => pick(p)} disabled={isPicked || busy === `pick:${p.key}`}
                          className="mt-1 self-start rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
                        >
                          {isPicked ? (is ? "Valið ✓" : "Picked ✓") : (is ? "Velja" : "Pick")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <div className="mt-1.5 text-xs">{tabLink("plans", is ? "Eða smíðaðu þitt eigið sniðmát" : "Or build your own template")}</div>
          </>
        ))}

        {stepBox(3, state.steps.session, is ? "Sendu fyrstu æfinguna" : "Send the first session", (
          state.steps.session ? (
            <div>{is ? "Fyrsta æfingin er komin á Í dag hjá viðskiptavininum." : "The first session is on your client's Today."}</div>
          ) : !state.picked ? (
            <div className="text-slate-500">{is ? "Veldu byrjunarprógramm fyrst (skref 2)." : "Pick a starting programme first (step 2)."}</div>
          ) : readyClients.length === 0 ? (
            <div className="text-slate-500">
              {is
                ? "Bíður eftir að viðskiptavinurinn samþykki boðið. Þegar hann gerir það birtist hann hér."
                : "Waiting for your client to accept the invite. Once they do, they show up here."}
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={clientId || readyClients[0].id} onChange={(e) => setClientId(e.target.value)}
                className="min-w-0 rounded-lg border px-3 py-2 text-sm"
                aria-label={is ? "Viðskiptavinur" : "Client"}
              >
                {readyClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                type="button" onClick={sendFirst} disabled={busy === "send"}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy === "send" ? "…" : (is ? `Senda „${state.picked.name}"` : `Send "${state.picked.name}"`)}
              </button>
              <span className="text-xs text-slate-500">
                {is ? "Byrjar í dag. Þú getur breytt því í Markmið hjá viðskiptavininum." : "Starts today. You can change it in the client's Goals tab."}
              </span>
            </div>
          )
        ))}
      </ol>
    </section>
  );
}
