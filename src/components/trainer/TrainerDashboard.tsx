"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { TRAINER_COPY } from "./trainerCopy";
import PlanBuilder from "./PlanBuilder";
import PlanAssigner from "./PlanAssigner";
import IsometricProtocolLibrary from "./IsometricProtocolLibrary";
import LvProfilePanel from "./LvProfilePanel";
import PtClientSummaryCard from "./PtClientSummaryCard";
import LoadQuadrant from "@/components/player/LoadQuadrant";
import VolumeLoadCard from "@/components/player/VolumeLoadCard";
import TrainingLoadCard from "@/components/player/TrainingLoadCard";
import MomentumCard from "@/components/player/MomentumCard";
import PtGamesManager from "./PtGamesManager";
import { downloadPtClientReportPdf, type PtClientReport } from "@/components/trainer/PtClientReportPdf";
import AutoProgressionCard from "@/components/trainer/AutoProgressionCard";
import ClientSessionLogCard from "@/components/trainer/ClientSessionLogCard";
import PlanVisibilityToggle from "@/components/trainer/PlanVisibilityToggle";
import ClientGoalsCard from "@/components/trainer/ClientGoalsCard";
import type { TemplateLite } from "@/lib/trainer/goalRecommend";
import ClientBreaksManager from "./ClientBreaksManager";
import TrainerAttentionList from "./TrainerAttentionList";

/* ── Types ───────────────────────────────────────────── */

interface ClientReadiness {
  totalScore: number | null;
  zone: "green" | "yellow" | "red" | "none";
  fatigue: number;
  sleep: number;
  sleepDuration: number;
  stress: number;
  soreness: number;
  soreAreas: string[] | null;
}

interface ClientLoad {
  acwr: number | null;
  trend: string | null;
  dailyLoad: number;
  acute7d: number | null;
  chronic28d: number | null;
}

interface ClientPlan {
  id: string;
  name: string;
  type: "strength" | "endurance" | "mixed" | "starter";
  /** Which assignment system the active programme comes from. */
  kind?: "custom" | "starter";
  /** Starter only — needed to remove the assignment. */
  programmeKey?: string;
  level?: string | null;
}

interface ClientCompletion {
  completed: number;
  skipped: number;
  total: number;
}

interface Client {
  id: string;
  name: string;
  hasAccount: boolean;
  position: string | null;
  checkedInToday: boolean;
  readiness: ClientReadiness | null;
  load: ClientLoad | null;
  plan: ClientPlan | null;
  todayCompletion: ClientCompletion | null;
}

