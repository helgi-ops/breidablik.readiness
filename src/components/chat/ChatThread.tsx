"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Message = {
  id: string;
  player_id: string;
  sender_id: string;
  sender_role: "player" | "coach" | "admin";
  body: string;
  read_at: string | null;
  created_at: string;
  entry_date: string;
};

interface ChatThreadProps {
  playerId: string;
  playerName: string;
  entryDate: string;
  /** Compact mode for dashboard inline, false for full Messages page */
  compact?: boolean;
  /** Initial notes from check-in to show as context */
  checkinNotes?: string | null;
  /** Current user role */
  viewerRole?: "player" | "coach" | "admin";
}

export default function ChatThread({
  playerId,
  playerName,
  entryDate,
  compact = false,
  checkinNotes,
  viewerRole = "coach",
}: ChatThreadProps) {
  const supabase = getSupabaseClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/messages?playerId=${playerId}&date=${entryDate}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [playerId, entryDate]);

  // Initial load
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${playerId}-${entryDate}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "player_coach_messages",
          filter: `player_id=eq.${playerId}`,
        },
        (payload: any) => {
          const msg = payload.new as Message;
          if (msg.entry_date === entryDate) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, playerId, entryDate]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark messages as read when viewing
  useEffect(() => {
    const unread = messages.filter(
      (m) =>
        !m.read_at &&
        ((viewerRole === "coach" && m.sender_role === "player") ||
          (viewerRole === "player" && m.sender_role !== "player"))
    );
    if (unread.length === 0) return;

    fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds: unread.map((m) => m.id) }),
    }).catch(() => {});
  }, [messages, viewerRole]);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          entryDate,
          body: text,
        }),
      });

      if (res.ok) {
        setDraft("");
        await fetchMessages();
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function formatTime(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("is-IS", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Atlantic/Reykjavik",
      });
    } catch {
      return "";
    }
  }

  const maxH = compact ? "max-h-[280px]" : "max-h-[500px]";

  return (
    <div className={`flex flex-col rounded-lg border border-slate-200 bg-white ${compact ? "" : "shadow-sm"}`}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-sm font-medium text-slate-700">{playerName}</span>
          <span className="text-xs text-slate-400">{entryDate}</span>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className={`flex-1 overflow-y-auto px-3 py-2 space-y-2 ${maxH}`}>
        {/* Check-in notes as context bubble */}
        {checkinNotes && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2">
              <div className="text-[10px] font-medium text-slate-400 mb-0.5">
                Check-in notes
              </div>
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{checkinNotes}</div>
            </div>
          </div>
        )}

        {loading && messages.length === 0 && (
          <div className="text-xs text-slate-400 text-center py-4">Hleð...</div>
        )}

        {!loading && messages.length === 0 && !checkinNotes && (
          <div className="text-xs text-slate-400 text-center py-4">
            {viewerRole === "coach" ? "Engin skilaboð ennþá. Skrifaðu leikmanninum." : "Engin skilaboð frá þjálfara."}
          </div>
        )}

        {messages.map((m) => {
          const isMe =
            (viewerRole === "coach" && m.sender_role !== "player") ||
            (viewerRole === "player" && m.sender_role === "player");

          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div
                className={[
                  "max-w-[80%] rounded-xl px-3 py-2",
                  isMe
                    ? "rounded-tr-sm bg-slate-800 text-white"
                    : "rounded-tl-sm bg-slate-100 text-slate-800",
                ].join(" ")}
              >
                {!isMe && (
                  <div className="text-[10px] font-medium mb-0.5 opacity-60">
                    {m.sender_role === "player" ? playerName : "Þjálfari"}
                  </div>
                )}
                <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                <div className={`text-[10px] mt-0.5 ${isMe ? "text-slate-400" : "text-slate-400"}`}>
                  {formatTime(m.created_at)}
                  {isMe && m.read_at && " · Lesið"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-0"
            placeholder={viewerRole === "coach" ? "Skrifa skilaboð til leikmanns..." : "Skrifa skilaboð til þjálfara..."}
            rows={compact ? 1 : 2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={!draft.trim() || sending}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-800 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? "..." : "Senda"}
          </button>
        </div>
      </div>
    </div>
  );
}
