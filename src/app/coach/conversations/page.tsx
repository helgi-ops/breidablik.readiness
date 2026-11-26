"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import ChatThread from "@/components/chat/ChatThread";
import BroadcastModal from "@/components/chat/BroadcastModal";
import { useLang } from "@/lib/lang";

// Personal-trainer practices talk to "clients", clubs to "players".
const COPY = {
  EN: {
    titleClub: "Chat with players", titlePt: "Chat with clients",
    subClub: "Every conversation between coaches and players in one place.",
    subPt: "Every conversation with your clients in one place.",
    broadcast: "Group message",
    searchClub: "Search players…", searchPt: "Search clients…",
    loading: "Loading conversations…",
    none: "No conversations yet.",
    you: "You",
    pick: "Pick a conversation to open the chat.",
    back: "← All conversations",
    today: "Today", yesterday: "Yesterday",
  },
  IS: {
    titleClub: "Spjall við leikmenn", titlePt: "Spjall við viðskiptavini",
    subClub: "Öll samskipti milli þjálfara og leikmanna á einum stað.",
    subPt: "Öll samskipti við viðskiptavinina þína á einum stað.",
    broadcast: "Hópskilaboð",
    searchClub: "Leita að leikmanni…", searchPt: "Leita að viðskiptavini…",
    loading: "Hleð samtölum...",
    none: "Engin samtöl fundust.",
    you: "Þú",
    pick: "Veldu samtal til að opna spjall.",
    back: "← Öll samtöl",
    today: "Í dag", yesterday: "Í gær",
  },
} as const;

type ThreadSummary = {
  player_id: string;
  player_name: string;
  team_id: string;
  entry_date: string;
  last_message_at: string;
  last_body: string;
  last_sender_role: string;
  unread_count: number;
};

