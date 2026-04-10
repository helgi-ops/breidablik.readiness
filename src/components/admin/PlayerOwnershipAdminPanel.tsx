"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatTeamLabel } from "@/lib/teamLabels";

// =============================================================================
// PlayerOwnershipAdminPanel
// -----------------------------------------------------------------------------
// Admin / coach side of the data-ownership model. Mirrors PlayerAccessPanel
// (player-facing) but with the privileges an admin or club coach actually
// needs to operate the system:
//
//   1. View a player's memberships, data grants, consents and audit log.
//   2. Edit date_of_birth (needed to resolve the minor-gate on national-team
//      memberships).
//   3. Add a membership (primary_club / national_team / loan / guest). The
//      database trigger enforces that national_team memberships for minors
//      require a parental consent — we surface any raised error directly.
//   4. End a membership (sets status=ended + valid_to=today).
//   5. Add a consent as club_proxy with a parent/guardian name on paper, so
//      the club can record parental consent captured offline.
//   6. Revoke a consent.
//
// The component does NOT try to be org-wide — that lives in a separate
// dashboard. This one assumes you already picked a player to drill into.
// =============================================================================

export type Lang = "IS" | "EN";

type TeamRow = {
  id: string;
  name: string;
  sport: string | null;
  gender: string | null;
  club_short_name: string | null;
  club_theme_color: string | null;
  team_type: string | null;
};

type MembershipRow = {
  id: string;
  role: string;
  status: string;
  valid_from: string;
  valid_to: string | null;
  team_id: string;
  teams: TeamRow | TeamRow[] | null;
};

type Membership = {
  id: string;
  role: string;
  status: string;
  validFrom: string;
  validTo: string | null;
  team: { id: string; name: string; short: string | null; color: string | null; type: string | null };
};

type ConsentRow = {
  id: string;
  consent_type: string;
  scoped_team_id: string | null;
  granted_by_relationship: string;
  granted_by_full_name: string | null;
  granted_at: string;
  valid_from: string;
  valid_to: string | null;
  revoked_at: string | null;
  source: string | null;
  notes: string | null;
};

type GrantRow = {
  id: string;
  granted_to_team_id: string;
  data_categories: string[] | null;
  scope: string;
  valid_from: string;
  valid_to: string | null;
  status: string;
};

type AuditRow = {
  id: number;
  occurred_at: string;
  action: string;
  entity_type: string;
  team_id: string | null;
  actor_user_id: string | null;
};

type PlayerCore = {
  id: string;
  full_name: string | null;
  date_of_birth: string | null;
  team_id: string | null;
};

