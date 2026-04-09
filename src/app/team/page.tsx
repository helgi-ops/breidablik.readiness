"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  Calendar,
  Plus,
  X,
  Pin,
  AlertCircle,
  FileText,
  Trash2,
  Upload,
  ExternalLink,
} from "lucide-react";

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
  stats: {
    total_players: number;
    checked_in_today: number;
    avg_readiness_score: number;
  };
}

export default function TeamPage() {
  const supabase = getSupabaseClient();
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

  const isCoachOrAdmin = profile?.role === "coach" || profile?.role === "admin";

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
          .select("team_id, role")
          .eq("id", authData.user.id)
          .single();

        if (profileError || !profileData) {
          setError("Failed to fetch user profile");
          setLoading(false);
          return;
        }
        setProfile(profileData);

        // Fetch team page data
        const response = await fetch(
          `/api/team/page?teamId=${profileData.team_id}`,
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
    if (!confirm("Are you sure you want to delete this announcement?")) {
      return;
    }

    try {
      const authSession = await supabase.auth.getSession();
      const response = await fetch(
        `/api/team/announcements?announcementId=${announcementId}`,
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
    if (!confirm("Are you sure you want to delete this event?")) {
      return;
    }

    try {
      const authSession = await supabase.auth.getSession();
      const response = await fetch(
        `/api/team/schedule?eventId=${eventId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authSession.data?.session?.access_token ?? ""}`,
          },
        }
      );

      if (!response.ok) {
        setError("Failed to delete event");
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
    if (!confirm("Ertu viss um að þú viljir eyða þessu skjali?")) return;
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
    { value: "leikaaetlanir", label: "Leikáætlanir" },
    { value: "fundir", label: "Fundir" },
    { value: "aefingar", label: "Æfingar" },
    { value: "general", label: "Annað" },
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

  const getEventTypeColor = (type: string): string => {
    switch (type) {
      case "training":
        return "bg-green-100 text-green-800";
      case "match":
        return "bg-red-100 text-red-800";
      case "meeting":
        return "bg-blue-100 text-blue-800";
      case "recovery":
        return "bg-yellow-100 text-yellow-800";
      case "day_off":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case "training":
        return "🏋️";
      case "match":
        return "⚽";
      case "meeting":
        return "📋";
      case "recovery":
        return "🧘";
      case "day_off":
        return "📅";
      default:
        return "📅";
    }
  };

  const formatDateIcelandic = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("is-IS", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatRelativeDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "í dag";
    if (diffDays === 1) return "á morgun";
    if (diffDays < 0) return Math.abs(diffDays) + " dögum síðan";
    return "um " + diffDays + " daga";
  };

  const getUpcomingEvents = (events: TeamData["schedule"]): TeamData["schedule"] => {
    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    return events
      .filter((e) => {
        const eventDate = new Date(e.event_date);
        return eventDate >= now && eventDate <= twoWeeksFromNow;
      })
      .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
      {/* Team Header */}
      <div className="w-full" style={{ backgroundColor: teamData.team?.club_theme_color ?? "#16a34a" }}>
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
                <span className="px-2 py-1 bg-white/20 rounded-full">
                  {teamData.stats.total_players} leikmenn
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Announcements Section */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">Tilkynningar</h2>

          {isCoachOrAdmin && (
            <button
              onClick={() => setShowAnnouncementForm(!showAnnouncementForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4" />
              Ný tilkynning
            </button>
          )}

          {showAnnouncementForm && isCoachOrAdmin && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3 border border-gray-200">
              <input
                type="text"
                placeholder="Titill"
                value={newAnnouncementTitle}
                onChange={(e) => setNewAnnouncementTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder="Efni tilkynningar"
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
                <span className="text-sm text-gray-700">Festa efst</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateAnnouncement}
                  disabled={announcementLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {announcementLoading ? "Birta..." : "Birta"}
                </button>
                <button
                  onClick={() => setShowAnnouncementForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
                >
                  Hætta við
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
              Engar tilkynningar ennþá
            </div>
          )}
        </section>

        {/* Weekly Schedule Section */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">Dagskrá vikunnar</h2>

          {isCoachOrAdmin && (
            <button
              onClick={() => setShowScheduleForm(!showScheduleForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4" />
              Bæta við
            </button>
          )}

          {showScheduleForm && isCoachOrAdmin && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3 border border-gray-200">
              <input
                type="date"
                value={newEventDate}
                onChange={(e) => setNewEventDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="time"
                value={newEventTime}
                onChange={(e) => setNewEventTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="training">Æfing</option>
                <option value="match">Leikur</option>
                <option value="meeting">Fundur</option>
                <option value="recovery">Endurreisn</option>
                <option value="day_off">Frí dagur</option>
              </select>
              <input
                type="text"
                placeholder="Titill atburðar"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Staðsetning (valfrjálst)"
                value={newEventLocation}
                onChange={(e) => setNewEventLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder="Lýsing (valfrjálst)"
                value={newEventDescription}
                onChange={(e) => setNewEventDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateEvent}
                  disabled={scheduleLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {scheduleLoading ? "Bæta við..." : "Bæta við"}
                </button>
                <button
                  onClick={() => setShowScheduleForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
                >
                  Hætta við
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {getUpcomingEvents(teamData.schedule).length > 0 ? (
              getUpcomingEvents(teamData.schedule).map((event) => (
                <div
                  key={event.id}
                  className="bg-white rounded-xl shadow-sm p-4 border-l-4"
                  style={{
                    borderLeftColor:
                      event.event_type === "training"
                        ? "#22c55e"
                        : event.event_type === "match"
                          ? "#ef4444"
                          : event.event_type === "meeting"
                            ? "#3b82f6"
                            : event.event_type === "recovery"
                              ? "#eab308"
                              : "#6b7280",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">
                          {getEventTypeIcon(event.event_type)}
                        </span>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${getEventTypeColor(event.event_type)}`}
                        >
                          {event.event_type === "training"
                            ? "Æfing"
                            : event.event_type === "match"
                              ? "Leikur"
                              : event.event_type === "meeting"
                                ? "Fundur"
                                : event.event_type === "recovery"
                                  ? "Endurreisn"
                                  : "Frí dagur"}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-900">
                        {event.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatDateIcelandic(event.event_date)}
                        {event.event_time && ` • ${event.event_time}`}
                      </p>
                      {event.location && (
                        <p className="text-sm text-gray-600">
                          📍 {event.location}
                        </p>
                      )}
                      {event.description && (
                        <p className="text-sm text-gray-700 mt-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                    {isCoachOrAdmin && (
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="text-gray-400 hover:text-red-600 transition flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
                Engir atburðir á næstu 14 dögum
              </div>
            )}
          </div>
        </section>

        {/* Documents Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Skjöl</h2>
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
                {showDocUploadForm ? "Hætta við" : "Hlaða upp"}
              </button>
            )}
          </div>

          {/* Upload form (coach only) */}
          {isCoachOrAdmin && showDocUploadForm && (
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200 space-y-3">
              <input
                type="text"
                placeholder="Titill skjals"
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
                    {docFile ? docFile.name : "Veldu PDF skjal"}
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
                {docLoading ? "Hleð upp..." : "Hlaða upp skjali"}
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
              Allt
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
                      title="Opna PDF"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    {isCoachOrAdmin && (
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition"
                        title="Eyða"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
                Engin skjöl hlaðið upp enn
              </div>
            )}
          </div>
        </section>



      </div>
    </div>
  );
}