export default function ConversationsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(null);
  const [search, setSearch] = useState("");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [coachTeamId, setCoachTeamId] = useState<string | null>(null);
  const [isPt, setIsPt] = useState(false);
  const [lang] = useLang();
  const c = COPY[lang];
  const locale = lang === "IS" ? "is-IS" : "en-GB";

  useEffect(() => {
    loadThreads();
  }, []);

  async function loadThreads() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", auth.user.id)
        .maybeSingle();

      // Coaches often have team_id in coach_teams instead of profiles.team_id
      let teamId: string | null = (profile as any)?.team_id ?? null;
      if (!teamId) {
        const { data: ct } = await supabase
          .from("coach_teams")
          .select("team_id, is_primary")
          .eq("coach_id", auth.user.id)
          .order("is_primary", { ascending: false })
          .limit(1);
        teamId = ((ct as any)?.[0]?.team_id ?? null) as string | null;
      }
      if (!teamId) return;
      setCoachTeamId(teamId);
      const { data: team } = await supabase.from("teams").select("team_type").eq("id", teamId).maybeSingle();
      setIsPt(String((team as { team_type?: string | null } | null)?.team_type ?? "") === "personal_trainer");

      // Get recent messages grouped by player+date with last message info
      const { data: messages } = await supabase
        .from("player_coach_messages")
        .select("player_id, entry_date, body, sender_role, created_at, read_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(500);

      if (!messages?.length) {
        setThreads([]);
        return;
      }

      // Get player names
      const playerIds = [...new Set(messages.map((m: any) => m.player_id))];
      const { data: players } = await supabase
        .from("players")
        .select("id, full_name")
        .in("id", playerIds);

      const nameMap: Record<string, string> = {};
      for (const p of players ?? []) {
        nameMap[p.id] = p.full_name;
      }

      // Group by player+date
      const grouped: Record<string, ThreadSummary> = {};
      for (const m of messages as any[]) {
        const key = `${m.player_id}::${m.entry_date}`;
        if (!grouped[key]) {
          grouped[key] = {
            player_id: m.player_id,
            player_name: nameMap[m.player_id] ?? "—",
            team_id: teamId,
            entry_date: m.entry_date,
            last_message_at: m.created_at,
            last_body: m.body,
            last_sender_role: m.sender_role,
            unread_count: 0,
          };
        }
        if (m.sender_role === "player" && !m.read_at) {
          grouped[key].unread_count++;
        }
      }

      const sorted = Object.values(grouped).sort(
        (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );

      setThreads(sorted);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const filtered = search.trim()
    ? threads.filter((t) =>
        t.player_name.toLowerCase().includes(search.toLowerCase())
      )
    : threads;

  const formatDate = (d: string) => {
    try {
      const today = new Date().toLocaleDateString("en-CA");
      if (d === today) return c.today;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (d === yesterday.toLocaleDateString("en-CA")) return c.yesterday;
      return new Date(d + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short" });
    } catch {
      return d;
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">{isPt ? c.titlePt : c.titleClub}</h1>
          <p className="text-sm text-slate-500">{isPt ? c.subPt : c.subClub}</p>
        </div>
        <button
          onClick={() => setBroadcastOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition-colors shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
          {c.broadcast}
        </button>
      </div>

      {coachTeamId && (
        <BroadcastModal open={broadcastOpen} onClose={() => setBroadcastOpen(false)} teamId={coachTeamId} />
      )}

      {/* Phone: the list, or the open chat with a back link. Wider: side by side. */}
      <div className="flex flex-col gap-6 md:min-h-[600px] md:flex-row">
        {/* Thread list */}
        <div className={`w-full md:max-w-sm md:shrink-0 ${selectedThread ? "hidden md:block" : ""}`}>
          <input
            type="text"
            placeholder={isPt ? c.searchPt : c.searchClub}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />

          {loading && (
            <div className="text-sm text-slate-400 py-8 text-center">{c.loading}</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-sm text-slate-400 py-8 text-center">{c.none}</div>
          )}

          <div className="space-y-1">
            {filtered.map((t) => {
              const isActive =
                selectedThread?.player_id === t.player_id &&
                selectedThread?.entry_date === t.entry_date;

              return (
                <button
                  key={`${t.player_id}-${t.entry_date}`}
                  type="button"
                  onClick={() => setSelectedThread(t)}
                  className={[
                    "w-full rounded-xl px-4 py-3 text-left transition-colors",
                    isActive
                      ? "bg-slate-800 text-white"
                      : "bg-white border border-slate-100 hover:bg-slate-50 text-slate-800",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{t.player_name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.unread_count > 0 && (
                        <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                          isActive ? "bg-white text-slate-800" : "bg-blue-500 text-white"
                        }`}>
                          {t.unread_count}
                        </span>
                      )}
                      <span className={`text-[11px] ${isActive ? "text-slate-300" : "text-slate-400"}`}>
                        {formatDate(t.entry_date)}
                      </span>
                    </div>
                  </div>
                  <div className={`mt-1 text-xs truncate ${isActive ? "text-slate-300" : "text-slate-500"}`}>
                    {t.last_sender_role === "player" ? t.player_name.split(" ")[0] : c.you}
                    {": "}
                    {t.last_body.slice(0, 60)}{t.last_body.length > 60 ? "..." : ""}
                  </div>
                  <div className={`mt-0.5 text-[10px] ${isActive ? "text-slate-400" : "text-slate-400"}`}>
                    {formatTime(t.last_message_at)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        <div className={`min-w-0 flex-1 ${selectedThread ? "" : "hidden md:block"}`}>
          {selectedThread && (
            <button
              type="button"
              onClick={() => setSelectedThread(null)}
              className="mb-3 text-sm font-medium text-slate-600 hover:text-slate-900 md:hidden"
            >
              {c.back}
            </button>
          )}
          {selectedThread ? (
            <ChatThread
              playerId={selectedThread.player_id}
              playerName={selectedThread.player_name}
              entryDate={selectedThread.entry_date}
              compact={false}
              viewerRole="coach"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              {c.pick}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
