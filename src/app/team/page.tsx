"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  Plus,
  X,
  Pin,
  AlertCircle,
  FileText,
  Trash2,
  Upload,
  ExternalLink,
} from "lucide-react";
import WeeklyCalendar from "./WeeklyCalendar";
import PtClientGuard from "@/components/auth/PtClientGuard";
import TeamTrainingSection from "@/components/team/TeamTrainingSection";
import StreakCard from "@/components/player/StreakCard";
import { useLang } from "@/lib/lang";

interface User {
  id: string;
  email: string;
}

interface Profile {
  team_id: string;
  role: "player" | "coach" | "admin";
}

interface TeamData {
  team: {
    id: string;
    name: string;
    sport: string;
    gender: string | null;
    club_theme_color: string | null;
    club_logo_url: string | null;
    club_short_name: string | null;
    plan_tier: string | null;
    gps_provider: string | null;
  };
  roster: Array<{
    id: string;
    full_name: string;
    position: string | null;
    status: string;
  }>;
  coaches: Array<{
    id: string;
    display_name: string;
    role: string;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    author_name: string;
    created_at: string;
    pinned: boolean;
  }>;
  schedule: Array<{
    id: string;
    event_date: string;
    event_time: string | null;
    event_type: string;
    title: string;
    location: string | null;
    description: string | null;
  }>;
}

function usePwaMode(): boolean {
  const [isPwa, setIsPwa] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () => setIsPwa(mq.matches || !!(navigator as any).standalone);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isPwa;
}

