"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type InviteLink = {
  id: string;
  token: string;
  target_role: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
};

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export default function TeamInviteLinks() {
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<"PLAYER" | "COACH">("PLAYER");
  const [newLabel, setNewLabel] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/team-invites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.links) setLinks(json.links);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && links.length === 0 && !loading) fetchLinks();
  }, [isOpen, links.length, loading, fetchLinks]);

  async function createLink() {
    setCreating(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/team-invites", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetRole: newRole,
          label: newLabel.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.link) {
        setLinks(prev => [json.link, ...prev]);
        setNewLabel("");
        // Auto-copy the join URL
        if (json.joinUrl) {
          await navigator.clipboard.writeText(json.joinUrl);
          setCopied(json.link.id);
          setTimeout(() => setCopied(null), 3000);
        }
      }
    } catch { /* ignore */ } finally {
      setCreating(false);
    }
  }

  async function deactivateLink(id: string) {
    try {
      const token = await getAuthToken();
      if (!token) return;
      await fetch(`/api/team-invites?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setLinks(prev => prev.map(l => l.id === id ? { ...l, is_active: false } : l));
    } catch { /* ignore */ }
  }

  async function copyLink(link: InviteLink) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://micropulse.is";
    const url = `${origin}/join/${link.token}`;
    await navigator.clipboard.writeText(url);
    setCopied(link.id);
    setTimeout(() => setCopied(null), 3000);
  }

  const activeLinks = links.filter(l => l.is_active && (!l.expires_at || new Date(l.expires_at) > new Date()));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100">
            <svg className="h-5 w-5 text-violet-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Boðslinkur</div>
            <div className="text-xs text-slate-500">
              Búðu til link til að deila með leikmönnum eða þjálfurum
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeLinks.length > 0 && (
            <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
              {activeLinks.length} virk{activeLinks.length !== 1 ? "ir" : "ur"}
            </span>
          )}
          <svg className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-4 space-y-4">
          {/* Create new link */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div className="text-xs font-semibold text-slate-800">Nýr boðslinkur</div>
            <div className="flex items-center gap-2">
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value as "PLAYER" | "COACH")}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white"
              >
                <option value="PLAYER">Leikmaður</option>
                <option value="COACH">Þjálfari</option>
              </select>
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Lýsing (valfrjálst)"
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={createLink}
                disabled={creating}
                className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {creating ? "..." : "Búa til"}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Linkurinn gildir í 90 daga. Deila honum t.d. á WhatsApp hóp liðsins.
            </p>
          </div>

          {/* Active links */}
          {activeLinks.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-800">Virkir linkar</div>
              {activeLinks.map(link => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        link.target_role === "COACH" ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800"
                      }`}>
                        {link.target_role === "COACH" ? "Þjálfari" : "Leikmaður"}
                      </span>
                      {link.label && (
                        <span className="text-xs text-slate-600 truncate">{link.label}</span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-mono truncate">
                      /join/{link.token.slice(0, 12)}...
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyLink(link)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {copied === link.id ? "Afritað ✓" : "Afrita"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deactivateLink(link.id)}
                      className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                    >
                      Slökkva
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div className="text-xs text-slate-500">Sæki...</div>
          )}
        </div>
      )}
    </div>
  );
}