// ---------- copy ----------
const COPY = {
  IS: {
    kicker: "Admin",
    title: "Eignarhald & aðgangur",
    sub: "Stjórna liðsaðildum, samþykkjum og sögulegum aðgangi.",
    loading: "Hleð ...",
    dob: "Fæðingardagur",
    dobUnknown: "Óþekktur — meðhöndlað sem ólögráða",
    dobSave: "Vista",
    dobSaving: "Vista ...",
    isMinorTrue: "Ólögráða (< 18)",
    isMinorFalse: "Fullorðinn",
    memberships: "Liðsaðildir",
    addMembership: "+ Ný aðild",
    membershipsEmpty: "Engin aðild skráð.",
    endMembership: "Slíta",
    ending: "Sláandi ...",
    grants: "Aðgangsheimildir (grants)",
    grantsEmpty: "Engar aðgangsheimildir.",
    revokeGrant: "Afturkalla",
    consents: "Samþykki",
    consentsEmpty: "Engin samþykki.",
    addConsent: "+ Skrá samþykki",
    revokeConsent: "Afturkalla",
    audit: "Aðgangsferill (nýjast)",
    auditEmpty: "Ekkert í ferli.",
    selectTeam: "Veldu lið ...",
    selectRole: "Veldu hlutverk ...",
    role_primary_club: "Aðalfélag",
    role_national_team: "Landslið",
    role_loan: "Lán",
    role_guest: "Gestur",
    consentType: "Samþykkistegund",
    relationship: "Samþykki gefið af",
    rel_self: "Sjálfum sér",
    rel_parent: "Foreldri",
    rel_guardian: "Forráðamaður",
    rel_club_proxy: "Félag (proxy)",
    fullName: "Nafn (prent)",
    notes: "Athugasemd",
    save: "Vista",
    saving: "Vista ...",
    cancel: "Hætta við",
    errGeneric: "Aðgerð tókst ekki.",
    errLoading: "Gat ekki hlaðið gögnum.",
    errMinorTrigger:
      "Það verður að vera virkt parental samþykki (national_team_sharing) áður en hægt er að virkja landsliðsaðild fyrir ólögráða.",
    scope_all_teams: "Öll lið",
  },
  EN: {
    kicker: "Admin",
    title: "Ownership & access",
    sub: "Manage memberships, consents and historic access.",
    loading: "Loading ...",
    dob: "Date of birth",
    dobUnknown: "Unknown — treated as minor",
    dobSave: "Save",
    dobSaving: "Saving ...",
    isMinorTrue: "Minor (< 18)",
    isMinorFalse: "Adult",
    memberships: "Memberships",
    addMembership: "+ New membership",
    membershipsEmpty: "No memberships.",
    endMembership: "End",
    ending: "Ending ...",
    grants: "Data grants",
    grantsEmpty: "No grants.",
    revokeGrant: "Revoke",
    consents: "Consents",
    consentsEmpty: "No consents.",
    addConsent: "+ Record consent",
    revokeConsent: "Revoke",
    audit: "Audit trail (latest)",
    auditEmpty: "No audit activity.",
    selectTeam: "Choose team ...",
    selectRole: "Choose role ...",
    role_primary_club: "Primary club",
    role_national_team: "National team",
    role_loan: "Loan",
    role_guest: "Guest",
    consentType: "Consent type",
    relationship: "Granted by",
    rel_self: "Self",
    rel_parent: "Parent",
    rel_guardian: "Guardian",
    rel_club_proxy: "Club (proxy)",
    fullName: "Name (printed)",
    notes: "Notes",
    save: "Save",
    saving: "Saving ...",
    cancel: "Cancel",
    errGeneric: "Action failed.",
    errLoading: "Could not load data.",
    errMinorTrigger:
      "National-team membership for a minor requires an active parental consent (national_team_sharing).",
    scope_all_teams: "All teams",
  },
} as const;

function consentTypeLabel(type: string, lang: Lang): string {
  if (lang === "IS") {
    switch (type) {
      case "data_processing": return "Almenn gagnavinnsla";
      case "national_team_sharing": return "Deiling með landsliði";
      case "cross_team_write": return "Innskrifun frá öðrum liðum";
      case "analytics_aggregation": return "Nafnlaus rannsóknarvinnsla";
      case "third_party_export": return "Útflutningur til þriðja aðila";
      default: return type;
    }
  }
  switch (type) {
    case "data_processing": return "General data processing";
    case "national_team_sharing": return "National team sharing";
    case "cross_team_write": return "Cross-team write";
    case "analytics_aggregation": return "Anonymized analytics";
    case "third_party_export": return "Third-party export";
    default: return type;
  }
}

const CONSENT_TYPES = [
  "data_processing",
  "national_team_sharing",
  "cross_team_write",
  "analytics_aggregation",
  "third_party_export",
] as const;

const MEMBERSHIP_ROLES = ["primary_club", "national_team", "loan", "guest"] as const;

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    return new Date(raw).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return raw;
  }
}

function roleLabel(role: string, t: typeof COPY.IS | typeof COPY.EN): string {
  switch (role) {
    case "primary_club": return t.role_primary_club;
    case "national_team": return t.role_national_team;
    case "loan": return t.role_loan;
    case "guest": return t.role_guest;
    default: return role;
  }
}