export default function TeamPage() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const isPwa = usePwaMode();
  const [lang, setLang] = useLang();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState("");
  const [newAnnouncementBody, setNewAnnouncementBody] = useState("");
  const [newAnnouncementPinned, setNewAnnouncementPinned] = useState(false);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementLoading, setAnnouncementLoading] = useState(false);

  const [newEventDate, setNewEventDate] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newEventType, setNewEventType] = useState<
    "training" | "match" | "meeting" | "recovery" | "day_off"
  >("training");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Inline Google Sheets URL configuration — replaces having to
  // navigate to /coach/settings just to set the calendar source.
  const [showSheetConfig, setShowSheetConfig] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState("");
  const [currentSheetId, setCurrentSheetId] = useState<string | null>(null);
  const [sheetSaving, setSheetSaving] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<string | null>(null);
  const [nnIndex, setNnIndex] = useState(0);

  // Documents state
  interface TeamDocument {
    id: string;
    title: string;
    category: string;
    file_name: string;
    file_path: string;
    file_size: number | null;
    url: string;
    created_at: string;
  }
  const [documents, setDocuments] = useState<TeamDocument[]>([]);
  const [showDocUploadForm, setShowDocUploadForm] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docCategory, setDocCategory] = useState("leikaaetlanir");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docFilter, setDocFilter] = useState<string | null>(null);

  // Case-insensitive role check + accept STAFF — production profiles
  // sometimes store role as 'ADMIN'/'COACH' (uppercase). Without this
  // every coach control on the team page (sync calendar, upload doc,
  // create event/announcement) is hidden for ADMIN users.
  const _normalizedRole = String(profile?.role ?? "").toUpperCase();
  const isCoachOrAdmin = ["COACH", "ADMIN", "STAFF"].includes(_normalizedRole);

  useEffect(() => {
    const initializePage = async () => {
      try {
        // Get current auth user
        const { data: authData, error: authError } =
          await supabase.auth.getUser();
        if (authError || !authData.user) {
          setError("Failed to authenticate user");
          setLoading(false);
          return;
        }
        setUser(authData.user as unknown as User);

        // Fetch user profile
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("team_id, role, player_id")
          .eq("id", authData.user.id)
          .single();

        if (profileError || !profileData) {
          setError("Failed to fetch user profile");
          setLoading(false);
          return;
        }

        // Defensive: profile.team_id is sometimes NULL even when player.team_id
        // is set (signup-flow desync — observed for Arnar Bjarki 2026-05-16).
        // Fall back to player.team_id and auto-repair the profile so this
        // doesn't recur on subsequent visits. Without this fallback the
        // /api/team/page call sends teamId=null and gets a 403, surfacing as
        // "Failed to fetch team data" with no recovery path for the user.
        let effectiveTeamId: string | null = (profileData as { team_id: string | null }).team_id;
        if (!effectiveTeamId && (profileData as { player_id?: string | null }).player_id) {
          const { data: playerRow } = await supabase
            .from("players")
            .select("team_id")
            .eq("id", (profileData as { player_id: string }).player_id)
            .maybeSingle();
          const playerTeamId = (playerRow as { team_id?: string | null } | null)?.team_id ?? null;
          if (playerTeamId) {
            effectiveTeamId = playerTeamId;
            // Self-heal: write the fixed team_id back to the profile so
            // future requests are clean. If the write fails (RLS, etc.)
            // we still proceed with the in-memory fallback for this load.
            await supabase
              .from("profiles")
              .update({ team_id: playerTeamId })
              .eq("id", authData.user.id);
          }
        }

        setProfile({ ...(profileData as Record<string, unknown>), team_id: effectiveTeamId } as typeof profileData);

        if (!effectiveTeamId) {
          setError("Þú ert ekki tengd/ur við lið. Hafðu samband við þjálfara.");
          setLoading(false);
          return;
        }

        // Fetch team page data
        const response = await fetch(
          `/api/team/page?teamId=${effectiveTeamId}`,
          {
            headers: {
              Authorization: `Bearer ${(await supabase.auth.getSession()).data?.session?.access_token ?? ""}`,
            },
          }
        );

        if (!response.ok) {
          setError("Failed to fetch team data");
          setLoading(false);
          return;
        }

        const data: TeamData = await response.json();
        setTeamData(data);

        // Fetch current Google Sheets config for the team — sync-sheet
        // route reads team_settings.settings.schedule_sheet_id. Show
        // the current value so the coach knows whether they need to
        // configure or just hit Sync.
        const { data: ts } = await supabase
          .from("team_settings")
          .select("settings")
          .eq("team_id", effectiveTeamId)
          .maybeSingle();
        const sid = (ts?.settings as Record<string, unknown> | null)?.schedule_sheet_id;
        if (typeof sid === "string" && sid.length > 0) {
          setCurrentSheetId(sid);
        }

        setLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
        setLoading(false);
      }
    };

    initializePage();
  }, [supabase]);

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncementTitle.trim() || !newAnnouncementBody.trim()) {
      setError("Title and body are required");
      return;
    }

    setAnnouncementLoading(true);
    try {
      const authSession = await supabase.auth.getSession();
      const response = await fetch("/api/team/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          teamId: profile?.team_id,
          title: newAnnouncementTitle,
          body: newAnnouncementBody,
          pinned: newAnnouncementPinned,
        }),
      });

      if (!response.ok) {
        setError("Failed to create announcement");
        setAnnouncementLoading(false);
        return;
      }

      // Refresh team data
      const teamResponse = await fetch(
        `/api/team/page?teamId=${profile?.team_id}`,
        {
          headers: {
            Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
          },
        }
      );
      const updatedTeamData: TeamData = await teamResponse.json();
      setTeamData(updatedTeamData);

      setNewAnnouncementTitle("");
      setNewAnnouncementBody("");
      setNewAnnouncementPinned(false);
      setShowAnnouncementForm(false);
      setAnnouncementLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create announcement"
      );
      setAnnouncementLoading(false);
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    if (!confirm(lang === "IS" ? "Ertu viss um að þú viljir eyða þessari tilkynningu?" : "Are you sure you want to delete this announcement?")) {
      return;
    }

    try {
      const authSession = await supabase.auth.getSession();
      const response = await fetch(
        `/api/team/announcements?id=${announcementId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
          },
        }
      );

      if (!response.ok) {
        setError("Failed to delete announcement");
        return;
      }

      // Refresh team data
      const teamResponse = await fetch(
        `/api/team/page?teamId=${profile?.team_id}`,
        {
          headers: {
            Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
          },
        }
      );
      const updatedTeamData: TeamData = await teamResponse.json();
      setTeamData(updatedTeamData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete announcement"
      );
    }
  };

  const handleCreateEvent = async () => {
    if (!newEventDate.trim() || !newEventTitle.trim()) {
      setError("Date and title are required");
      return;
    }

    setScheduleLoading(true);
    try {
      const authSession = await supabase.auth.getSession();
      const response = await fetch("/api/team/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          teamId: profile?.team_id,
          event_date: newEventDate,
          event_time: newEventTime || null,
          event_type: newEventType,
          title: newEventTitle,
          location: newEventLocation || null,
          description: newEventDescription || null,
        }),
      });

      if (!response.ok) {
        setError("Failed to create event");
        setScheduleLoading(false);
        return;
      }

      // Refresh team data
      const teamResponse = await fetch(
        `/api/team/page?teamId=${profile?.team_id}`,
        {
          headers: {
            Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
          },
        }
      );
      const updatedTeamData: TeamData = await teamResponse.json();
      setTeamData(updatedTeamData);

      setNewEventDate("");
      setNewEventTime("");
      setNewEventType("training");
      setNewEventTitle("");
      setNewEventLocation("");
      setNewEventDescription("");
      setShowScheduleForm(false);
      setScheduleLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
      setScheduleLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm(lang === "IS" ? "Ertu viss um að þú viljir eyða þessum atburði?" : "Are you sure you want to delete this event?")) {
      return;
    }

    try {
      const authSession = await supabase.auth.getSession();
      // Server reads searchParams.get("id"); previously the client sent
      // `eventId=` which silently 400'd as "Missing event id" → surfaced
      // here as the generic "Failed to delete event" toast.
      const response = await fetch(
        `/api/team/schedule?id=${encodeURIComponent(eventId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
          },
        }
      );

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        setError(json?.error ?? "Failed to delete event");
        return;
      }

      // Refresh team data
      const teamResponse = await fetch(
        `/api/team/page?teamId=${profile?.team_id}`,
        {
          headers: {
            Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
          },
        }
      );
      const updatedTeamData: TeamData = await teamResponse.json();
      setTeamData(updatedTeamData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete event");
    }
  };

  /**
   * Extract a Google Sheets ID from a full URL or accept a raw ID.
   * Accepts:
   *   https://docs.google.com/spreadsheets/d/{ID}/edit#gid=0
   *   https://docs.google.com/spreadsheets/d/{ID}/
   *   raw {ID}
   * Returns null when the input does not look like a sheet ID.
   */
  function extractSheetId(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    // Full URL pattern
    const m = trimmed.match(/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m && m[1]) return m[1];
    // Raw ID — Google Sheet IDs are alphanumeric with - and _, ≥20 chars
    if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
    return null;
  }

  const handleSaveSheetUrl = async () => {
    setSheetMessage(null);
    const sheetId = extractSheetId(sheetUrlInput);
    if (!sheetId) {
      setSheetMessage(
        lang === "IS"
          ? "Ógild URL — límdu inn fullt Google Sheets URL eða ID"
          : "Invalid URL — paste the full Google Sheets URL or ID"
      );
      return;
    }
    if (!profile?.team_id) return;
    setSheetSaving(true);
    try {
      // Read existing settings so we don't clobber other keys
      const { data: existing } = await supabase
        .from("team_settings")
        .select("settings")
        .eq("team_id", profile.team_id)
        .maybeSingle();

      const merged = {
        ...((existing?.settings as Record<string, unknown> | null) ?? {}),
        schedule_sheet_id: sheetId,
      };

      // Upsert — team_settings might not yet have a row for this team
      const { error: upErr } = await supabase
        .from("team_settings")
        .upsert(
          { team_id: profile.team_id, settings: merged },
          { onConflict: "team_id" }
        );
      if (upErr) {
        console.error("save sheet URL error:", upErr);
        setSheetMessage(
          lang === "IS"
            ? `Tókst ekki að vista — ${upErr.message || upErr.code || "unknown"}`
            : `Could not save — ${upErr.message || upErr.code || "unknown"}`
        );
        setSheetSaving(false);
        return;
      }
      setCurrentSheetId(sheetId);
      setSheetMessage(
        lang === "IS" ? "Vistað ✓ — smelltu Samstilla núna" : "Saved ✓ — click Sync now"
      );
      setSheetUrlInput("");
      setShowSheetConfig(false);
    } catch (e) {
      console.error(e);
      setSheetMessage(lang === "IS" ? "Villa við vistun" : "Save error");
    } finally {
      setSheetSaving(false);
    }
  };

  const handleSyncSheet = async () => {
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const authSession = await supabase.auth.getSession();
      const now = new Date();
      const response = await fetch("/api/team/schedule/sync-sheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          teamId: profile?.team_id,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setSyncMessage(lang === "IS" ? `Villa: ${data.error}` : `Error: ${data.error}`);
        setSyncLoading(false);
        return;
      }
      setSyncMessage(lang === "IS" ? `Samstillt: ${data.synced} atburðir` : `Synced: ${data.synced} events`);
      // Refresh team data
      const teamResponse = await fetch(
        `/api/team/page?teamId=${profile?.team_id}`,
        {
          headers: {
            Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
          },
        }
      );
      const updatedTeamData: TeamData = await teamResponse.json();
      setTeamData(updatedTeamData);
      setSyncLoading(false);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Sync failed");
      setSyncLoading(false);
    }
  };

  // ── Documents ────────────────────────────────────────────────────────────

  const fetchDocuments = async () => {
    if (!profile?.team_id) return;
    try {
      const authSession = await supabase.auth.getSession();
      const res = await fetch(
        `/api/team/documents?teamId=${profile.team_id}`,
        {
          headers: {
            Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents ?? []);
      }
    } catch {
      /* silent */
    }
  };

  // Fetch documents when teamData is loaded
  useEffect(() => {
    if (teamData && profile) fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamData, profile]);

  // Non Negotiables rotation timer (10s)
  useEffect(() => {
    const timer = setInterval(() => setNnIndex((i) => (i + 1) % 8), 10000);
    return () => clearInterval(timer);
  }, []);

  const handleUploadDocument = async () => {
    if (!docTitle.trim() || !docFile || !profile?.team_id) return;
    setDocLoading(true);
    try {
      const authSession = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append("teamId", profile.team_id);
      formData.append("title", docTitle.trim());
      formData.append("category", docCategory);
      formData.append("file", docFile);

      const res = await fetch("/api/team/documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to upload document");
        setDocLoading(false);
        return;
      }

      setDocTitle("");
      setDocFile(null);
      setShowDocUploadForm(false);
      setDocLoading(false);
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document");
      setDocLoading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm(lang === "IS" ? "Ertu viss um að þú viljir eyða þessu skjali?" : "Are you sure you want to delete this document?")) return;
    try {
      const authSession = await supabase.auth.getSession();
      const res = await fetch("/api/team/documents", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ id: docId, teamId: profile?.team_id }),
      });
      if (!res.ok) {
        setError("Failed to delete document");
        return;
      }
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    }
  };

  const DOC_CATEGORIES = [
    { value: "leikaaetlanir", label: lang === "IS" ? "Leikáætlanir" : "Match plans" },
    { value: "fundir", label: lang === "IS" ? "Fundir" : "Meetings" },
    { value: "aefingar", label: lang === "IS" ? "Æfingar" : "Training" },
    { value: "general", label: lang === "IS" ? "Annað" : "Other" },
  ];

  const filteredDocuments = docFilter
    ? documents.filter((d) => d.category === docFilter)
    : documents;

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatRelativeDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (lang === "IS") {
      if (diffDays === 0) return "í dag";
      if (diffDays === 1) return "á morgun";
      if (diffDays < 0) return Math.abs(diffDays) + " dögum síðan";
      return "um " + diffDays + " daga";
    }
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "tomorrow";
    if (diffDays < 0) return Math.abs(diffDays) + " days ago";
    return "in " + diffDays + " days";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        {/* PT clients belong on /client — redirect before any football UI shows. */}
        <PtClientGuard />
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!teamData || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">No team data available</div>
      </div>
    );
  }

  const pinnedAnnouncements = teamData.announcements.filter(
    (a) => a.pinned
  );
  const regularAnnouncements = teamData.announcements.filter(
    (a) => !a.pinned
  );

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={
        {
          "--theme-color": teamData.team?.club_theme_color,
        } as React.CSSProperties
      }
    >
      {/* PT clients belong on /client, not the football team surface. */}
      <PtClientGuard />
      {/* Team Header */}
      <div className="w-full" style={{ backgroundColor: teamData.team?.club_theme_color ?? "#1c7a4a" }}>
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            {teamData.team?.club_logo_url && (
              <img
                src={teamData.team?.club_logo_url}
                alt={teamData.team?.name}
                className="w-16 h-16 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white">
                {teamData.team?.name}
              </h1>
              <div className="flex items-center gap-2 mt-2 text-white text-sm">
                <span className="px-2 py-1 bg-white/20 rounded-full">
                  {teamData.team?.sport}
                </span>
                {/* IS / EN toggle */}
                <div className="flex items-center rounded-full bg-white/20 p-0.5 text-xs font-semibold">
                  <button
                    onClick={() => setLang("IS")}
                    className={`rounded-full px-2 py-0.5 transition-colors ${lang === "IS" ? "bg-white text-gray-900" : "text-white/70 hover:text-white"}`}
                  >IS</button>
                  <button
                    onClick={() => setLang("EN")}
                    className={`rounded-full px-2 py-0.5 transition-colors ${lang === "EN" ? "bg-white text-gray-900" : "text-white/70 hover:text-white"}`}
                  >EN</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Browser-mode navigation (PWA has its own bottom nav) */}
      {!isPwa && profile && (
        <div className="w-full bg-white border-b border-zinc-200">
          <div className="max-w-3xl mx-auto px-4 flex items-center gap-1 py-2 text-sm">
            {(isCoachOrAdmin
              ? [
                  { label: lang === "IS" ? "Stjórnborð" : "Dashboard", href: "/coach", active: false },
                  { label: lang === "IS" ? "Lið" : "Team", href: "/team", active: true },
                ]
              : [
                  { label: lang === "IS" ? "Í dag" : "Today", href: "/player?tab=today", active: false },
                  { label: lang === "IS" ? "Spjall" : "Chat", href: "/player?tab=chat", active: false },
                  { label: lang === "IS" ? "Lið" : "Team", href: "/team", active: true },
                  { label: lang === "IS" ? "Saga" : "History", href: "/player?tab=history", active: false },
                ]
            ).map((item) => (
              <button
                key={item.label}
                className={`px-3 py-1.5 rounded-full font-medium transition-colors ${
                  item.active
                    ? "bg-green-100 text-green-800"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                }`}
                onClick={() => router.push(item.href)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Player streak / completion rate */}
        <StreakCard lang={lang} />

        {/* Non Negotiables Section — Breiðablik only */}
        {profile?.team_id === "94b52a06-0b83-48da-8664-639ec3486a0c" && <section>
          <div className="rounded-2xl overflow-hidden shadow-sm border border-emerald-800/30" style={{ background: "linear-gradient(135deg, #11422a 0%, #145233 50%, #16653d 100%)" }}>
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-wide text-white uppercase">Non Negotiables</h2>
              <span className="text-xs text-emerald-300/70 font-medium">{nnIndex + 1} / 8</span>
            </div>
            {(() => {
              const nnItems = [
                { n: 1, title: lang === "IS" ? "Liðið fyrst og fremst" : "Team First", bullets: lang === "IS"
                  ? ["Fótbolti er liðsíþrótt, liðið gengur alltaf fyrir"]
                  : ["Football is a team sport, the team always comes first"]
                },
                { n: 2, title: lang === "IS" ? "Hámarks standard" : "Highest Standard", bullets: lang === "IS"
                  ? ["Leggum okkur alltaf 100% fram og mætum með tilgangi", "Krefjum hvorn annan um max effort á hverjum degi og á hverri æfingu"]
                  : ["Always give 100% and show up with purpose", "Demand max effort from each other every day and every session"]
                },
                { n: 3, title: lang === "IS" ? "Taka ábyrgð – engar afsakanir" : "Take Responsibility – No Excuses", bullets: lang === "IS"
                  ? ["Tökum ábyrgð á okkar frammistöðu og viðhorfi", "Ekki finna sökudólg. Við berum ábyrgð"]
                  : ["Own your performance and attitude", "No blame. We take responsibility"]
                },
                { n: 4, title: lang === "IS" ? "Undirbúningur er ábyrgð" : "Preparation is Responsibility", bullets: lang === "IS"
                  ? ["Leggum okkur alltaf 100% fram og mætum með tilgangi", "Krefjum hvorn annan um max effort á hverjum degi og á hverri æfingu"]
                  : ["Always give 100% and show up with purpose", "Demand max effort from each other every day and every session"]
                },
                { n: 5, title: lang === "IS" ? "Virðing fyrir tíma" : "Respect for Time", bullets: lang === "IS"
                  ? ["Mæta tímanlega – snemma er réttur tími", "Virðing fyrir tíma liðsfélaga, teymis og félagsins"]
                  : ["Be on time – early is on time", "Respect the time of teammates, staff and the club"]
                },
                { n: 6, title: lang === "IS" ? "Líkamstjáning og samskipti" : "Body Language & Communication", bullets: lang === "IS"
                  ? ["Neikvæð líkamstjáning / samskipti – hefur áhrif á frammistöðu", "Jákvæð líkamstjáning / samskipti gefa orku og momentum"]
                  : ["Negative body language / communication affects performance", "Positive body language / communication gives energy and momentum"]
                },
                { n: 7, title: "Proactive", bullets: lang === "IS"
                  ? ["Tökum af skarið, bíðum ekki með að bregðast við"]
                  : ["Take initiative, don\u2019t wait to react"]
                },
                { n: 8, title: lang === "IS" ? "Grósku hugarfar" : "Growth Mindset", bullets: lang === "IS"
                  ? ["Mæta til að bæta sig og liðið á hverjum degi"]
                  : ["Show up to improve yourself and the team every day"]
                },
              ];
              const item = nnItems[nnIndex];
              return (
                <div className="px-5 pb-4">
                  <div
                    key={item.n}
                    className="rounded-xl bg-white/10 backdrop-blur-sm px-4 py-4 transition-all duration-500 ease-in-out"
                    style={{ animation: "nnFadeIn 0.5s ease-in-out" }}
                  >
                    <div className="flex items-baseline gap-2.5">
                      <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-emerald-400/20 text-emerald-300 text-sm font-bold">{item.n}</span>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wide">{item.title}</h3>
                    </div>
                    <div className="mt-2 ml-9 space-y-1">
                      {item.bullets.map((b, i) => (
                        <p key={i} className="text-sm text-emerald-100/90 leading-relaxed flex items-start gap-1.5">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          <span>{b}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                  {/* Dot indicators */}
                  <div className="flex items-center justify-center gap-1.5 mt-3">
                    {nnItems.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setNnIndex(i)}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${i === nnIndex ? "bg-emerald-300 w-4" : "bg-white/30 hover:bg-white/50"}`}
                        aria-label={`Non Negotiable ${i + 1}`}
                      />
                    ))}
                  </div>
                  <style>{`
                    @keyframes nnFadeIn {
                      from { opacity: 0; transform: translateY(6px); }
                      to { opacity: 1; transform: translateY(0); }
                    }
                  `}</style>
                </div>
              );
            })()}
          </div>
        </section>}

        {/* Team Training Section (published sessions from coach) */}
        <TeamTrainingSection />

        {/* Announcements Section */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">{lang === "IS" ? "Tilkynningar" : "Announcements"}</h2>

          {isCoachOrAdmin && (
            <button
              onClick={() => setShowAnnouncementForm(!showAnnouncementForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4" />
              {lang === "IS" ? "Ný tilkynning" : "New announcement"}
            </button>
          )}

          {showAnnouncementForm && isCoachOrAdmin && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3 border border-gray-200">
              <input
                type="text"
                placeholder={lang === "IS" ? "Titill" : "Title"}
                value={newAnnouncementTitle}
                onChange={(e) => setNewAnnouncementTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder={lang === "IS" ? "Efni tilkynningar" : "Announcement body"}
                value={newAnnouncementBody}
                onChange={(e) => setNewAnnouncementBody(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAnnouncementPinned}
                  onChange={(e) => setNewAnnouncementPinned(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">{lang === "IS" ? "Festa efst" : "Pin to top"}</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateAnnouncement}
                  disabled={announcementLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {announcementLoading ? (lang === "IS" ? "Birta..." : "Publishing...") : (lang === "IS" ? "Birta" : "Publish")}
                </button>
                <button
                  onClick={() => setShowAnnouncementForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
                >
                  {lang === "IS" ? "Hætta við" : "Cancel"}
                </button>
              </div>
            </div>
          )}

          {pinnedAnnouncements.length > 0 && (
            <div className="space-y-3">
              {pinnedAnnouncements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-yellow-400"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Pin className="w-4 h-4 text-yellow-500" />
                        <h3 className="font-bold text-gray-900">
                          {announcement.title}
                        </h3>
                      </div>
                      <p className="text-gray-700 mb-2">{announcement.body}</p>
                      <p className="text-xs text-gray-500">
                        {announcement.author_name} •{" "}
                        {formatRelativeDate(announcement.created_at)}
                      </p>
                    </div>
                    {isCoachOrAdmin && (
                      <button
                        onClick={() =>
                          handleDeleteAnnouncement(announcement.id)
                        }
                        className="text-gray-400 hover:text-red-600 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {regularAnnouncements.length > 0 && (
            <div className="space-y-3">
              {regularAnnouncements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="bg-white rounded-xl shadow-sm p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 mb-1">
                        {announcement.title}
                      </h3>
                      <p className="text-gray-700 mb-2">{announcement.body}</p>
                      <p className="text-xs text-gray-500">
                        {announcement.author_name} •{" "}
                        {formatRelativeDate(announcement.created_at)}
                      </p>
                    </div>
                    {isCoachOrAdmin && (
                      <button
                        onClick={() =>
                          handleDeleteAnnouncement(announcement.id)
                        }
                        className="text-gray-400 hover:text-red-600 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {teamData.announcements.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
              {lang === "IS" ? "Engar tilkynningar ennþá" : "No announcements yet"}
            </div>
          )}
        </section>

        {/* Weekly Schedule Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">{lang === "IS" ? "Dagskrá vikunnar" : "Weekly Schedule"}</h2>
            {isCoachOrAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSheetConfig((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm font-medium"
                  title={lang === "IS" ? "Stilla Google Sheets dagatal" : "Configure Google Sheets calendar"}
                >
                  ⚙️ {lang === "IS" ? "Heimild" : "Source"}
                </button>
                <button
                  onClick={handleSyncSheet}
                  disabled={syncLoading || !currentSheetId}
                  title={!currentSheetId
                    ? (lang === "IS" ? "Stilltu Google Sheets fyrst" : "Configure Google Sheets first")
                    : undefined}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium disabled:opacity-50"
                >
                  {syncLoading ? (lang === "IS" ? "Samstilli..." : "Syncing...") : (lang === "IS" ? "Samstilla" : "Sync")}
                </button>
                <button
                  onClick={() => setShowScheduleForm(!showScheduleForm)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                >
                  {showScheduleForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {showScheduleForm ? (lang === "IS" ? "Hætta við" : "Cancel") : (lang === "IS" ? "Bæta við" : "Add")}
                </button>
              </div>
            )}
          </div>
          {syncMessage && (
            <div className={`text-sm px-3 py-2 rounded-lg ${(syncMessage.startsWith("Villa") || syncMessage.startsWith("Error")) ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {syncMessage}
            </div>
          )}

          {/* ── Google Sheets calendar source config ────────────────
              Coach pastes the full Sheets URL or just the sheet ID.
              We extract the ID, save to team_settings.settings, then
              the Sync button works. Shown when coach clicks "Heimild"
              OR auto-shown when no sheet is configured yet. */}
          {isCoachOrAdmin && (showSheetConfig || !currentSheetId) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {lang === "IS" ? "Google Sheets dagatal" : "Google Sheets calendar"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  {lang === "IS"
                    ? "Límdu inn URL á Google Sheets dagatalinu sem þú vilt samstilla við. Sheet þarf að vera \"Anyone with the link can view\"."
                    : "Paste the URL of the Google Sheets calendar to sync. The sheet must be \"Anyone with the link can view\"."}
                </p>
                {currentSheetId && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {lang === "IS" ? "Núverandi sheet ID:" : "Current sheet ID:"}{" "}
                    <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-700">{currentSheetId.slice(0, 12)}…</code>
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={handleSaveSheetUrl}
                  disabled={sheetSaving || !sheetUrlInput.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {sheetSaving
                    ? (lang === "IS" ? "Vista…" : "Saving…")
                    : (lang === "IS" ? "Vista" : "Save")}
                </button>
                {showSheetConfig && (
                  <button
                    onClick={() => { setShowSheetConfig(false); setSheetUrlInput(""); setSheetMessage(null); }}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white"
                  >
                    {lang === "IS" ? "Hætta við" : "Cancel"}
                  </button>
                )}
              </div>
              {sheetMessage && (
                <div className={`text-xs px-2 py-1.5 rounded ${
                  sheetMessage.includes("✓") || sheetMessage.toLowerCase().includes("saved")
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}>
                  {sheetMessage}
                </div>
              )}
            </div>
          )}

          {showScheduleForm && isCoachOrAdmin && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3 border border-gray-200">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <input
                  type="time"
                  value={newEventTime}
                  onChange={(e) => setNewEventTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <select
                value={newEventType}
                onChange={(e) =>
                  setNewEventType(
                    e.target.value as
                      | "training"
                      | "match"
                      | "meeting"
                      | "recovery"
                      | "day_off"
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="training">🏋️ {lang === "IS" ? "Æfing" : "Training"}</option>
                <option value="match">⚽ {lang === "IS" ? "Leikur" : "Match"}</option>
                <option value="meeting">📋 {lang === "IS" ? "Fundur" : "Meeting"}</option>
                <option value="recovery">🧘 {lang === "IS" ? "Endurreisn" : "Recovery"}</option>
                <option value="day_off">📅 {lang === "IS" ? "Frí dagur" : "Day off"}</option>
              </select>
              <input
                type="text"
                placeholder={lang === "IS" ? "Titill atburðar" : "Event title"}
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <input
                type="text"
                placeholder={lang === "IS" ? "Staðsetning (valfrjálst)" : "Location (optional)"}
                value={newEventLocation}
                onChange={(e) => setNewEventLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <textarea
                placeholder={lang === "IS" ? "Lýsing (valfrjálst)" : "Description (optional)"}
                value={newEventDescription}
                onChange={(e) => setNewEventDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                onClick={handleCreateEvent}
                disabled={scheduleLoading}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm font-medium"
              >
                {scheduleLoading ? (lang === "IS" ? "Bæti við..." : "Adding...") : (lang === "IS" ? "Bæta við" : "Add event")}
              </button>
            </div>
          )}

          <WeeklyCalendar
            events={teamData.schedule}
            isCoachOrAdmin={isCoachOrAdmin}
            onDeleteEvent={handleDeleteEvent}
            lang={lang}
          />
        </section>

        {/* Documents Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">{lang === "IS" ? "Skjöl" : "Documents"}</h2>
            {isCoachOrAdmin && (
              <button
                onClick={() => setShowDocUploadForm(!showDocUploadForm)}
                className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
              >
                {showDocUploadForm ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {showDocUploadForm ? (lang === "IS" ? "Hætta við" : "Cancel") : (lang === "IS" ? "Hlaða upp" : "Upload")}
              </button>
            )}
          </div>

          {/* Upload form (coach only) */}
          {isCoachOrAdmin && showDocUploadForm && (
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200 space-y-3">
              <input
                type="text"
                placeholder={lang === "IS" ? "Titill skjals" : "Document title"}
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                {DOC_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-3">
                <label className="flex-1 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-green-400 transition">
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                  />
                  <FileText className="w-8 h-8 mx-auto text-gray-400 mb-1" />
                  <span className="text-sm text-gray-500">
                    {docFile ? docFile.name : (lang === "IS" ? "Veldu PDF skjal" : "Choose PDF file")}
                  </span>
                  {docFile && (
                    <span className="block text-xs text-gray-400 mt-1">
                      {formatFileSize(docFile.size)}
                    </span>
                  )}
                </label>
              </div>
              <button
                onClick={handleUploadDocument}
                disabled={docLoading || !docTitle.trim() || !docFile}
                className="w-full bg-green-600 text-white py-2 rounded-lg font-medium disabled:opacity-50 hover:bg-green-700 transition text-sm"
              >
                {docLoading ? (lang === "IS" ? "Hleð upp..." : "Uploading...") : (lang === "IS" ? "Hlaða upp skjali" : "Upload document")}
              </button>
            </div>
          )}

          {/* Category filter pills */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setDocFilter(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                docFilter === null
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {lang === "IS" ? "Allt" : "All"}
            </button>
            {DOC_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() =>
                  setDocFilter(docFilter === cat.value ? null : cat.value)
                }
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  docFilter === cat.value
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Documents list */}
          <div className="space-y-2">
            {filteredDocuments.length > 0 ? (
              filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 flex items-center gap-4 hover:shadow-md transition"
                >
                  <div className="flex-shrink-0 w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">
                      {doc.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                        {DOC_CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}
                      </span>
                      {doc.file_size && (
                        <span>{formatFileSize(doc.file_size)}</span>
                      )}
                      <span>
                        {new Date(doc.created_at).toLocaleDateString("is-IS")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                      title={lang === "IS" ? "Opna PDF" : "Open PDF"}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    {isCoachOrAdmin && (
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition"
                        title={lang === "IS" ? "Eyða" : "Delete"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
                {lang === "IS" ? "Engin skjöl hlaðið upp enn" : "No documents uploaded yet"}
              </div>
            )}
          </div>
        </section>



      </div>

      {/* PWA bottom padding */}
      {isPwa && <div className="h-20" />}

      {/* PWA Bottom Nav */}
      {isPwa && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-zinc-200"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex">
            {[
              { label: lang === "IS" ? "Í dag" : "Today", icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
              ), href: "/player?tab=today", active: false },
              { label: lang === "IS" ? "Spjall" : "Chat", icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" /></svg>
              ), href: "/player?tab=chat", active: false },
              { label: lang === "IS" ? "Lið" : "Team", icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
              ), href: "/team", active: true },
              { label: lang === "IS" ? "Saga" : "History", icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              ), href: "/player?tab=history", active: false },
            ].map((item) => (
              <button
                key={item.label}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                  item.active ? "text-green-700" : "text-zinc-400"
                }`}
                onClick={() => router.push(item.href)}
                aria-label={item.label}
              >
                {item.icon}
                <span className={`text-[9px] font-semibold tracking-wide ${
                  item.active ? "text-green-700" : "text-zinc-400"
                }`}>
                  {item.label.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