interface Invitation {
  id: string;
  client_email: string;
  client_name: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

interface PlanTemplate {
  id: string;
  name: string;
  plan_type: "strength" | "endurance" | "mixed";
  duration_weeks: number;
  sessions_per_week: number;
  readiness_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface PlanAssignment {
  id: string;
  client_id: string;
  client_name: string;
  template_id: string;
  template_name: string;
  start_date: string;
  status: string;
}

type TrainerTab = "clients" | "invitations" | "plans" | "isometrics" | "lvProfile";

/* ── Component ───────────────────────────────────────── */

export default function TrainerDashboard({ teamId }: { teamId: string }) {
  const [lang] = useLang();
  const ct = TRAINER_COPY[lang as keyof typeof TRAINER_COPY] ?? TRAINER_COPY.IS;
  const isIS = lang === "IS";
  // supabase is imported from @/lib/supabaseClient

  // Visible tabs — Explosive Power 12w is NOT here. It lives on
  // /coach/pt-explosive (admin-only) and is surfaced as a pinned card on
  // /coach/custom-templates for the site owner. Having it as a tab in the
  // PT dashboard confused trainers (the tab implied it was a per-client
  // tool, but it's actually a library Helgi owns).
  const visibleTabs: TrainerTab[] = ["clients", "invitations", "plans", "isometrics", "lvProfile"];

  // Tab is URL-driven so the CoachSidebar can deep-link into a specific
  // TrainerDashboard tab via /coach?tab=lvProfile (etc). Defaults to
  // 'clients' when no param is present.
  const [tab, setTab] = useState<TrainerTab>(() => {
    if (typeof window === "undefined") return "clients";
    const p = new URLSearchParams(window.location.search).get("tab");
    const valid: TrainerTab[] = ["clients","invitations","plans","isometrics","lvProfile"];
    return (valid.includes(p as TrainerTab) ? (p as TrainerTab) : "clients");
  });

  // Keep tab synced when the URL changes (e.g., sidebar link click on the
  // same page — Next's client router updates location.search without
  // remounting the component).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const p = new URLSearchParams(window.location.search).get("tab");
      const valid: TrainerTab[] = ["clients","invitations","plans","isometrics","lvProfile"];
      if (valid.includes(p as TrainerTab)) setTab(p as TrainerTab);
      else setTab("clients");
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const [clients, setClients] = useState<Client[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  // Starter programmes (pt_explosive category='starter_template'), mapped into
  // the goal-recommender candidate shape so the Goals card can recommend from
  // the ready-made library too — not only the trainer's own templates.
  const [starterCandidates, setStarterCandidates] = useState<TemplateLite[]>([]);
  const [assignments, setAssignments] = useState<PlanAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Invitation form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Plans modal
  const [showPlanBuilder, setShowPlanBuilder] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showPlanAssigner, setShowPlanAssigner] = useState(false);
  const [assigningTemplate, setAssigningTemplate] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const [removingPlanId, setRemovingPlanId] = useState<string | null>(null);

  // Remove a client's active programme — routes to the right system based on
  // which one it came from (custom individual plan vs starter/explosive).
  const removeClientProgramme = async (client: Client) => {
    if (!client.plan) return;
    if (typeof window !== "undefined" && !window.confirm(
      isIS ? `Fjarlægja „${client.plan.name}" af ${client.name}?` : `Remove "${client.plan.name}" from ${client.name}?`,
    )) return;
    setRemovingPlanId(client.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const auth = { Authorization: `Bearer ${session?.access_token ?? ""}` };
      const url = client.plan.kind === "starter"
        ? `/api/trainer/starter-templates?assignmentId=${encodeURIComponent(client.plan.id)}`
        : `/api/trainer/plans/${client.plan.id}`;
      const res = await fetch(url, { method: "DELETE", headers: auth });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? "Failed"); }
      await Promise.all([fetchClients(), fetchAssignments()]);
    } catch (e) {
      if (typeof window !== "undefined") window.alert(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setRemovingPlanId(null);
    }
  };

