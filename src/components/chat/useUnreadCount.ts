"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

export function useUnreadCount(
  playerId: string | null,
  viewerRole: "player" | "coach"
): number {
  const supabase = getSupabaseClient();
  const [count, setCount] = useState(0);

  // Fetch unread count
  const fetchUnreadCount = async () => {
    if (!playerId) {
      setCount(0);
      return;
    }

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setCount(0);
        return;
      }

      const res = await fetch(
        `/api/messages/unread-count?playerId=${playerId}&role=${viewerRole}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        setCount(0);
        return;
      }

      const data_response = await res.json();
      setCount(data_response.count ?? 0);
    } catch {
      setCount(0);
    }
  };

  // Initial fetch on mount and when playerId changes
  useEffect(() => {
    fetchUnreadCount();
  }, [playerId, viewerRole]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!playerId) return;

    const channel = supabase
      .channel(`unread-count-${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "player_coach_messages",
          filter: `player_id=eq.${playerId}`,
        },
        (payload: any) => {
          const msg = payload.new;
          // Increment if message is from the OTHER role
          if (
            (viewerRole === "player" && msg.sender_role !== "player") ||
            (viewerRole === "coach" && msg.sender_role === "player")
          ) {
            setCount((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, playerId, viewerRole]);

  return count;
}