function relationshipLabel(rel: string, t: typeof COPY.IS | typeof COPY.EN): string {
  switch (rel) {
    case "self": return t.rel_self;
    case "parent": return t.rel_parent;
    case "guardian": return t.rel_guardian;
    case "club_proxy": return t.rel_club_proxy;
    default: return rel;
  }
}

function computeIsMinor(dob: string | null): boolean {
  if (!dob) return true;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return true;
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
  return d > eighteenYearsAgo;
}

// ---------- component ----------
export default function PlayerOwnershipAdminPanel({
  playerId,
  lang,
}: {
  playerId: string;
  lang: Lang;
}) {
  const t = COPY[lang];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [player, setPlayer] = useState<PlayerCore | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  // DOB edit
  const [dobDraft, setDobDraft] = useState<string>("");
  const [savingDob, setSavingDob] = useState(false);

  // Add membership form
  const [addMemOpen, setAddMemOpen] = useState(false);
  const [newMemTeamId, setNewMemTeamId] = useState<string>("");
  const [newMemRole, setNewMemRole] = useState<string>("");
  const [savingMem, setSavingMem] = useState(false);
  const [memError, setMemError] = useState("");

  // Add consent form
  const [addConsentOpen, setAddConsentOpen] = useState(false);
  const [newConsentType, setNewConsentType] = useState<string>("");
  const [newConsentRel, setNewConsentRel] = useState<string>("club_proxy");
  const [newConsentName, setNewConsentName] = useState<string>("");
  const [newConsentScopeTeamId, setNewConsentScopeTeamId] = useState<string>("");
  const [newConsentNotes, setNewConsentNotes] = useState<string>("");
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentError, setConsentError] = useState("");

  // Per-row busy spinners
  const [busyId, setBusyId] = useState<string | null>(null);

  const isMinor = useMemo(() => computeIsMinor(player?.date_of_birth ?? null), [player]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pRes, tRes, mRes, gRes, cRes, aRes] = await Promise.all([
        supabase
          .from("players")
          .select("id, full_name, date_of_birth, team_id")
          .eq("id", playerId)
          .maybeSingle(),
        supabase
          .from("teams")
          .select("id, name, sport, gender, club_short_name, club_theme_color, team_type")
          .order("name", { ascending: true }),
        supabase
          .from("player_team_memberships")
          .select(
            "id, role, status, valid_from, valid_to, team_id, teams(id, name, club_short_name, club_theme_color, team_type)"
          )
          .eq("player_id", playerId)
          .order("valid_from", { ascending: false }),
        supabase
          .from("player_data_grants")
          .select("id, granted_to_team_id, data_categories, scope, valid_from, valid_to, status")
          .eq("player_id", playerId)
          .order("valid_from", { ascending: false }),
        supabase
          .from("player_consents")
          .select(
            "id, consent_type, scoped_team_id, granted_by_relationship, granted_by_full_name, granted_at, valid_from, valid_to, revoked_at, source, notes"
          )
          .eq("player_id", playerId)
          .order("granted_at", { ascending: false }),
        supabase
          .from("player_access_audit")
          .select("id, occurred_at, action, entity_type, team_id, actor_user_id")
          .eq("player_id", playerId)
          .order("occurred_at", { ascending: false })
          .limit(30),
      ]);

      if (pRes.error) throw pRes.error;
      if (tRes.error) throw tRes.error;
      if (mRes.error) throw mRes.error;
      if (gRes.error) throw gRes.error;
      if (cRes.error) throw cRes.error;
      if (aRes.error) throw aRes.error;

      setPlayer((pRes.data ?? null) as PlayerCore | null);
      setDobDraft((pRes.data as PlayerCore | null)?.date_of_birth ?? "");
      setTeams((tRes.data ?? []) as TeamRow[]);

      const mRows = (mRes.data ?? []) as unknown as MembershipRow[];
      const mapped: Membership[] = mRows.map((row) => {
        const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
        return {
          id: row.id,
          role: row.role,
          status: row.status,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          team: team
            ? {
                id: team.id,
                name: team.name,
                short: team.club_short_name,
                color: team.club_theme_color,
                type: team.team_type,
              }
            : { id: row.team_id, name: row.team_id, short: null, color: null, type: null },
        };
      });
      setMemberships(mapped);

      setGrants((gRes.data ?? []) as GrantRow[]);
      setConsents((cRes.data ?? []) as ConsentRow[]);
      setAudit((aRes.data ?? []) as AuditRow[]);
    } catch (e) {
      console.error("[PlayerOwnershipAdminPanel] load failed", e);
      setError(t.errLoading);
    } finally {
      setLoading(false);
    }
  }, [playerId, t.errLoading]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- mutations ----------
  const saveDob = useCallback(async () => {
    if (!player) return;
    setSavingDob(true);
    try {
      const { error: e } = await supabase
        .from("players")
        .update({ date_of_birth: dobDraft || null })
        .eq("id", player.id);
      if (e) throw e;
      await load();
    } catch (e) {
      console.error("[PlayerOwnershipAdminPanel] dob save failed", e);
      setError(t.errGeneric);
    } finally {
      setSavingDob(false);
    }
  }, [player, dobDraft, load, t.errGeneric]);

  const submitNewMembership = useCallback(async () => {
    if (!newMemTeamId || !newMemRole) return;
    setSavingMem(true);
    setMemError("");
    try {
      const { error: e } = await supabase.from("player_team_memberships").insert({
        player_id: playerId,
        team_id: newMemTeamId,
        role: newMemRole,
        status: "active",
      });
      if (e) {
        // Pretty-print the minor gate error if we see it
        if (e.message && e.message.includes("parental consent")) {
          setMemError(t.errMinorTrigger);
          return;
        }
        throw e;
      }
      setAddMemOpen(false);
      setNewMemTeamId("");
      setNewMemRole("");
      await load();
    } catch (e) {
      console.error("[PlayerOwnershipAdminPanel] add membership failed", e);
      setMemError(t.errGeneric);
    } finally {
      setSavingMem(false);
    }
  }, [playerId, newMemTeamId, newMemRole, load, t.errGeneric, t.errMinorTrigger]);

  const endMembership = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { error: e } = await supabase
          .from("player_team_memberships")
          .update({ status: "ended", valid_to: today })
          .eq("id", id);
        if (e) throw e;
        await load();
      } catch (e) {
        console.error("[PlayerOwnershipAdminPanel] end membership failed", e);
        setError(t.errGeneric);
      } finally {
        setBusyId(null);
      }
    },
    [load, t.errGeneric]
  );

  const submitNewConsent = useCallback(async () => {
    if (!newConsentType || !newConsentRel) return;
    setSavingConsent(true);
    setConsentError("");
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? null;
      const { error: e } = await supabase.from("player_consents").insert({
        player_id: playerId,
        consent_type: newConsentType,
        granted_by_profile_id: userId,
        granted_by_relationship: newConsentRel,
        granted_by_full_name: newConsentName.trim() || null,
        scoped_team_id: newConsentScopeTeamId || null,
        source: "web_form",
        notes: newConsentNotes.trim() || null,
      });
      if (e) throw e;
      setAddConsentOpen(false);
      setNewConsentType("");
      setNewConsentRel("club_proxy");
      setNewConsentName("");
      setNewConsentScopeTeamId("");
      setNewConsentNotes("");
      await load();
    } catch (e) {
      console.error("[PlayerOwnershipAdminPanel] add consent failed", e);
      setConsentError(t.errGeneric);
    } finally {
      setSavingConsent(false);
    }
  }, [
    playerId,
    newConsentType,
    newConsentRel,
    newConsentName,
    newConsentScopeTeamId,
    newConsentNotes,
    load,
    t.errGeneric,
  ]);

  const revokeConsent = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const { error: e } = await supabase
          .from("player_consents")
          .update({
            revoked_at: new Date().toISOString(),
            revoke_reason: "admin_revoke",
          })
          .eq("id", id);
        if (e) throw e;
        await load();
      } catch (e) {
        console.error("[PlayerOwnershipAdminPanel] revoke consent failed", e);
        setError(t.errGeneric);
      } finally {
        setBusyId(null);
      }
    },
    [load, t.errGeneric]
  );

  const revokeGrant = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const { error: e } = await supabase
          .from("player_data_grants")
          .update({ status: "revoked", revoked_at: new Date().toISOString() })
          .eq("id", id);
        if (e) throw e;
        await load();
      } catch (e) {
        console.error("[PlayerOwnershipAdminPanel] revoke grant failed", e);
        setError(t.errGeneric);
      } finally {
        setBusyId(null);
      }
    },
    [load, t.errGeneric]
  );

  // ---------- render ----------
  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-500">
        {t.loading}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="p-4 sm:p-5 space-y-5">
        {/* Header */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {t.kicker}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-zinc-900">
              {player?.full_name ?? playerId}
            </div>
            <span
              className={
                isMinor
                  ? "rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800"
                  : "rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold text-zinc-700"
              }
            >
              {isMinor ? t.isMinorTrue : t.isMinorFalse}
            </span>
          </div>
          <div className="mt-1 text-sm text-zinc-600">{t.sub}</div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {/* DOB edit */}
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {t.dob}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dobDraft}
              onChange={(e) => setDobDraft(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
            />
            <button
              onClick={saveDob}
              disabled={savingDob || dobDraft === (player?.date_of_birth ?? "")}
              className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {savingDob ? t.dobSaving : t.dobSave}
            </button>
            {!player?.date_of_birth ? (
              <span className="text-[11px] text-amber-800">{t.dobUnknown}</span>
            ) : null}
          </div>
        </section>

        {/* Memberships */}
        <section>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {t.memberships}
            </div>
            {!addMemOpen ? (
              <button
                onClick={() => setAddMemOpen(true)}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                {t.addMembership}
              </button>
            ) : null}
          </div>

          {addMemOpen ? (
            <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
              <select
                value={newMemTeamId}
                onChange={(e) => setNewMemTeamId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">{t.selectTeam}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {formatTeamLabel(team, lang)}
                    {team.team_type === "national_team" ? " · NT" : ""}
                  </option>
                ))}
              </select>
              <select
                value={newMemRole}
                onChange={(e) => setNewMemRole(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">{t.selectRole}</option>
                {MEMBERSHIP_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r, t)}
                  </option>
                ))}
              </select>
              {memError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
                  {memError}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setAddMemOpen(false);
                    setNewMemTeamId("");
                    setNewMemRole("");
                    setMemError("");
                  }}
                  disabled={savingMem}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={submitNewMembership}
                  disabled={savingMem || !newMemTeamId || !newMemRole}
                  className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {savingMem ? t.saving : t.save}
                </button>
              </div>
            </div>
          ) : null}

          {memberships.length === 0 ? (
            <div className="mt-2 text-sm text-zinc-500">{t.membershipsEmpty}</div>
          ) : (
            <ul className="mt-2 space-y-2">
              {memberships.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {m.team.name}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {roleLabel(m.role, t)} · {m.status} · {fmtDate(m.validFrom)}
                      {m.validTo ? ` → ${fmtDate(m.validTo)}` : ""}
                    </div>
                  </div>
                  {m.status === "active" ? (
                    <button
                      onClick={() => endMembership(m.id)}
                      disabled={busyId === m.id}
                      className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {busyId === m.id ? t.ending : t.endMembership}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Consents */}
        <section>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {t.consents}
            </div>
            {!addConsentOpen ? (
              <button
                onClick={() => setAddConsentOpen(true)}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                {t.addConsent}
              </button>
            ) : null}
          </div>

          {addConsentOpen ? (
            <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
              <label className="block text-[11px] font-semibold text-zinc-700">
                {t.consentType}
              </label>
              <select
                value={newConsentType}
                onChange={(e) => setNewConsentType(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                {CONSENT_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {consentTypeLabel(c, lang)}
                  </option>
                ))}
              </select>
              <label className="block text-[11px] font-semibold text-zinc-700">
                {t.relationship}
              </label>
              <select
                value={newConsentRel}
                onChange={(e) => setNewConsentRel(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="club_proxy">{t.rel_club_proxy}</option>
                <option value="parent">{t.rel_parent}</option>
                <option value="guardian">{t.rel_guardian}</option>
                <option value="self">{t.rel_self}</option>
              </select>
              <label className="block text-[11px] font-semibold text-zinc-700">
                {t.fullName}
              </label>
              <input
                type="text"
                value={newConsentName}
                onChange={(e) => setNewConsentName(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
              <label className="block text-[11px] font-semibold text-zinc-700">
                {t.scope_all_teams}
              </label>
              <select
                value={newConsentScopeTeamId}
                onChange={(e) => setNewConsentScopeTeamId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {formatTeamLabel(team, lang)}
                  </option>
                ))}
              </select>
              <label className="block text-[11px] font-semibold text-zinc-700">
                {t.notes}
              </label>
              <textarea
                value={newConsentNotes}
                onChange={(e) => setNewConsentNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
              {consentError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
                  {consentError}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setAddConsentOpen(false);
                    setConsentError("");
                  }}
                  disabled={savingConsent}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={submitNewConsent}
                  disabled={savingConsent || !newConsentType || !newConsentRel}
                  className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {savingConsent ? t.saving : t.save}
                </button>
              </div>
            </div>
          ) : null}

          {consents.length === 0 ? (
            <div className="mt-2 text-sm text-zinc-500">{t.consentsEmpty}</div>
          ) : (
            <ul className="mt-2 space-y-2">
              {consents.map((c) => {
                const isActive = !c.revoked_at;
                return (
                  <li
                    key={c.id}
                    className={`rounded-xl border px-3 py-2 ${isActive ? "bg-white" : "bg-zinc-50 opacity-70"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900">
                          {consentTypeLabel(c.consent_type, lang)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {t.relationship}:{" "}
                          <span className="font-semibold text-zinc-700">
                            {relationshipLabel(c.granted_by_relationship, t)}
                          </span>
                          {c.granted_by_full_name ? ` · ${c.granted_by_full_name}` : ""}
                          {" · "}
                          {fmtDate(c.granted_at)}
                          {c.revoked_at ? ` · revoked ${fmtDate(c.revoked_at)}` : ""}
                        </div>
                      </div>
                      {isActive ? (
                        <button
                          onClick={() => revokeConsent(c.id)}
                          disabled={busyId === c.id}
                          className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {t.revokeConsent}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Grants */}
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {t.grants}
          </div>
          {grants.length === 0 ? (
            <div className="mt-2 text-sm text-zinc-500">{t.grantsEmpty}</div>
          ) : (
            <ul className="mt-2 space-y-2">
              {grants.map((g) => {
                const team = teams.find((x) => x.id === g.granted_to_team_id);
                const isActive = g.status === "active";
                return (
                  <li
                    key={g.id}
                    className={`rounded-xl border px-3 py-2 ${isActive ? "bg-white" : "bg-zinc-50 opacity-70"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">
                          {team?.name ?? g.granted_to_team_id}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {g.scope} · {g.status} · {fmtDate(g.valid_from)}
                          {g.valid_to ? ` → ${fmtDate(g.valid_to)}` : ""}
                          {g.data_categories && g.data_categories.length > 0
                            ? ` · ${g.data_categories.join(", ")}`
                            : ""}
                        </div>
                      </div>
                      {isActive ? (
                        <button
                          onClick={() => revokeGrant(g.id)}
                          disabled={busyId === g.id}
                          className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {t.revokeGrant}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Audit */}
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {t.audit}
          </div>
          {audit.length === 0 ? (
            <div className="mt-2 text-sm text-zinc-500">{t.auditEmpty}</div>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border">
              {audit.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-[12px]"
                >
                  <span className="text-zinc-700">
                    {r.action} · {r.entity_type}
                  </span>
                  <span className="tabular-nums text-zinc-400">
                    {new Date(r.occurred_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