  // Download a client's 4-week progress report PDF (adherence, readiness, load,
  // strength PRs & volume) — sendable to the client.
  const downloadClientReport = async (clientId: string) => {
    setReportBusyId(clientId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { alert(isIS ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch(`/api/trainer/client/${clientId}/progress-report`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert((isIS ? "Tókst ekki: " : "Failed: ") + (j.error ?? res.status)); return; }
      const data = (await res.json()) as PtClientReport;
      await downloadPtClientReportPdf(data);
    } catch {
      alert(isIS ? "Villa við að búa til skýrslu." : "Error generating report.");
    } finally {
      setReportBusyId(null);
    }
  };

  /* ── Fetch clients ──────────────────────────────────── */

  const qs = `?team_id=${encodeURIComponent(teamId)}`;

  const fetchClients = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/trainer/clients${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.clients) setClients(json.clients);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [supabase, qs]);

  const fetchInvitations = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/trainer/invitations${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.invitations) setInvitations(json.invitations);
    } catch {
      // silent
    }
  }, [supabase, qs]);

  const fetchTemplates = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/trainer/templates${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.templates) setTemplates(json.templates);
    } catch {
      // silent
    }
  }, [supabase, qs]);

  // Fetch the ready-made starter programmes and collapse them (one row per
  // phase × level) into one candidate per programme_key, with the levels it
  // offers, so the goal recommender can rank them alongside custom templates.
  const fetchStarterCandidates = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/trainer/starter-templates`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      const lib = (json.library ?? []) as Array<{
        programme_key: string; programme_name: string | null; level: string | null;
        short_blurb: string | null; focus: string | null; methods: string[] | null;
      }>;
      const byKey = new Map<string, TemplateLite>();
      for (const row of lib) {
        if (!row.programme_key) continue;
        const existing = byKey.get(row.programme_key);
        const lvl = (row.level || "").toLowerCase();
        if (existing) {
          if (lvl && !existing.levels!.includes(lvl)) existing.levels!.push(lvl);
          continue;
        }
        byKey.set(row.programme_key, {
          id: `starter:${row.programme_key}`,
          name: row.programme_name || row.programme_key,
          notes: [row.short_blurb, row.focus, (row.methods || []).join(" ")].filter(Boolean).join(" — ") || null,
          source: "starter",
          programmeKey: row.programme_key,
          levels: lvl ? [lvl] : [],
        });
      }
      // Order levels sensibly for the picker.
      const order = ["beginner", "intermediate", "advanced"];
      const out = Array.from(byKey.values()).map((c) => ({
        ...c,
        levels: (c.levels || []).sort((a, b) => order.indexOf(a) - order.indexOf(b)),
      }));
      setStarterCandidates(out);
    } catch {
      // silent — recommender still works on custom templates alone
    }
  }, [supabase]);

  const fetchAssignments = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/trainer/plans${qs}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.plans) {
        // Map plans API response to PlanAssignment shape
        setAssignments(
          (json.plans as any[]).map((p: any) => ({
            id: p.id,
            client_id: p.playerId,
            client_name: p.playerName,
            template_id: "",
            template_name: p.planName,
            start_date: p.startDate,
            status: p.status,
          }))
        );
      }
    } catch {
      // silent
    }
  }, [supabase, qs]);

  useEffect(() => {
    fetchClients();
    fetchInvitations();
    fetchTemplates();
    fetchStarterCandidates();
    fetchAssignments();
  }, [fetchClients, fetchInvitations, fetchTemplates, fetchStarterCandidates, fetchAssignments]);

  /* ── Send invitation ────────────────────────────────── */

  async function sendInvite() {
    if (!inviteEmail.includes("@")) return;
    setInviteSending(true);
    setInviteMsg("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/trainer/invitations${qs}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientEmail: inviteEmail,
          clientName: inviteName || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setInviteEmail("");
        setInviteName("");
        setInviteMsg(json.signupUrl ? `✓ ${ct.invitations.copyLink}: ${json.signupUrl}` : "✓");
        fetchInvitations();
      } else {
        setInviteMsg(json.error || "Error");
      }
    } catch {
      setInviteMsg("Error");
    } finally {
      setInviteSending(false);
    }
  }

  /* ── Revoke invitation ──────────────────────────────── */

  async function revokeInvite(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch(`/api/trainer/invitations?id=${id}&team_id=${encodeURIComponent(teamId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    fetchInvitations();
  }

  /* ── Copy link ──────────────────────────────────────── */

  function copySignupLink(token: string) {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/signup?invite=${token}&team_id=${teamId}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  /* ── Readiness zone helpers ─────────────────────────── */

  function zoneBg(zone: string) {
    switch (zone) {
      case "green": return "bg-green-100 text-green-800 border-green-300";
      case "yellow": return "bg-amber-100 text-amber-800 border-amber-300";
      case "red": return "bg-red-100 text-red-800 border-red-300";
      default: return "bg-gray-100 text-gray-500 border-gray-200";
    }
  }

  function zoneDot(zone: string) {
    switch (zone) {
      case "green": return "bg-green-500";
      case "yellow": return "bg-amber-500";
      case "red": return "bg-red-500";
      default: return "bg-gray-300";
    }
  }

  function zoneLabel(zone: string) {
    return ct.readiness[zone as keyof typeof ct.readiness] ?? zone;
  }

  function trendArrow(trend: string | null) {
    if (trend === "RISING") return "↑";
    if (trend === "DROPPING") return "↓";
    return "→";
  }

  function planTypeLabel(type: string) {
    return ct.plan[type as keyof typeof ct.plan] ?? type;
  }

  async function deleteTemplate(id: string) {
    if (!confirm(isIS ? "Eyða þessu sniðmáti?" : "Delete this template?")) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/trainer/templates?id=${id}&team_id=${encodeURIComponent(teamId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        fetchTemplates();
      }
    } catch {
      // silent
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{ct.header.title}</h1>
        <p className="text-sm text-gray-500">{ct.header.subtitle}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {ct.tabs[t]}
            {t === "invitations" && invitations.filter((i) => i.status === "pending").length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                {invitations.filter((i) => i.status === "pending").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Clients tab ───────────────────────────────── */}
      {tab === "clients" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{ct.tabs.clients}</div>
              <div className="text-2xl font-bold mt-1">{clients.length}</div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{ct.clients.checkedIn}</div>
              <div className="text-2xl font-bold mt-1 text-green-600">
                {clients.filter((c) => c.checkedInToday).length}
              </div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{ct.clients.todayDone}</div>
              <div className="text-2xl font-bold mt-1 text-blue-600">
                {clients.filter((c) => c.todayCompletion && c.todayCompletion.completed > 0).length}
              </div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{ct.clients.noPlan}</div>
              <div className="text-2xl font-bold mt-1 text-gray-400">
                {clients.filter((c) => !c.plan).length}
              </div>
            </div>
          </div>

          {/* Needs-attention banner — flagged clients, most severe first. */}
          <TrainerAttentionList
            teamId={teamId}
            lang={isIS ? "IS" : "EN"}
            onSelect={(id) => {
              const c = clients.find((x) => x.id === id);
              if (c) setSelectedClient(c);
            }}
          />

          {/* Client list */}
          {clients.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>{ct.clients.noClients}</p>
              <button
                onClick={() => setTab("invitations")}
                className="mt-4 px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
              >
                {ct.clients.addClient}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => setSelectedClient(selectedClient?.id === client.id ? null : client)}
                >
                  <div className="flex items-center gap-4">
                    {/* Readiness dot */}
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${zoneDot(client.readiness?.zone ?? "none")}`} />

                    {/* Name + status */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{client.name || "—"}</div>
                      <div className="text-xs text-gray-500">
                        {client.checkedInToday ? ct.clients.checkedIn : (
                          <span className="text-amber-600">{client.hasAccount ? ct.clients.notCheckedIn : ct.clients.noAccount}</span>
                        )}
                      </div>
                    </div>

                    {/* Readiness zone badge */}
                    <div className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${zoneBg(client.readiness?.zone ?? "none")}`}>
                      {zoneLabel(client.readiness?.zone ?? "none")}
                      {client.readiness?.totalScore != null && (
                        <span className="ml-1 opacity-70">{client.readiness.totalScore}/25</span>
                      )}
                    </div>

                    {/* ACWR */}
                    <div className="text-right w-20 flex-shrink-0 hidden sm:block">
                      <div className="text-xs text-gray-500">{ct.load.acwr}</div>
                      <div className="text-sm font-medium">
                        {client.load?.acwr != null ? (
                          <>
                            {Number(client.load.acwr).toFixed(2)} {trendArrow(client.load.trend)}
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>

                    {/* Plan — show WHICH programme the client is on (name), with the
                        type as a tooltip, so the trainer sees the actual plan at a glance. */}
                    <div className="text-right w-44 flex-shrink-0 hidden md:block">
                      <div className="text-xs text-gray-500">{ct.tabs.plans}</div>
                      <div className="text-sm truncate" title={client.plan ? `${client.plan.name} · ${planTypeLabel(client.plan.type)}` : undefined}>
                        {client.plan ? (
                          <span className="font-medium">{client.plan.name}</span>
                        ) : (
                          <span className="text-gray-400">{ct.clients.noPlan}</span>
                        )}
                      </div>
                    </div>

                    {/* Today completion */}
                    <div className="text-right w-16 flex-shrink-0 hidden md:block">
                      {client.todayCompletion ? (
                        <span className="text-sm text-green-600 font-medium">
                          {client.todayCompletion.completed}/{client.todayCompletion.total}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail. Stop click-bubbling so interacting with
                      anything inside (date pickers, selects, buttons) doesn't
                      hit the row's expand/collapse toggle and close the card. */}
                  {selectedClient?.id === client.id && (
                    <div
                      className="mt-4 pt-4 border-t grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Sendable progress report */}
                      <div className="col-span-2 sm:col-span-5">
                        <button
                          type="button"
                          onClick={() => downloadClientReport(client.id)}
                          disabled={reportBusyId === client.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {reportBusyId === client.id
                            ? (isIS ? "Bý til…" : "Generating…")
                            : (isIS ? "Hlaða niður framvinduskýrslu (4 vikur, PDF)" : "Download progress report (4 weeks, PDF)")}
                        </button>
                      </div>

                      {/* Current programme + remove. Reassign happens via the
                          Goals card below (or Plan builder). */}
                      <div className="col-span-2 sm:col-span-5">
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{isIS ? "Æfingakerfi núna" : "Current programme"}</div>
                            {client.plan ? (
                              <div className="flex items-center gap-1.5 text-sm">
                                <span className="font-medium text-slate-800 truncate">{client.plan.name}</span>
                                <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${client.plan.kind === "starter" ? "bg-sky-100 text-sky-700" : "bg-slate-200 text-slate-600"}`}>
                                  {client.plan.kind === "starter" ? (isIS ? "Tilbúið" : "Starter") : (isIS ? "Eigið" : "Custom")}
                                </span>
                              </div>
                            ) : (
                              <div className="text-sm text-slate-400">{isIS ? "Ekkert kerfi — veldu hér að neðan" : "No programme — assign below"}</div>
                            )}
                          </div>
                          {client.plan && (
                            <button
                              type="button"
                              onClick={() => removeClientProgramme(client)}
                              disabled={removingPlanId === client.id}
                              className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {removingPlanId === client.id ? (isIS ? "Fjarlægi…" : "Removing…") : (isIS ? "Fjarlægja" : "Remove")}
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs block">Fatigue/Energy</span>
                        <span className="font-medium">{client.readiness?.fatigue ?? "—"}/5</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs block">Sleep</span>
                        <span className="font-medium">{client.readiness?.sleep ?? "—"}/5</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs block">Stress/Mood</span>
                        <span className="font-medium">{client.readiness?.stress ?? "—"}/5</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs block">Soreness</span>
                        <span className="font-medium">{client.readiness?.soreness ?? "—"}/5</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs block">Daily Load</span>
                        <span className="font-medium">{client.load?.dailyLoad ?? "—"}</span>
                      </div>
                      {client.readiness?.soreAreas && client.readiness.soreAreas.length > 0 && (
                        <div className="col-span-2 sm:col-span-5">
                          <span className="text-gray-500 text-xs block">Sore Areas</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(client.readiness.soreAreas as string[]).map((area) => (
                              <span key={area} className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs">
                                {area}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* AI Client Summary — Haiku-generated digest of the
                          last 14 days. Only renders when the client row is
                          expanded so we don't spam the API on dashboard load
                          for every client. Cached server-side per
                          (trainer, client, window). */}
                      <div className="col-span-2 sm:col-span-5">
                        <PtClientSummaryCard
                          clientId={client.id}
                          clientName={client.name}
                          lang={isIS ? "IS" : "EN"}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-5">
                        <LoadQuadrant clientId={client.id} lang={isIS ? "IS" : "EN"} />
                      </div>
                      <div className="col-span-2 sm:col-span-5">
                        <ClientGoalsCard
                          clientId={client.id}
                          lang={isIS ? "IS" : "EN"}
                          templates={templates}
                          starterCandidates={starterCandidates}
                          onUseProgramme={(id, name) => {
                            setAssigningTemplate({ id, name });
                            setShowPlanAssigner(true);
                          }}
                          onAssignStarter={async (programmeKey, level) => {
                            const { data: { session } } = await supabase.auth.getSession();
                            const res = await fetch(`/api/trainer/starter-templates`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
                              body: JSON.stringify({ clientId: client.id, programmeKey, level }),
                            });
                            const j = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(j.error ?? "Assign failed");
                            fetchAssignments();
                          }}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-5">
                        <PlanVisibilityToggle clientId={client.id} lang={isIS ? "IS" : "EN"} />
                      </div>
                      <div className="col-span-2 sm:col-span-5">
                        <ClientSessionLogCard clientId={client.id} lang={isIS ? "IS" : "EN"} />
                      </div>
                      <div className="col-span-2 sm:col-span-5">
                        <AutoProgressionCard clientId={client.id} lang={isIS ? "IS" : "EN"} />
                      </div>
                      <div className="col-span-2 sm:col-span-5">
                        <VolumeLoadCard clientId={client.id} lang={isIS ? "IS" : "EN"} />
                      </div>
                      <div className="col-span-2 sm:col-span-5">
                        <TrainingLoadCard clientId={client.id} lang={isIS ? "IS" : "EN"} />
                      </div>
                      <div className="col-span-2 sm:col-span-5">
                        <MomentumCard clientId={client.id} lang={isIS ? "IS" : "EN"} />
                      </div>
                      <div className="col-span-2 sm:col-span-5">
                        <PtGamesManager clientId={client.id} lang={isIS ? "IS" : "EN"} />
                      </div>
                      <div className="col-span-2 sm:col-span-5">
                        <ClientBreaksManager clientId={client.id} lang={isIS ? "IS" : "EN"} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Invitations tab ───────────────────────────── */}
      {tab === "invitations" && (
        <div>
          <h2 className="text-lg font-semibold mb-4">{ct.invitations.title}</h2>

          {/* Send invite form */}
          <div className="bg-white border rounded-lg p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                placeholder={ct.invitations.email}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              <input
                type="text"
                placeholder={`${ct.invitations.name} (${lang === "IS" ? "valfrjálst" : "optional"})`}
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              <button
                onClick={sendInvite}
                disabled={inviteSending || !inviteEmail.includes("@")}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {inviteSending ? "..." : ct.invitations.send}
              </button>
            </div>
            {inviteMsg && (
              <p className="mt-2 text-sm text-gray-600 break-all">{inviteMsg}</p>
            )}
          </div>

          {/* Invitation list */}
          {invitations.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">
              {lang === "IS" ? "Engin boð send ennþá." : "No invitations sent yet."}
            </p>
          ) : (
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div key={inv.id} className="bg-white border rounded-lg p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {inv.client_name || inv.client_email}
                    </div>
                    {inv.client_name && (
                      <div className="text-xs text-gray-500">{inv.client_email}</div>
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      inv.status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : inv.status === "accepted"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {ct.invitations[inv.status as keyof typeof ct.invitations] ?? inv.status}
                  </span>
                  {inv.status === "pending" && (
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); copySignupLink(inv.token); }}
                        className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                      >
                        {copiedToken === inv.token ? ct.invitations.linkCopied : ct.invitations.copyLink}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); revokeInvite(inv.id); }}
                        className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                      >
                        {ct.invitations.revoke}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Plans tab ─────────────────────────────────── */}
      {tab === "plans" && (
        <div>
          {/* Header with create button */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">{ct.tabs.plans}</h2>
            <button
              onClick={() => {
                setEditingTemplateId(null);
                setShowPlanBuilder(true);
              }}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
            >
              {ct.plans.createNew}
            </button>
          </div>

          {/* Templates section */}
          <div className="mb-8 pb-8 border-b">
            <h3 className="font-semibold text-sm text-gray-700 mb-4">
              {isIS ? "Sniðmát" : "Templates"}
            </h3>
            {templates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>{ct.plans.noPlan}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <div key={template.id} className="bg-white border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-medium">{template.name}</h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {planTypeLabel(template.plan_type)} • {template.duration_weeks}{" "}
                          {isIS ? "vika" : "weeks"} • {template.sessions_per_week}{" "}
                          {isIS ? "setumál" : "sessions"}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingTemplateId(template.id);
                          setShowPlanBuilder(true);
                        }}
                        className="flex-1 px-3 py-1 text-xs border rounded hover:bg-gray-50"
                      >
                        {ct.plans.edit}
                      </button>
                      <button
                        onClick={() => {
                          setAssigningTemplate({ id: template.id, name: template.name });
                          setShowPlanAssigner(true);
                        }}
                        className="flex-1 px-3 py-1 text-xs border rounded hover:bg-gray-50"
                      >
                        {ct.plans.assignPlan}
                      </button>
                      <button
                        onClick={() => deleteTemplate(template.id)}
                        className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                      >
                        {ct.plans.delete}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assignments section */}
          <div>
            <h3 className="font-semibold text-sm text-gray-700 mb-4">
              {isIS ? "Virkar áætlanir" : "Active Assignments"}
            </h3>
            {assignments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>{ct.plans.noPlanAssignments}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="bg-white border rounded-lg p-3 flex items-center gap-4"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm">{assignment.client_name}</div>
                      <div className="text-xs text-gray-500">
                        {assignment.template_name} •{" "}
                        {new Date(assignment.start_date).toLocaleDateString(
                          isIS ? "is-IS" : "en-US"
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        assignment.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {assignment.status === "active"
                        ? isIS
                          ? "Virk"
                          : "Active"
                        : isIS
                        ? "Lokið"
                        : "Completed"}
                    </span>
                    {/* Remove (archive) an assignment — e.g. duplicates or plans
                        assigned by mistake. Archived, not hard-deleted. */}
                    <button
                      type="button"
                      onClick={async () => {
                        const msg = isIS
                          ? `Fjarlægja „${assignment.template_name}“ af ${assignment.client_name}? Áætlunin fer í geymslu og hverfur af lista viðskiptavinarins.`
                          : `Remove "${assignment.template_name}" from ${assignment.client_name}? The plan is archived and disappears from the client's list.`;
                        if (!window.confirm(msg)) return;
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          if (!session?.access_token) return;
                          const res = await fetch(`/api/trainer/plans/${assignment.id}`, {
                            method: "DELETE",
                            headers: { Authorization: `Bearer ${session.access_token}` },
                          });
                          if (!res.ok) {
                            const j = await res.json().catch(() => ({}));
                            alert((isIS ? "Tókst ekki að fjarlægja: " : "Could not remove: ") + (j.error ?? res.status));
                            return;
                          }
                          fetchAssignments();
                        } catch {
                          alert(isIS ? "Villa við að fjarlægja áætlun." : "Error removing the plan.");
                        }
                      }}
                      className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      title={isIS ? "Fjarlægja úthlutun (fer í geymslu)" : "Remove assignment (archived)"}
                    >
                      {isIS ? "Fjarlægja" : "Remove"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Isometrics tab ────────────────────────────── */}
      {tab === "isometrics" && (
        <IsometricProtocolLibrary lang={lang === "EN" ? "EN" : "IS"} />
      )}

      {/* ── Load-Velocity Profile tab (ELITE add-on, per-client) ── */}
      {tab === "lvProfile" && (
        <LvProfilePanel
          lang={lang === "EN" ? "EN" : "IS"}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        />
      )}

      {/* Plan Builder Modal */}
      {showPlanBuilder && (
        <PlanBuilder
          teamId={teamId}
          templateId={editingTemplateId ?? undefined}
          onClose={() => {
            setShowPlanBuilder(false);
            setEditingTemplateId(null);
          }}
          onSaved={() => {
            setShowPlanBuilder(false);
            setEditingTemplateId(null);
            fetchTemplates();
          }}
        />
      )}

      {/* Plan Assigner Modal */}
      {showPlanAssigner && assigningTemplate && (
        <PlanAssigner
          teamId={teamId}
          templateId={assigningTemplate.id}
          templateName={assigningTemplate.name}
          onClose={() => {
            setShowPlanAssigner(false);
            setAssigningTemplate(null);
          }}
          onAssigned={() => {
            setShowPlanAssigner(false);
            setAssigningTemplate(null);
            fetchAssignments();
          }}
        />
      )}
    </div>
  );
}
