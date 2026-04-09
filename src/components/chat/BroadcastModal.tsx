"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

interface BroadcastModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
}

interface Player {
  id: string;
  full_name: string;
  status: string;
}

type SendState = "idle" | "sending" | "sent" | "error";

export default function BroadcastModal({
  open,
  onClose,
  teamId,
}: BroadcastModalProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Fetch players on mount when open
  useEffect(() => {
    if (!open) return;

    const fetchPlayers = async () => {
      try {
        setLoading(true);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from("players")
          .select("id, full_name, status")
          .eq("team_id", teamId)
          .eq("status", "ACTIVE")
          .order("full_name");

        if (error) throw error;
        setPlayers(data || []);
        setSelectedIds(new Set());
        setMessage("");
        setSendState("idle");
        setErrorMessage("");
      } catch (err) {
        console.error("Failed to fetch players:", err);
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, [open, teamId]);

  const handleSelectAll = () => {
    if (selectedIds.size === players.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(players.map((p) => p.id)));
    }
  };

  const handleTogglePlayer = (playerId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(playerId)) {
      newSelected.delete(playerId);
    } else {
      newSelected.add(playerId);
    }
    setSelectedIds(newSelected);
  };

  const handleSend = async () => {
    if (selectedIds.size === 0 || !message.trim()) return;

    try {
      setSendState("sending");
      setErrorMessage("");

      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        setSendState("error");
        setErrorMessage("Auth token not found");
        return;
      }

      const response = await fetch("/api/messages/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          playerIds: Array.from(selectedIds),
          body: message,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      setSendState("sent");
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      console.error("Failed to send broadcast:", err);
      setSendState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to send message"
      );
    }
  };

  if (!open) return null;

  const allSelected = players.length > 0 && selectedIds.size === players.length;
  const canSend = selectedIds.size > 0 && message.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-2xl bg-white shadow-xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900">Hópskilaboð</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Hleð inn leikmönnum...
            </div>
          ) : (
            <>
              {/* Select All Toggle */}
              <div className="mb-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 cursor-pointer"
                  />
                  <span className="font-medium text-gray-700">
                    {allSelected ? "Afvelja alla" : "Velja alla"}
                  </span>
                </label>
              </div>

              {/* Player List */}
              <div className="mb-4 max-h-60 overflow-y-auto border rounded-lg bg-gray-50">
                {players.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    Engir virkir leikmenn
                  </div>
                ) : (
                  <div className="divide-y">
                    {players.map((player) => (
                      <label
                        key={player.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(player.id)}
                          onChange={() => handleTogglePlayer(player.id)}
                          className="w-4 h-4 rounded border-gray-300 text-green-600 cursor-pointer"
                        />
                        <span className="text-gray-700">{player.full_name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Message Textarea */}
              <div className="mb-4">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Skrifa hópskilaboð..."
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Error Message */}
              {sendState === "error" && errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {errorMessage}
                </div>
              )}

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={!canSend || sendState === "sending"}
                className={`w-full rounded-xl px-4 py-3 font-medium text-white transition ${
                  sendState === "sent"
                    ? "bg-green-600"
                    : sendState === "error"
                      ? "bg-red-600"
                      : canSend
                        ? "bg-green-600 hover:bg-green-700 active:bg-green-800"
                        : "bg-gray-300 cursor-not-allowed"
                }`}
              >
                {sendState === "sending"
                  ? "Sendi..."
                  : sendState === "sent"
                    ? "Sent!"
                    : `Senda til ${selectedIds.size} leikmanna`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
