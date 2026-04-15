"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type TeamRow = {
  id: string;
  name: string;
  sport: string | null;
  gender: string | null;
  team_type: string | null;
};

type Invite = {
  id: string;
  team_id: string;
  coach_email: string;
  coach_name: string | null;
  role: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  notes: string | null;
  email_sent_at: string | null;
  email_error: string | null;
};

function teamLabel(t: TeamRow | undefined) {
  if (!t) return "";
  const parts: string[] = [t.name];
  if (t.sport) parts.push(t.sport);
  if (t.gender) parts.push(t.gender);
  if (t.team_type && t.team_type !== "club_team") parts.push(t.team_type);
  return parts.join(" · ");
}

export default function CoachInvitesClient() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  const [invites, setInvites] = useState<Invite[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("coach");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastAcceptUrl, setLastAcceptUrl] = useState<string | null>(null);

  /* ── Load the set of teams this user can invite into ─ */
  const loadTeams = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        setLoadError("Not signed in.");
        return;
      }

      // Staff can see all teams; otherwise restrict to coach_teams rows.
      const { data: staff } = await supabase
        .from("staff_users")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      let teamRows: TeamRow[] = [];
      if (staff) {
        const { data, error } = await supabase
          .from("teams")
          .select("id, name, sport, gender, team_type")
          .order("name");
        if (error) throw new Error(error.message);
        teamRows = (data ?? []) as TeamRow[];
      } else {
        const { data: memberships, error: mErr } = await supabase
          .from("coach_teams")
          .select("team_id")
          .eq("coach_id", userId);
        if (mErr) throw new Error(mErr.message);
        const ids = (memberships ?? []).map((r) => r.team_id as string);
        if (ids.length === 0) {
          teamRows = [];
        } else {
          const { data, error } = await supabase
            .from("teams")
            .select("id, name, sport, gender, team_type")
            .in("id", ids)
            .order("name");
          if (error) throw new Error(error.message);
          teamRows = (data ?? []) as TeamRow[];
        }
      }

      setTeams(teamRows);
      if (teamRows.length && !selectedTeamId) {
        setSelectedTeamId(teamRows[0].id);
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  /* ── Load invites for the selected team ──────────────── */
  const loadInvites = useCallback(async () => {
    if (!selectedTeamId) {
      setInvites([]);
      return;
    }
    setListLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) return;
      const res = await fetch(`/api/coach-invites?team_id=${selectedTeamId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setInvites([]);
        return;
      }
      setInvites((json.invitations ?? []) as Invite[]);
    } finally {
      setListLoading(false);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const teamById = useMemo(() => {
    const map = new Map<string, TeamRow>();
    teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  async function createInvite() {
    setSubmitError(null);
    setLastAcceptUrl(null);
    if (!selectedTeamId) return;
    if (!email.includes("@")) {
      setSubmitError("Valid email required");
      return;
    }
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) throw new Error("Not signed in");
      const res = await fetch("/api/coach-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          teamId: selectedTeamId,
          email: email.trim(),
          name: name.trim() || undefined,
          role: role.trim() || "coach",
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json?.error ?? "Failed");
        return;
      }
      setLastAcceptUrl(json.acceptUrl ?? null);
      if (json.emailSent === false && json.emailError) {
        setSubmitError(`Invite created but email failed: ${json.emailError}`);
      }
      setEmail("");
      setName("");
      setNotes("");
      void loadInvites();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeInvite(id: string) {
    const { data: sess } = await supabase.auth.getSession();
    const jwt = sess.session?.access_token;
    if (!jwt) return;
    await fetch(`/api/coach-invites?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${jwt}` },
    });
    void loadInvites();
  }

  async function resendInvite(token: string) {
    const { data: sess } = await supabase.auth.getSession();
    const jwt = sess.session?.access_token;
    if (!jwt) return;
    const res = await fetch(`/api/coach-invites/${token}/resend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(`Resend failed: ${json?.error ?? res.status}`);
    }
    void loadInvites();
  }

  function copyUrl(url: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(url);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-neutral-500">Admin</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Coach invitations</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Invite a new coach onto a specific team. On accept, a coach_teams row is created automatically.
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg border px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          ← Admin
        </Link>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : teams.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-neutral-600">
          You are not on any teams yet. A staff member needs to create a team or invite you first.
        </div>
      ) : (
        <>
          {/* Team picker */}
          <div className="mb-6 rounded-3xl border bg-white p-5 shadow-sm">
            <label className="grid gap-1.5 text-sm">
              <span className="text-neutral-700">Team</span>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="rounded-xl border px-3 py-2"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {teamLabel(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Create form */}
          <div className="mb-6 rounded-3xl border bg-white p-5 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-neutral-700">Send invitation</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-neutral-600">Coach email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="coach@example.is"
                  className="rounded-xl border px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-neutral-600">Name (optional)</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="rounded-xl border px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-neutral-600">Role</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="rounded-xl border px-3 py-2"
                >
                  <option value="coach">coach</option>
                  <option value="head_coach">head_coach</option>
                  <option value="assistant_coach">assistant_coach</option>
                  <option value="analyst">analyst</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="text-neutral-600">Notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="rounded-xl border px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void createInvite()}
                disabled={submitting || !email || !selectedTeamId}
                className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Create invitation"}
              </button>
              {submitError && <span className="text-sm text-red-600">{submitError}</span>}
            </div>
            {lastAcceptUrl && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <div className="text-emerald-800">Invitation created. Share this link:</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded border bg-white px-2 py-1 text-xs">
                    {lastAcceptUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyUrl(lastAcceptUrl)}
                    className="rounded-lg border bg-white px-2 py-1 text-xs hover:bg-neutral-50"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Existing invites */}
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-neutral-700">Invitations for {teamLabel(teamById.get(selectedTeamId))}</div>
              <button
                type="button"
                onClick={() => void loadInvites()}
                className="text-xs font-medium text-neutral-500 underline hover:text-neutral-900"
              >
                Refresh
              </button>
            </div>
            {listLoading ? (
              <div className="text-sm text-neutral-500">Loading…</div>
            ) : invites.length === 0 ? (
              <div className="text-sm text-neutral-500">No invitations yet.</div>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Expires</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => {
                      const url =
                        typeof window !== "undefined"
                          ? `${window.location.origin}/invite/coach/${inv.token}`
                          : "";
                      const expired = new Date(inv.expires_at).getTime() < Date.now();
                      const displayStatus =
                        inv.status === "pending" && expired ? "expired" : inv.status;
                      return (
                        <tr key={inv.id} className="border-t">
                          <td className="px-3 py-2 font-medium">{inv.coach_email}</td>
                          <td className="px-3 py-2 text-neutral-600">{inv.coach_name ?? "—"}</td>
                          <td className="px-3 py-2 text-neutral-600">{inv.role}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                displayStatus === "accepted"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : displayStatus === "pending"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {displayStatus}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {inv.email_sent_at ? (
                              <span
                                className="text-emerald-700"
                                title={`Sent ${new Date(inv.email_sent_at).toLocaleString()}`}
                              >
                                sent
                              </span>
                            ) : inv.email_error ? (
                              <span className="text-red-600" title={inv.email_error}>
                                failed
                              </span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-neutral-500">
                            {new Date(inv.expires_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {displayStatus === "pending" && (
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void resendInvite(inv.token)}
                                  className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
                                >
                                  Resend email
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyUrl(url)}
                                  className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50"
                                >
                                  Copy link
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void revokeInvite(inv.id)}
                                  className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                >
                                  Revoke
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
