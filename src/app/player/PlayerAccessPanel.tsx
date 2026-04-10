"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

// =============================================================================
// PlayerAccessPanel
// -----------------------------------------------------------------------------
// Shows the player who has access to their data and what consents are active.
// Lets them revoke consents. Read-only view of the access audit log.
//
// This panel is the user-facing side of the ownership model established in
// migrations 20260410080000..20260410100000. The schema enforces access via
// player_team_memberships + player_data_grants + player_consents; this panel
// exposes that state in a controlled way and lets the player revoke the only
// thing they should be able to revoke themselves: their own consents.
// =============================================================================

export type Lang = "IS" | "EN";

type MembershipRow = {
  id: string;
  role: string;
  status: string;
  valid_from: string;
  valid_to: string | null;
  team_id: string;
  teams:
    | {
        id: string;
        name: string;
        club_short_name: string | null;
        club_theme_color: string | null;
        team_type: string | null;
      }
    | Array<{
        id: string;
        name: string;
        club_short_name: string | null;
        club_theme_color: string | null;
        team_type: string | null;
      }>
    | null;
};

type ConsentRow = {
  id: string;
  consent_type: string;
  data_categories: string[] | null;
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

type AuditRow = {
  id: number;
  occurred_at: string;
  action: string;
  entity_type: string;
  team_id: string | null;
  actor_user_id: string | null;
};

type AuditEnriched = AuditRow & {
  actorLabel: string | null;
  teamName: string | null;
  teamColor: string | null;
  isSelf: boolean;
};

type GrantRow = {
  id: string;
  granted_to_team_id: string;
  data_categories: string[] | null;
  scope: string;
  valid_from: string;
  valid_to: string | null;
  status: string;
  teams:
    | {
        id: string;
        name: string;
        club_short_name: string | null;
        club_theme_color: string | null;
        team_type: string | null;
      }
    | Array<{
        id: string;
        name: string;
        club_short_name: string | null;
        club_theme_color: string | null;
        team_type: string | null;
      }>
    | null;
};

type Grant = {
  id: string;
  scope: string;
  status: string;
  dataCategories: string[];
  validFrom: string;
  validTo: string | null;
  team: TeamLite;
};

type TeamLite = {
  id: string;
  name: string;
  short: string | null;
  color: string | null;
  type: string | null;
};

type Membership = {
  id: string;
  role: string;
  status: string;
  validFrom: string;
  validTo: string | null;
  team: TeamLite;
};

// ---------- copy ----------
const COPY = {
  IS: {
    kicker: "Gögn",
    title: "Aðgangur & gögn",
    sub: "Sjáðu hverjir hafa aðgang að gögnunum þínum og stjórnaðu samþykkjum.",
    loading: "Hleð ...",
    memberships: "Virkar liðsaðildir",
    membershipsEmpty: "Engin virk liðsaðild.",
    grants: "Söguleg aðgangsheimild",
    grantsEmpty: "Engin söguleg aðgangsheimild.",
    grantScopeLive: "Lifandi",
    grantScopeHistoric: "Sögulegt",
    grantCategoriesLabel: "Flokkar",
    auditSelf: "Þú",
    auditSystem: "Kerfi",
    auditByLabel: "af",
    showMore: "Sjá fleiri",
    showMoreLoading: "Hleð ...",
    addConsent: "Bæta við samþykki",
    addConsentTitle: "Nýtt samþykki",
    addConsentHelp:
      "Veldu hvers konar samþykki þú vilt gefa. Þetta bætist við núverandi virk samþykki og má afturkalla hvenær sem er.",
    consentTypeLabel: "Tegund",
    consentTypePlaceholder: "Veldu tegund ...",
    notesLabel: "Athugasemd (valfrjáls)",
    cancel: "Hætta við",
    save: "Vista",
    saving: "Vista ...",
    errorAddConsent: "Gat ekki vistað samþykki.",
    duplicateConsent: "Þú ert þegar með virkt samþykki af þessari tegund.",
    minorCannotAdd:
      "Þú ert undir 18 ára — foreldri eða forráðamaður verður að bæta við parental samþykkjum.",
    consents: "Virk samþykki",
    consentsEmpty: "Engin virk samþykki.",
    revoke: "Afturkalla",
    revoking: "Afturkalla ...",
    revoked: "Afturkallað",
    audit: "Nýlegar aðgerðir",
    auditEmpty: "Engar aðgerðir skráðar.",
    sinceLabel: "Frá",
    untilLabel: "til",
    granted: "Gefið",
    relationship: "Samþ. af",
    proxyBadge: "Stop-gap (pre-existing)",
    confirmRevoke: "Ertu viss um að þú viljir afturkalla þetta samþykki? Þetta getur haft áhrif á aðgang þjálfara að gögnunum þínum.",
    errorLoading: "Gat ekki hlaðið aðgangsgögnum.",
    errorRevoke: "Gat ekki afturkallað samþykki.",
    minorBanner:
      "Þú ert undir 18 ára. Samþykki sem foreldri eða forráðamaður hefur gefið er ekki hægt að afturkalla hér — það verður að gerast með þátttöku fullorðins.",
    minorCannotRevoke: "Foreldrasamþykki — ekki afturkallanlegt hér",
  },
  EN: {
    kicker: "Data",
    title: "Access & data",
    sub: "See who has access to your data and manage your consents.",
    loading: "Loading ...",
    memberships: "Active team memberships",
    membershipsEmpty: "No active team memberships.",
    grants: "Historic data access",
    grantsEmpty: "No historic data grants.",
    grantScopeLive: "Live",
    grantScopeHistoric: "Historic",
    grantCategoriesLabel: "Categories",
    auditSelf: "You",
    auditSystem: "System",
    auditByLabel: "by",
    showMore: "Show more",
    showMoreLoading: "Loading ...",
    addConsent: "Add consent",
    addConsentTitle: "New consent",
    addConsentHelp:
      "Choose what kind of consent you want to grant. It will be added to your active consents and can be revoked at any time.",
    consentTypeLabel: "Type",
    consentTypePlaceholder: "Choose type ...",
    notesLabel: "Notes (optional)",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving ...",
    errorAddConsent: "Could not save consent.",
    duplicateConsent: "You already have an active consent of this type.",
    minorCannotAdd:
      "You are under 18 — a parent or guardian must add parental consents.",
    consents: "Active consents",
    consentsEmpty: "No active consents.",
    revoke: "Revoke",
    revoking: "Revoking ...",
    revoked: "Revoked",
    audit: "Recent activity",
    auditEmpty: "No access activity recorded.",
    sinceLabel: "From",
    untilLabel: "to",
    granted: "Granted",
    relationship: "Granted by",
    proxyBadge: "Stop-gap (pre-existing)",
    confirmRevoke: "Are you sure you want to revoke this consent? This may affect coaches' access to your data.",
    errorLoading: "Could not load access data.",
    errorRevoke: "Could not revoke consent.",
    minorBanner:
      "You are under 18. Consents granted by a parent or guardian cannot be revoked here — an adult must be involved.",
    minorCannotRevoke: "Parental consent — not revocable here",
  },
} as const;

// ---------- copy helpers ----------
function roleLabel(role: string, lang: Lang): string {
  if (lang === "IS") {
    switch (role) {
      case "primary_club": return "Aðalfélag";
      case "national_team": return "Landslið";
      case "loan": return "Lán";
      case "guest": return "Gestur";
      default: return role;
    }
  }
  switch (role) {
    case "primary_club": return "Primary club";
    case "national_team": return "National team";
    case "loan": return "Loan";
    case "guest": return "Guest";
    default: return role;
  }
}

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
    case "national_team_sharing": return "Sharing with national team";
    case "cross_team_write": return "Write-in from other teams";
    case "analytics_aggregation": return "Anonymized analytics";
    case "third_party_export": return "Export to third party";
    default: return type;
  }
}

function relationshipLabel(rel: string, lang: Lang): string {
  if (lang === "IS") {
    switch (rel) {
      case "self": return "Sjálfum/sjálfri";
      case "parent": return "Foreldri";
      case "guardian": return "Forráðamaður";
      case "club_proxy": return "Félag (proxy)";
      default: return rel;
    }
  }
  switch (rel) {
    case "self": return "Self";
    case "parent": return "Parent";
    case "guardian": return "Guardian";
    case "club_proxy": return "Club (proxy)";
    default: return rel;
  }
}

function actionLabel(action: string, entity: string, lang: Lang): string {
  const entityStr = lang === "IS"
    ? entity === "membership" ? "liðsaðild" : entity === "consent" ? "samþykki" : "aðgangur"
    : entity === "membership" ? "membership" : entity === "consent" ? "consent" : "grant";
  if (lang === "IS") {
    switch (action) {
      case "insert": return `${entityStr} stofnað`;
      case "update": return `${entityStr} uppfært`;
      case "revoke": return `${entityStr} afturkallað`;
      case "delete": return `${entityStr} eytt`;
      default: return `${action} · ${entityStr}`;
    }
  }
  switch (action) {
    case "insert": return `${entityStr} created`;
    case "update": return `${entityStr} updated`;
    case "revoke": return `${entityStr} revoked`;
    case "delete": return `${entityStr} deleted`;
    default: return `${action} · ${entityStr}`;
  }
}

function dataCategoryLabel(cat: string, lang: Lang): string {
  if (lang === "IS") {
    switch (cat) {
      case "load": return "Álag";
      case "rpe": return "RPE";
      case "gps": return "GPS";
      case "injuries": return "Meiðsli";
      case "readiness": return "Readiness";
      case "vald": return "VALD";
      case "whoop": return "WHOOP";
      default: return cat;
    }
  }
  switch (cat) {
    case "load": return "Load";
    case "rpe": return "RPE";
    case "gps": return "GPS";
    case "injuries": return "Injuries";
    case "readiness": return "Readiness";
    case "vald": return "VALD";
    case "whoop": return "WHOOP";
    default: return cat;
  }
}

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    const d = new Date(raw);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return raw;
  }
}

function fmtDateTime(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    const d = new Date(raw);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return raw;
  }
}

function teamBadgeBg(color: string | null): string {
  if (!color) return "rgba(100, 116, 139, 0.10)";
  return `${color}1a`;
}

// ---------- panel ----------
export default function PlayerAccessPanel({
  playerId,
  lang,
}: {
  playerId: string | null | undefined;
  lang: Lang;
}) {
  const t = COPY[lang];
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [audit, setAudit] = useState<AuditEnriched[]>([]);
  const [auditLimit, setAuditLimit] = useState<number>(20);
  const [auditHasMore, setAuditHasMore] = useState<boolean>(false);
  const [isMinor, setIsMinor] = useState<boolean>(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string>("");

  // Grant-new-consent form state
  const [addFormOpen, setAddFormOpen] = useState<boolean>(false);
  const [newConsentType, setNewConsentType] = useState<string>("");
  const [newNotes, setNewNotes] = useState<string>("");
  const [savingConsent, setSavingConsent] = useState<boolean>(false);
  const [addError, setAddError] = useState<string>("");

  const load = useCallback(async () => {
    if (!playerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [mRes, gRes, cRes, aRes, minorRes] = await Promise.all([
        supabase
          .from("player_team_memberships")
          .select(
            "id, role, status, valid_from, valid_to, team_id, teams(id, name, club_short_name, club_theme_color, team_type)"
          )
          .eq("player_id", playerId)
          .eq("status", "active"),
        supabase
          .from("player_data_grants")
          .select(
            "id, granted_to_team_id, data_categories, scope, valid_from, valid_to, status, teams:granted_to_team_id(id, name, club_short_name, club_theme_color, team_type)"
          )
          .eq("player_id", playerId)
          .eq("status", "active")
          .order("valid_from", { ascending: false }),
        supabase
          .from("player_consents")
          .select(
            "id, consent_type, data_categories, scoped_team_id, granted_by_relationship, granted_by_full_name, granted_at, valid_from, valid_to, revoked_at, source, notes"
          )
          .eq("player_id", playerId)
          .is("revoked_at", null)
          .order("granted_at", { ascending: false }),
        supabase
          .from("player_access_audit")
          .select("id, occurred_at, action, entity_type, team_id, actor_user_id")
          .eq("player_id", playerId)
          .order("occurred_at", { ascending: false })
          .limit(auditLimit + 1),
        supabase.rpc("is_minor", { p_player_id: playerId }),
      ]);

      if (mRes.error) throw mRes.error;
      if (gRes.error) throw gRes.error;
      if (cRes.error) throw cRes.error;
      if (aRes.error) throw aRes.error;
      // Non-fatal: if is_minor RPC errors we fail-safe to treating player as minor
      // (same policy as the SQL function itself).
      if (minorRes.error) {
        console.warn("[PlayerAccessPanel] is_minor rpc failed — failing safe to minor=true", minorRes.error);
        setIsMinor(true);
      } else {
        setIsMinor(minorRes.data === true);
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const memRows = (mRes.data ?? []) as unknown as MembershipRow[];
      const mapped: Membership[] = [];
      for (const row of memRows) {
        if (row.valid_from && row.valid_from > todayStr) continue;
        if (row.valid_to && row.valid_to < todayStr) continue;
        const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
        if (!team) continue;
        mapped.push({
          id: row.id,
          role: row.role,
          status: row.status,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          team: {
            id: team.id,
            name: team.name,
            short: team.club_short_name,
            color: team.club_theme_color,
            type: team.team_type,
          },
        });
      }
      const order: Record<string, number> = { primary_club: 0, national_team: 1, loan: 2, guest: 3 };
      mapped.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
      setMemberships(mapped);

      // Map data grants. We drop grants whose team we lost visibility on
      // (team may have been deleted) and grants expired in the past.
      const grantRows = (gRes.data ?? []) as unknown as GrantRow[];
      const mappedGrants: Grant[] = [];
      for (const row of grantRows) {
        if (row.valid_to && row.valid_to < new Date().toISOString()) continue;
        const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
        if (!team) continue;
        mappedGrants.push({
          id: row.id,
          scope: row.scope,
          status: row.status,
          dataCategories: row.data_categories ?? [],
          validFrom: row.valid_from,
          validTo: row.valid_to,
          team: {
            id: team.id,
            name: team.name,
            short: team.club_short_name,
            color: team.club_theme_color,
            type: team.team_type,
          },
        });
      }
      setGrants(mappedGrants);

      setConsents((cRes.data ?? []) as ConsentRow[]);

      // Audit enrichment
      const rawAudit = (aRes.data ?? []) as AuditRow[];
      const hasMore = rawAudit.length > auditLimit;
      const trimmed = hasMore ? rawAudit.slice(0, auditLimit) : rawAudit;
      setAuditHasMore(hasMore);

      // Collect distinct actor + team ids to batch-fetch labels
      const distinctActorIds = Array.from(
        new Set(trimmed.map((r) => r.actor_user_id).filter((v): v is string => !!v))
      );
      const distinctTeamIds = Array.from(
        new Set(trimmed.map((r) => r.team_id).filter((v): v is string => !!v))
      );

      // Current auth user id — used to flag "self" actions
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id ?? null;

      // Profiles batch fetch. RLS may only return rows the player can actually
      // see; the rest fall back to the generic "System" label.
      const profileById = new Map<string, string>();
      if (distinctActorIds.length > 0) {
        const { data: profRows } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", distinctActorIds);
        for (const row of (profRows ?? []) as Array<{ id: string; display_name: string | null }>) {
          if (row.display_name) profileById.set(row.id, row.display_name);
        }
      }

      // Teams batch fetch — same caveat with RLS; unknown ids just show no badge.
      const teamById = new Map<string, { name: string; color: string | null }>();
      // Seed with memberships + grants we already fetched so we don't need
      // extra round-trips for teams the player is already tied to.
      for (const m of mapped) {
        teamById.set(m.team.id, { name: m.team.name, color: m.team.color });
      }
      for (const g of mappedGrants) {
        teamById.set(g.team.id, { name: g.team.name, color: g.team.color });
      }
      const missingTeamIds = distinctTeamIds.filter((id) => !teamById.has(id));
      if (missingTeamIds.length > 0) {
        const { data: teamRows } = await supabase
          .from("teams")
          .select("id, name, club_short_name, club_theme_color")
          .in("id", missingTeamIds);
        for (const row of (teamRows ?? []) as Array<{
          id: string;
          name: string;
          club_short_name: string | null;
          club_theme_color: string | null;
        }>) {
          teamById.set(row.id, {
            name: row.club_short_name || row.name,
            color: row.club_theme_color,
          });
        }
      }

      const enriched: AuditEnriched[] = trimmed.map((r) => {
        const isSelf = !!currentUserId && r.actor_user_id === currentUserId;
        const profileName = r.actor_user_id ? profileById.get(r.actor_user_id) ?? null : null;
        const actorLabel = isSelf
          ? t.auditSelf
          : profileName
          ? profileName
          : r.actor_user_id
          ? t.auditSystem
          : t.auditSystem;
        const teamInfo = r.team_id ? teamById.get(r.team_id) ?? null : null;
        return {
          ...r,
          actorLabel,
          teamName: teamInfo?.name ?? null,
          teamColor: teamInfo?.color ?? null,
          isSelf,
        };
      });
      setAudit(enriched);
    } catch (e) {
      console.error("[PlayerAccessPanel] load failed", e);
      setError(t.errorLoading);
    } finally {
      setLoading(false);
    }
  }, [playerId, supabase, t.errorLoading, t.auditSelf, t.auditSystem, auditLimit]);

  useEffect(() => {
    load();
  }, [load]);

  const revokeConsent = useCallback(
    async (consentId: string) => {
      if (!window.confirm(t.confirmRevoke)) return;
      setRevokingId(consentId);
      setRevokeError("");
      try {
        const { error: rErr } = await supabase
          .from("player_consents")
          .update({ revoked_at: new Date().toISOString(), revoke_reason: "player_self_revoke" })
          .eq("id", consentId);
        if (rErr) throw rErr;
        // Optimistic remove
        setConsents((prev) => prev.filter((c) => c.id !== consentId));
        // Reload audit so the revoke entry shows up
        load();
      } catch (e) {
        console.error("[PlayerAccessPanel] revoke failed", e);
        setRevokeError(t.errorRevoke);
      } finally {
        setRevokingId(null);
      }
    },
    [supabase, t.confirmRevoke, t.errorRevoke, load]
  );

  const submitNewConsent = useCallback(async () => {
    if (!playerId || !newConsentType) return;
    // Duplicate guard: enforce client-side even though the schema allows it.
    // Players find it confusing to have two active rows of the same type.
    if (consents.some((c) => c.consent_type === newConsentType)) {
      setAddError(t.duplicateConsent);
      return;
    }
    setSavingConsent(true);
    setAddError("");
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? null;
      const { error: insErr } = await supabase.from("player_consents").insert({
        player_id: playerId,
        consent_type: newConsentType,
        granted_by_profile_id: userId,
        granted_by_relationship: "self",
        source: "web_form",
        notes: newNotes.trim() || null,
      });
      if (insErr) throw insErr;
      // Reset form and reload so audit + consents reflect the change
      setAddFormOpen(false);
      setNewConsentType("");
      setNewNotes("");
      await load();
    } catch (e) {
      console.error("[PlayerAccessPanel] add consent failed", e);
      setAddError(t.errorAddConsent);
    } finally {
      setSavingConsent(false);
    }
  }, [playerId, newConsentType, newNotes, consents, supabase, load, t.duplicateConsent, t.errorAddConsent]);

  // Consent types available for self-grant. For minors we hide parental-only
  // types so they don't accidentally create an invalid self-grant.
  const availableConsentTypes: Array<{ value: string; label: string }> = [
    { value: "data_processing", label: consentTypeLabel("data_processing", lang) },
    { value: "analytics_aggregation", label: consentTypeLabel("analytics_aggregation", lang) },
    { value: "third_party_export", label: consentTypeLabel("third_party_export", lang) },
    ...(isMinor
      ? []
      : [
          { value: "national_team_sharing", label: consentTypeLabel("national_team_sharing", lang) },
          { value: "cross_team_write", label: consentTypeLabel("cross_team_write", lang) },
        ]),
  ];

  if (!playerId) return null;

  return (
    <div className="rounded-2xl border bg-white shadow-sm" data-player-card="access">
      <div className="p-4 sm:p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t.kicker}</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">{t.title}</div>
          <div className="mt-1 text-sm text-zinc-600">{t.sub}</div>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-zinc-500">{t.loading}</div>
        ) : error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* Memberships */}
            <section>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {t.memberships}
              </div>
              {memberships.length === 0 ? (
                <div className="mt-2 text-sm text-zinc-500">{t.membershipsEmpty}</div>
              ) : (
                <ul className="mt-2 space-y-2">
                  {memberships.map((m) => {
                    const color = m.team.color || "#64748b";
                    const label = m.team.short || m.team.name;
                    return (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                            style={{ backgroundColor: teamBadgeBg(color), color }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: color }}
                            />
                            {label}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-zinc-900">
                              {m.team.name}
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              {roleLabel(m.role, lang)} · {t.sinceLabel} {fmtDate(m.validFrom)}
                              {m.validTo ? ` ${t.untilLabel} ${fmtDate(m.validTo)}` : ""}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Data grants (historic access) */}
            <section>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {t.grants}
              </div>
              {grants.length === 0 ? (
                <div className="mt-2 text-sm text-zinc-500">{t.grantsEmpty}</div>
              ) : (
                <ul className="mt-2 space-y-2">
                  {grants.map((g) => {
                    const color = g.team.color || "#64748b";
                    const label = g.team.short || g.team.name;
                    const scopeLabel =
                      g.scope === "live" ? t.grantScopeLive : t.grantScopeHistoric;
                    return (
                      <li
                        key={g.id}
                        className="rounded-xl border bg-white px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                              style={{ backgroundColor: teamBadgeBg(color), color }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: color }}
                              />
                              {label}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-zinc-900">
                                {g.team.name}
                              </div>
                              <div className="text-[11px] text-zinc-500">
                                {scopeLabel} · {t.sinceLabel} {fmtDate(g.validFrom)}
                                {g.validTo ? ` ${t.untilLabel} ${fmtDate(g.validTo)}` : ""}
                              </div>
                            </div>
                          </div>
                        </div>
                        {g.dataCategories.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                              {t.grantCategoriesLabel}:
                            </span>
                            {g.dataCategories.map((cat) => (
                              <span
                                key={cat}
                                className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-600"
                              >
                                {dataCategoryLabel(cat, lang)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Consents */}
            <section>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  {t.consents}
                </div>
                {!addFormOpen && availableConsentTypes.length > 0 ? (
                  <button
                    onClick={() => {
                      setAddError("");
                      setAddFormOpen(true);
                    }}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    + {t.addConsent}
                  </button>
                ) : null}
              </div>
              {isMinor ? (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  {t.minorBanner}
                </div>
              ) : null}
              {addFormOpen ? (
                <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-sm font-semibold text-zinc-900">
                    {t.addConsentTitle}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-600">
                    {t.addConsentHelp}
                  </div>
                  <div className="mt-3 space-y-2">
                    <label className="block text-[11px] font-semibold text-zinc-700">
                      {t.consentTypeLabel}
                    </label>
                    <select
                      value={newConsentType}
                      onChange={(e) => setNewConsentType(e.target.value)}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                    >
                      <option value="">{t.consentTypePlaceholder}</option>
                      {availableConsentTypes.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <label className="block text-[11px] font-semibold text-zinc-700">
                      {t.notesLabel}
                    </label>
                    <textarea
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                    />
                  </div>
                  {addError ? (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
                      {addError}
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setAddFormOpen(false);
                        setNewConsentType("");
                        setNewNotes("");
                        setAddError("");
                      }}
                      disabled={savingConsent}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={submitNewConsent}
                      disabled={savingConsent || !newConsentType}
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
                    const isProxy = c.source === "pre_existing_migration";
                    // A player may only revoke consents they granted themselves.
                    // If the player is a minor, parental/guardian consents are
                    // locked even though the RLS policy would technically allow
                    // a self-row update — we surface that as a disabled state
                    // with a clear explanation instead of a confusing error.
                    const isParentalLike =
                      c.granted_by_relationship === "parent" ||
                      c.granted_by_relationship === "guardian";
                    const lockedForMinor = isMinor && isParentalLike;
                    const canRevoke =
                      c.granted_by_relationship === "self" && !lockedForMinor;
                    return (
                      <li
                        key={c.id}
                        className="rounded-xl border bg-white px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-900">
                              {consentTypeLabel(c.consent_type, lang)}
                            </div>
                            <div className="mt-0.5 text-[11px] text-zinc-500">
                              {t.relationship}:{" "}
                              <span className="font-semibold text-zinc-700">
                                {relationshipLabel(c.granted_by_relationship, lang)}
                              </span>
                              {" · "}
                              {t.granted}: {fmtDate(c.granted_at)}
                            </div>
                            {isProxy ? (
                              <div className="mt-1 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                {t.proxyBadge}
                              </div>
                            ) : null}
                          </div>
                          {canRevoke ? (
                            <button
                              onClick={() => revokeConsent(c.id)}
                              disabled={revokingId === c.id}
                              className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                            >
                              {revokingId === c.id ? t.revoking : t.revoke}
                            </button>
                          ) : lockedForMinor ? (
                            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-500">
                              {t.minorCannotRevoke}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {revokeError ? (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
                  {revokeError}
                </div>
              ) : null}
            </section>

            {/* Audit log */}
            <section>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {t.audit}
              </div>
              {audit.length === 0 ? (
                <div className="mt-2 text-sm text-zinc-500">{t.auditEmpty}</div>
              ) : (
                <>
                  <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border">
                    {audit.map((row) => {
                      const teamColor = row.teamColor || "#64748b";
                      return (
                        <li
                          key={row.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]"
                        >
                          <div className="min-w-0 flex flex-col gap-0.5">
                            <span className="text-zinc-700">
                              {actionLabel(row.action, row.entity_type, lang)}
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {t.auditByLabel}{" "}
                              <span
                                className={
                                  row.isSelf
                                    ? "font-semibold text-zinc-800"
                                    : "font-semibold text-zinc-700"
                                }
                              >
                                {row.actorLabel}
                              </span>
                              {row.teamName ? (
                                <>
                                  {" · "}
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                                    style={{
                                      backgroundColor: teamBadgeBg(teamColor),
                                      color: teamColor,
                                    }}
                                  >
                                    <span
                                      className="h-1 w-1 rounded-full"
                                      style={{ background: teamColor }}
                                    />
                                    {row.teamName}
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </div>
                          <span className="tabular-nums text-zinc-400">
                            {fmtDateTime(row.occurred_at)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {auditHasMore ? (
                    <div className="mt-2 flex justify-center">
                      <button
                        onClick={() => setAuditLimit((n) => n + 40)}
                        disabled={loading}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        {loading ? t.showMoreLoading : t.showMore}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
